// models/Payment.js
// Payment model for MongoDB - tracks all payment transactions across multiple gateways
// Supports M-Pesa, credit cards, bank transfers, and cash on delivery with full refund handling

const mongoose = require('mongoose');  // MongoDB ODM for schema definition

/**
 * Payment Schema Definition
 * Comprehensive payment tracking for all transaction types
 * Supports multiple payment methods, refunds, and status tracking
 */
const paymentSchema = new mongoose.Schema({
  // ========== RELATIONSHIPS ==========
  // Links to the order this payment is for
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',      // Reference to Order model
    required: true,     // Every payment belongs to an order
    index: true         // Fast lookup by order
  },
  
  // User who made the payment
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',       // Reference to User model
    required: true,
    index: true         // Fast lookup by user
  },
  
  // ========== PAYMENT DETAILS ==========
  // Core payment information
  amount: {
    type: Number,
    required: true,
    min: 0              // Amount must be non-negative
  },
  
  currency: {
    type: String,
    default: 'KES',     // Kenyan Shilling (default for local business)
    uppercase: true      // Normalize to uppercase
  },
  
  // Payment method used
  method: {
    type: String,
    enum: ['mpesa', 'card', 'bank-transfer', 'cash-on-delivery'],
    required: true
  },
  
  // Current status of the payment
  status: {
    type: String,
    enum: [
      'pending', 'processing', 'completed', 
      'failed', 'refunded', 'partially-refunded'
    ],
    default: 'pending',
    index: true          // Fast filtering by status
  },
  
  // ========== TRANSACTION IDs ==========
  // Generic transaction ID (for any payment method)
  transactionId: {
    type: String,
    unique: true,        // No duplicate transaction IDs
    sparse: true         // Allows multiple nulls (for pending payments)
  },
  
  // M-Pesa specific fields (Kenya's mobile money)
  mpesaReceipt: String,   // M-Pesa transaction receipt (e.g., 'NLJ7XX6K4L')
  mpesaPhone: String,     // Customer's phone number
  mpesaRequestId: String, // M-Pesa API request ID
  
  // Card payment specific fields (Stripe integration)
  cardLast4: String,       // Last 4 digits of card (for reference)
  cardBrand: String,       // Visa, Mastercard, etc.
  stripePaymentIntent: String,  // Stripe Payment Intent ID
  stripeChargeId: String,      // Stripe Charge ID
  
  // Bank transfer specific fields
  bankReference: String,   // Bank transaction reference
  
  // ========== TIMESTAMPS ==========
  // Key moments in payment lifecycle
  initiatedAt: {
    type: Date,
    default: Date.now      // When payment was first created
  },
  completedAt: Date,        // When payment succeeded
  failedAt: Date,           // When payment failed
  refundedAt: Date,         // When payment was refunded
  
  // ========== REFUND DETAILS ==========
  // Array of refunds (supports multiple partial refunds)
  refunds: [{
    amount: Number,                  // Amount refunded
    reason: String,                   // Why refunded (customer request, etc.)
    transactionId: String,             // Refund transaction ID
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'                      // Admin who processed refund
    },
    initiatedAt: {
      type: Date,
      default: Date.now                 // When refund was requested
    },
    completedAt: Date,                  // When refund was processed
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed']  // Refund status
    }
  }],
  
  // ========== METADATA ==========
  // Flexible field for gateway-specific data
  metadata: mongoose.Schema.Types.Mixed,
  
  // ========== ERROR HANDLING ==========
  errorMessage: String,    // Human-readable error
  errorCode: String,       // Machine-readable error code
  retryCount: {
    type: Number,
    default: 0              // Number of retry attempts
  }
  
}, {
  // Schema options
  timestamps: true  // Auto-add createdAt and updatedAt
});

