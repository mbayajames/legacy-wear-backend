// controllers/paymentController.js
// Payment controller - handles all payment operations for M-Pesa and Stripe
// Manages payment initiation, callbacks, webhooks, verification, and refunds

const Payment = require('../models/Payment');           // Payment model for database
const Order = require('../models/Order');               // Order model for order lookups
const stripe = require('../config/stripe');             // Configured Stripe instance
const mpesa = require('../config/mpesa');               // Configured M-Pesa instance
const AppError = require('../utils/AppError');          // Custom error class
const catchAsync = require('../utils/catchAsync');      // Async error wrapper
const { PAYMENT } = require('../config/key');           // Payment configuration

// ========== INITIATE MPESA PAYMENT ==========
/**
 * Initiate M-Pesa STK Push (payment request to customer's phone)
 * POST /api/payments/mpesa/initiate
 * Body: { orderId, phoneNumber }
 * (Protected route - user must be logged in)
 */
exports.initiateMpesaPayment = catchAsync(async (req, res, next) => {
  const { orderId, phoneNumber } = req.body;
  
  // ===== 1. VALIDATE ORDER =====
  const order = await Order.findById(orderId);
  if (!order) {
    return next(new AppError('Order not found', 404));
  }
  
  // Check if user owns this order (security)
  if (order.user.toString() !== req.user.id) {
    return next(new AppError('You do not own this order', 403));
  }
  
  // Check if payment already exists and is completed
  const existingPayment = await Payment.findOne({ order: orderId });
  if (existingPayment && existingPayment.status === 'completed') {
    return next(new AppError('Order already paid', 400));
  }
  
  // ===== 2. FORMAT PHONE NUMBER =====
  // Convert local format (07XXXXXXXX) to international format (254XXXXXXXX)
  const formattedPhone = phoneNumber.replace(/^0/, '254');
  
  // ===== 3. GET MPESA ACCESS TOKEN =====
  const token = await mpesa.getAccessToken();
  
  // ===== 4. PREPARE STK PUSH REQUEST =====
  const timestamp = mpesa.getTimestamp();                // Current time in YYYYMMDDHHmmss format
  const password = mpesa.generatePassword(timestamp);    // Base64 encoded password
  
  const stkPushData = {
    BusinessShortCode: mpesa.shortCode,                   // Paybill/Till number
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',             // Type of transaction
    Amount: Math.round(order.totalAmount),                 // Amount to charge
    PartyA: formattedPhone,                                // Customer's phone
    PartyB: mpesa.shortCode,                               // Business shortcode
    PhoneNumber: formattedPhone,                           // Customer's phone again
    CallBackURL: `${PAYMENT.MPESA.CALLBACK_URL}`,          // Where M-Pesa sends result
    AccountReference: order.orderNumber,                   // Your reference (shows on customer's phone)
    TransactionDesc: 'Payment for Legacy Wear order'       // Description
  };
  
  // ===== 5. MAKE STK PUSH REQUEST =====
  const response = await fetch(mpesa.urls.stkPush, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(stkPushData)
  });
  
  const result = await response.json();
  
  // ===== 6. HANDLE RESPONSE =====
  if (result.ResponseCode === '0') {
    // STK Push sent successfully
    let payment = await Payment.findOne({ order: orderId });
    
    if (!payment) {
      // Create new payment record
      payment = await Payment.create({
        order: orderId,
        user: req.user.id,
        amount: order.totalAmount,
        method: 'mpesa',
        status: 'processing',                    // Awaiting customer input on phone
        mpesaRequestId: result.MerchantRequestID, // M-Pesa request ID for tracking
        mpesaPhone: formattedPhone
      });
    } else {
      // Update existing payment
      payment.status = 'processing';
      payment.mpesaRequestId = result.MerchantRequestID;
      payment.mpesaPhone = formattedPhone;
      await payment.save();
    }
    
    res.status(200).json({
      status: 'success',
      message: 'STK Push sent. Please check your phone to complete payment.',
      data: {
        checkoutRequestId: result.CheckoutRequestID,  // For frontend tracking
        paymentId: payment._id
      }
    });
  } else {
    // STK Push failed
    return next(new AppError(result.ResponseDescription || 'M-Pesa payment failed', 400));
  }
});

