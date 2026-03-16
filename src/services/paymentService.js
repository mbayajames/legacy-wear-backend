// services/paymentService.js
// Payment service - handles all payment processing logic for M-Pesa and Stripe
// Abstracts payment gateway operations from controllers for cleaner separation of concerns

const stripe = require('../config/stripe');           // Configured Stripe instance
const mpesa = require('../config/mpesa');             // Configured M-Pesa instance
const Payment = require('../models/Payment');         // Payment model for database
const Order = require('../models/Order');             // Order model for order data
const AppError = require('../utils/AppError');        // Custom error class
const { PAYMENT } = require('../config/key');         // Payment configuration

// ========== PROCESS MPESA PAYMENT ==========
/**
 * Initiate M-Pesa STK Push payment
 * 
 * @param {Object} order - Order object
 * @param {string} phoneNumber - Customer's phone number
 * @returns {Promise<Object>} Payment initiation result
 * @throws {AppError} If payment fails
 */
const processMpesaPayment = async (order, phoneNumber) => {
  try {
    // Get OAuth token from Safaricom API
    const token = await mpesa.getAccessToken();
    
    // Prepare STK Push request data
    const timestamp = mpesa.getTimestamp();                          // Current time in required format
    const password = mpesa.generatePassword(timestamp);              // Base64 encoded password
    
    const stkPushData = {
      BusinessShortCode: mpesa.shortCode,                            // Paybill/Till number
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',                       // Type of transaction
      Amount: Math.round(order.totalAmount),                          // Amount to charge
      PartyA: phoneNumber.replace(/^0/, '254'),                       // Customer's phone (format: 254XXXXXXXXX)
      PartyB: mpesa.shortCode,                                        // Business shortcode
      PhoneNumber: phoneNumber.replace(/^0/, '254'),                  // Customer's phone again
      CallBackURL: `${process.env.API_URL}/api/payments/mpesa/callback`, // Where M-Pesa sends result
      AccountReference: order.orderNumber,                            // Your reference (shows on customer's phone)
      TransactionDesc: 'Payment for Legacy Wear order'                // Description
    };
    
    // Send STK Push request to M-Pesa API
    const response = await fetch(mpesa.urls.stkPush, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(stkPushData)
    });
    
    const result = await response.json();
    
    // Check if request was successful (ResponseCode 0 = success)
    if (result.ResponseCode !== '0') {
      throw new AppError(result.ResponseDescription || 'M-Pesa payment failed', 400);
    }
    
    return {
      success: true,
      checkoutRequestId: result.CheckoutRequestID,  // For querying payment status
      merchantRequestId: result.MerchantRequestID    // M-Pesa's internal request ID
    };
  } catch (error) {
    console.error('M-Pesa payment error:', error);
    throw error;
  }
};

// ========== QUERY MPESA PAYMENT STATUS ==========
/**
 * Query M-Pesa for payment status (for debugging/verification)
 * 
 * @param {string} checkoutRequestId - M-Pesa checkout request ID
 * @returns {Promise<Object>} Payment status from M-Pesa
 */
const queryMpesaPaymentStatus = async (checkoutRequestId) => {
  try {
    const token = await mpesa.getAccessToken();
    const timestamp = mpesa.getTimestamp();
    const password = mpesa.generatePassword(timestamp);
    
    const queryData = {
      BusinessShortCode: mpesa.shortCode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId
    };
    
    const response = await fetch(mpesa.urls.query, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(queryData)
    });
    
    return await response.json();
  } catch (error) {
    console.error('M-Pesa query error:', error);
    throw error;
  }
};

// ========== PROCESS STRIPE PAYMENT ==========
/**
 * Process Stripe payment with payment method
 * 
 * @param {Object} order - Order object
 * @param {string} paymentMethodId - Stripe payment method ID
 * @returns {Promise<Object>} Payment intent details
 */
