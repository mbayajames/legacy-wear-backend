// routes/paymentRoutes.js
// Payment routes - handles all payment-related operations for M-Pesa and Stripe
// Includes public webhooks, customer payment endpoints, and admin refund management

const express = require('express');                          // Express router
const paymentController = require('../controllers/paymentController'); // Payment controller
const { protect, restrictTo } = require('../middlewares/auth');  // Authentication middleware
const { validate } = require('../middlewares/validate');    // Input validation middleware
const { 
  initiatePaymentValidator,
  mpesaPaymentValidator 
} = require('../utils/validators/paymentValidator');        // Payment validation schemas

const router = express.Router();

// ========== WEBHOOK ROUTES (Public - no auth) ==========
// These endpoints are called by external payment providers (Safaricom, Stripe)
// No authentication required - they use their own security mechanisms

/**
 * @route   POST /api/payments/mpesa/callback
 * @desc    M-Pesa payment callback/webhook
 * @access  Public (called by Safaricom API)
 * @note    Receives payment confirmation from M-Pesa after STK Push
 */
router.post('/mpesa/callback', paymentController.mpesaCallback);

/**
 * @route   POST /api/payments/stripe/webhook
 * @desc    Stripe webhook for payment events
 * @access  Public (called by Stripe API)
 * @note    Uses express.raw() to preserve raw body for signature verification
 * @note    Receives payment_intent.succeeded, payment_intent.failed, etc.
 */
router.post(
  '/stripe/webhook',
  express.raw({ type: 'application/json' }),  // Keep raw body for signature verification
  paymentController.stripeWebhook
);

// ========== PROTECTED ROUTES (Authenticated users) ==========
// These routes require the user to be logged in (valid JWT token)
router.use(protect);

/**
 * @route   POST /api/payments/mpesa/initiate
 * @desc    Initiate M-Pesa STK Push payment
 * @access  Private (authenticated users only)
 * @body    { orderId, phoneNumber }
 * @note    Sends payment request to customer's phone
 */
router.post(
  '/mpesa/initiate',
  validate(mpesaPaymentValidator),  // Validate phone number format
  paymentController.initiateMpesaPayment
);

/**
 * @route   POST /api/payments/stripe/create-intent
 * @desc    Create Stripe payment intent for card payments
 * @access  Private (authenticated users only)
 * @body    { orderId }
 * @note    Returns client_secret for frontend to complete payment
 */
router.post(
  '/stripe/create-intent',
  validate(initiatePaymentValidator),  // Validate order ID
  paymentController.createStripePaymentIntent
);

/**
 * @route   GET /api/payments/verify/:orderId
 * @desc    Verify payment status for an order
 * @access  Private (authenticated users only)
 * @params  { orderId }
 */
router.get('/verify/:orderId', paymentController.verifyPayment);

/**
 * @route   GET /api/payments/history
 * @desc    Get user's payment history
 * @access  Private (authenticated users only)
 */
router.get('/history', paymentController.getPaymentHistory);

// ========== ADMIN ONLY ROUTES ==========
// These routes require admin or super-admin privileges
router.use(restrictTo('admin', 'super-admin'));

/**
 * @route   GET /api/payments
 * @desc    Get all payments (admin view)
 * @access  Private (Admin only)
 * @query   ?status=completed&method=mpesa&sort=-createdAt
 */
router.get('/', paymentController.getAllPayments);

/**
 * @route   POST /api/payments/:paymentId/refund
 * @desc    Process refund for a payment
 * @access  Private (Admin only)
 * @params  { paymentId }
 * @body    { amount, reason }
 * @note    Supports full or partial refunds
 */
router.post('/:paymentId/refund', paymentController.processRefund);

module.exports = router;