// ========== MPESA CALLBACK ==========
/**
 * M-Pesa callback URL - receives payment confirmation from Safaricom
 * POST /api/payments/mpesa/callback
 * This is a public endpoint called by M-Pesa API
 */
exports.mpesaCallback = catchAsync(async (req, res) => {
  const callbackData = req.body;
  
  // Extract data from callback
  const { Body } = callbackData;
  
  // Check if payment was successful (ResultCode 0 = success)
  if (Body.stkCallback.ResultCode === 0) {
    // ===== PAYMENT SUCCESSFUL =====
    const { CheckoutRequestID, ResultDesc, CallbackMetadata } = Body.stkCallback;
    
    // Extract metadata from callback (M-Pesa sends array of items)
    const metadata = CallbackMetadata.Item.reduce((acc, item) => {
      acc[item.Name] = item.Value;
      return acc;
    }, {});
    
    // Find the payment record using M-Pesa request ID
    const payment = await Payment.findOne({ mpesaRequestId: CheckoutRequestID });
    
    if (payment) {
      // Mark payment as completed (this also updates the order)
      await payment.markCompleted({
        transactionId: metadata.TransactionId,
        mpesaReceipt: metadata.MpesaReceiptNumber,  // M-Pesa receipt number (for customer support)
        metadata: {
          phoneNumber: metadata.PhoneNumber,
          amount: metadata.Amount,
          transactionDate: metadata.TransactionDate
        }
      });
      
      console.log(`✅ Payment completed for order: ${payment.order}`);
    }
  } else {
    // ===== PAYMENT FAILED =====
    console.log('❌ M-Pesa payment failed:', Body.stkCallback.ResultDesc);
    
    const payment = await Payment.findOne({ 
      mpesaRequestId: Body.stkCallback.CheckoutRequestID 
    });
    
    if (payment) {
      // Mark payment as failed
      await payment.markFailed({
        message: Body.stkCallback.ResultDesc,
        code: Body.stkCallback.ResultCode
      });
    }
  }
  
  // Always return success to M-Pesa (prevents retries)
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Success' });
});

// ========== CREATE STRIPE PAYMENT INTENT ==========
/**
 * Create Stripe payment intent for card payments
 * POST /api/payments/stripe/create-intent
 * Body: { orderId }
 * (Protected route)
 */
exports.createStripePaymentIntent = catchAsync(async (req, res, next) => {
  const { orderId } = req.body;
  
  // ===== 1. VALIDATE ORDER =====
  const order = await Order.findById(orderId);
  if (!order) {
    return next(new AppError('Order not found', 404));
  }
  
  // Check if user owns this order
  if (order.user.toString() !== req.user.id) {
    return next(new AppError('You do not own this order', 403));
  }
  
  // ===== 2. CREATE STRIPE PAYMENT INTENT =====
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(order.totalAmount * 100), // Convert to cents (KES has 2 decimal places)
    currency: 'kes',                              // Kenyan Shilling
    metadata: {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      userId: req.user.id
    }
  });
  
  // ===== 3. CREATE PAYMENT RECORD =====
  const payment = await Payment.create({
    order: orderId,
    user: req.user.id,
    amount: order.totalAmount,
    method: 'card',
    status: 'processing',                         // Awaiting customer card entry
    stripePaymentIntent: paymentIntent.id,        // Stripe intent ID for reference
    metadata: {
      clientSecret: paymentIntent.client_secret   // Used by frontend to complete payment
    }
  });
  
  res.status(200).json({
    status: 'success',
    data: {
      clientSecret: paymentIntent.client_secret,  // Send to frontend for Stripe Elements
      paymentId: payment._id
    }
  });
});

// ========== STRIPE WEBHOOK ==========
/**
 * Stripe webhook - receives payment events from Stripe
 * POST /api/payments/stripe/webhook
 * This is a public endpoint called by Stripe API
 */