// ========== INDEXES ==========
// Performance indexes for common queries
paymentSchema.index({ order: 1 });                    // Lookup payments by order
paymentSchema.index({ user: 1, createdAt: -1 });      // User's payment history
paymentSchema.index({ transactionId: 1 });            // Lookup by transaction ID
paymentSchema.index({ mpesaReceipt: 1 });             // Lookup by M-Pesa receipt
paymentSchema.index({ status: 1, createdAt: 1 });     // Filter by status and date

// ========== VIRTUAL PROPERTIES ==========
// Computed fields for easy status checking

/**
 * Check if payment is completed
 * @returns {boolean} True if payment succeeded
 */
paymentSchema.virtual('isCompleted').get(function() {
  return this.status === 'completed';
});

/**
 * Check if payment failed
 * @returns {boolean} True if payment failed
 */
paymentSchema.virtual('isFailed').get(function() {
  return this.status === 'failed';
});

/**
 * Check if payment was refunded
 * @returns {boolean} True if fully refunded
 */
paymentSchema.virtual('isRefunded').get(function() {
  return this.status === 'refunded';
});

// ========== INSTANCE METHODS ==========
// Methods available on each payment document

/**
 * Mark payment as completed successfully
 * Updates payment status and timestamps, then updates associated order
 * 
 * @param {Object} details - Payment completion details
 * @param {string} details.transactionId - Gateway transaction ID
 * @param {string} details.mpesaReceipt - M-Pesa receipt number
 * @param {string} details.stripePaymentIntent - Stripe payment intent ID
 * @returns {Promise<void>}
 */
paymentSchema.methods.markCompleted = async function(details = {}) {
  // Update payment record
  this.status = 'completed';
  this.completedAt = new Date();
  
  // Set gateway-specific fields if provided
  if (details.transactionId) this.transactionId = details.transactionId;
  if (details.mpesaReceipt) this.mpesaReceipt = details.mpesaReceipt;
  if (details.stripePaymentIntent) this.stripePaymentIntent = details.stripePaymentIntent;
  
  await this.save();  // Save payment changes
  
  // Update the associated order's payment status
  await mongoose.model('Order').findByIdAndUpdate(this.order, {
    paymentStatus: 'completed',
    'paymentDetails.transactionId': this.transactionId,
    'paymentDetails.mpesaReceipt': this.mpesaReceipt,
    'paymentDetails.paidAt': this.completedAt
  });
};

/**
 * Mark payment as failed
 * Records error details and updates order status
 * 
 * @param {Error} error - Error object from payment gateway
 * @returns {Promise<void>}
 */
paymentSchema.methods.markFailed = async function(error) {
  // Update payment record with error details
  this.status = 'failed';
  this.failedAt = new Date();
  this.errorMessage = error.message;  // Store error message
  this.errorCode = error.code;        // Store error code
  
  await this.save();  // Save payment changes
  
  // Update the associated order's payment status
  await mongoose.model('Order').findByIdAndUpdate(this.order, {
    paymentStatus: 'failed'
  });
};

/**
 * Process a refund for this payment
 * Supports full or partial refunds
 * 
 * @param {number} amount - Amount to refund (optional, defaults to full amount)
 * @param {string} reason - Reason for refund
 * @param {ObjectId} initiatedBy - User ID of admin processing refund
 * @returns {Promise<void>}
 */
paymentSchema.methods.refund = async function(amount, reason, initiatedBy) {
  const refundAmount = amount || this.amount;  // Default to full amount
  
  // Add refund record
  this.refunds.push({
    amount: refundAmount,
    reason,
    initiatedBy,
    status: 'pending'  // Refund starts as pending
  });
  
  // Update overall payment status based on refund amount
  if (refundAmount === this.amount) {
    this.status = 'refunded';           // Full refund
    this.refundedAt = new Date();
  } else {
    this.status = 'partially-refunded';  // Partial refund
  }
  
  await this.save();  // Save payment changes
  
  // If fully refunded, update the order
  if (refundAmount === this.amount) {
    await mongoose.model('Order').findByIdAndUpdate(this.order, {
      paymentStatus: 'refunded'
    });
  }
};

// Create and export the Payment model
module.exports = mongoose.model('Payment', paymentSchema);