const processStripePayment = async (order, paymentMethodId) => {
  try {
    // Create payment intent in Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(order.totalAmount * 100), // Convert to cents (Stripe uses smallest currency unit)
      currency: PAYMENT.STRIPE.CURRENCY,            // e.g., 'kes', 'usd'
      payment_method: paymentMethodId,               // Payment method from frontend
      confirmation_method: 'manual',                  // We'll confirm manually
      confirm: true,                                   // Confirm immediately
      metadata: {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        userId: order.user.toString()
      }
    });
    
    return {
      success: true,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,     // For frontend to complete payment
      status: paymentIntent.status
    };
  } catch (error) {
    console.error('Stripe payment error:', error);
    throw error;
  }
};

// ========== PROCESS REFUND ==========
/**
 * Process refund for a payment
 * 
 * @param {Object} payment - Payment object
 * @param {number} amount - Amount to refund (optional, full refund if omitted)
 * @param {string} reason - Reason for refund
 * @returns {Promise<Object>} Refund details
 */
const processRefund = async (payment, amount, reason) => {
  try {
    // Handle Stripe refunds
    if (payment.method === 'stripe' && payment.stripePaymentIntent) {
      const refund = await stripe.refunds.create({
        payment_intent: payment.stripePaymentIntent,
        amount: amount ? Math.round(amount * 100) : undefined, // Partial refund if amount specified
        reason: reason || 'requested_by_customer'
      });
      
      return {
        success: true,
        refundId: refund.id,
        amount: refund.amount / 100,  // Convert back from cents
        status: refund.status
      };
    } 
    // Handle M-Pesa refunds
    else if (payment.method === 'mpesa' && payment.mpesaReceipt) {
      // M-Pesa refund requires B2C API (Business to Customer)
      // This would involve:
      // 1. Get access token
      // 2. Call B2C API to send money to customer
      // 3. Handle response
      console.log('M-Pesa refund not fully implemented yet');
      return {
        success: false,
        message: 'M-Pesa refund requires manual processing'
      };
    }
    
    throw new AppError('Refund not available for this payment method', 400);
  } catch (error) {
    console.error('Refund error:', error);
    throw error;
  }
};

// ========== VERIFY PAYMENT WEBHOOK ==========
/**
 * Verify Stripe webhook signature for security
 * 
 * @param {Buffer} payload - Raw request body
 * @param {string} signature - Stripe signature header
 * @param {string} secret - Webhook secret
 * @returns {Object|null} Verified event or null
 */
const verifyWebhookSignature = (payload, signature, secret) => {
  try {
    const event = stripe.webhooks.constructEvent(payload, signature, secret);
    return event;
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return null;
  }
};

// ========== CALCULATE PAYMENT TOTALS ==========
/**
 * Calculate payment totals including tax
 * 
 * @param {number} subtotal - Subtotal before tax/shipping/discount
 * @param {number} shipping - Shipping cost
 * @param {number} discount - Discount amount
 * @returns {Object} Calculated totals
 */
const calculatePaymentTotals = (subtotal, shipping = 0, discount = 0) => {
  const taxRate = PAYMENT.STRIPE.TAX_RATE;          // e.g., 0.16 for 16% VAT
  const taxAmount = subtotal * taxRate;              // Calculate tax
  const total = subtotal + shipping + taxAmount - discount;  // Final total
  
  return {
    subtotal,
    shipping,
    taxAmount,
    discount,
    total,
    taxRate
  };
};

// ========== FORMAT PAYMENT RESPONSE ==========
/**
 * Format payment object for API response
 * Removes sensitive/internal fields
 * 
 * @param {Object} payment - Payment document from database
 * @returns {Object} Formatted payment object
 */
const formatPaymentResponse = (payment) => {
  return {
    id: payment._id,
    amount: payment.amount,
    currency: payment.currency,
    method: payment.method,
    status: payment.status,
    transactionId: payment.transactionId,
    mpesaReceipt: payment.mpesaReceipt,
    cardLast4: payment.cardLast4,
    createdAt: payment.createdAt,
    completedAt: payment.completedAt
    // Note: We exclude internal fields like metadata, error messages, etc.
  };
};

module.exports = {
  processMpesaPayment,
  queryMpesaPaymentStatus,
  processStripePayment,
  processRefund,
  verifyWebhookSignature,
  calculatePaymentTotals,
  formatPaymentResponse
};