exports.stripeWebhook = catchAsync(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  
  // ===== 1. VERIFY WEBHOOK SIGNATURE =====
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET  // Secret from Stripe dashboard
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  // ===== 2. HANDLE DIFFERENT EVENT TYPES =====
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      
      // Find and update payment
      const payment = await Payment.findOne({ 
        stripePaymentIntent: paymentIntent.id 
      });
      
      if (payment) {
        await payment.markCompleted({
          transactionId: paymentIntent.id,
          stripeChargeId: paymentIntent.latest_charge  // Stripe charge ID
        });
      }
      break;
      
    case 'payment_intent.payment_failed':
      const failedIntent = event.data.object;
      
      const failedPayment = await Payment.findOne({ 
        stripePaymentIntent: failedIntent.id 
      });
      
      if (failedPayment) {
        await failedPayment.markFailed({
          message: failedIntent.last_payment_error?.message || 'Payment failed'
        });
      }
      break;
      
    default:
      console.log(`Unhandled event type ${event.type}`);
  }
  
  // Acknowledge receipt of webhook
  res.json({ received: true });
});

// ========== VERIFY PAYMENT ==========
/**
 * Check payment status for an order
 * GET /api/payments/verify/:orderId
 * (Protected route)
 */
exports.verifyPayment = catchAsync(async (req, res, next) => {
  const { orderId } = req.params;
  
  const payment = await Payment.findOne({ order: orderId })
    .populate('order');
  
  if (!payment) {
    return next(new AppError('Payment not found', 404));
  }
  
  // Check if user owns this payment
  if (payment.user.toString() !== req.user.id) {
    return next(new AppError('Unauthorized', 403));
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      payment: {
        id: payment._id,
        status: payment.status,
        method: payment.method,
        amount: payment.amount,
        completedAt: payment.completedAt,
        mpesaReceipt: payment.mpesaReceipt,
        transactionId: payment.transactionId
      },
      order: {
        id: payment.order._id,
        orderNumber: payment.order.orderNumber,
        status: payment.order.status
      }
    }
  });
});

// ========== GET PAYMENT HISTORY ==========
/**
 * Get user's payment history
 * GET /api/payments/history
 * (Protected route)
 */
exports.getPaymentHistory = catchAsync(async (req, res) => {
  const payments = await Payment.find({ user: req.user.id })
    .populate('order', 'orderNumber totalAmount status')
    .sort('-createdAt');  // Most recent first
  
  res.status(200).json({
    status: 'success',
    results: payments.length,
    data: { payments }
  });
});

// ========== ADMIN: GET ALL PAYMENTS ==========
/**
 * Get all payments (admin only)
 * GET /api/payments
 * (Admin only)
 */
exports.getAllPayments = catchAsync(async (req, res) => {
  const payments = await Payment.find()
    .populate('user', 'name email')
    .populate('order', 'orderNumber totalAmount')
    .sort('-createdAt');
  
  res.status(200).json({
    status: 'success',
    results: payments.length,
    data: { payments }
  });
});

// ========== ADMIN: PROCESS REFUND ==========
/**
 * Process refund for a payment (admin only)
 * POST /api/payments/:paymentId/refund
 * Body: { amount, reason }
 * (Admin only)
 */
exports.processRefund = catchAsync(async (req, res, next) => {
  const { paymentId } = req.params;
  const { amount, reason } = req.body;
  
  const payment = await Payment.findById(paymentId);
  
  if (!payment) {
    return next(new AppError('Payment not found', 404));
  }
  
  // Check if payment can be refunded
  if (payment.status !== 'completed') {
    return next(new AppError('Only completed payments can be refunded', 400));
  }
  
  // ===== PROCESS REFUND BASED ON PAYMENT METHOD =====
  if (payment.method === 'card' && payment.transactionId) {
    // Stripe refund
    const refund = await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntent,
      amount: amount ? Math.round(amount * 100) : undefined  // Partial refund if amount specified
    });
    
    // Update payment record with refund info
    await payment.refund(amount, reason, req.user.id);
    
  } else if (payment.method === 'mpesa' && payment.mpesaReceipt) {
    // M-Pesa refund logic (B2C or reversal)
    // This would integrate with Safaricom's B2C API
    // For now, just update the payment record
    await payment.refund(amount, reason, req.user.id);
  } else {
    return next(new AppError('Refund not available for this payment method', 400));
  }
  
  res.status(200).json({
    status: 'success',
    message: 'Refund processed successfully',
    data: { payment }
  });
});