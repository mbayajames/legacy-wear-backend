// models/Order.js
// Order model for MongoDB - manages complete order lifecycle from placement to delivery
// Includes order items, pricing, payment, shipping, and status tracking

const mongoose = require('mongoose');  // MongoDB ODM for schema definition

/**
 * Order Item Sub-Schema
 * Defines the structure of individual items within an order
 * Unlike cart items, order items are immutable snapshots of purchased products
 */
const orderItemSchema = new mongoose.Schema({
  // Reference to the original product (for relationships)
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',  // Reference to Product model
    required: true
  },
  
  // Snapshot of product name at time of order (in case product name changes later)
  name: {
    type: String,
    required: true
  },
  
  // Quantity purchased
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  
  // Price paid per unit (snapshot - never changes)
  price: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Product variant selected (if applicable)
  variant: {
    size: String,   // e.g., 'M', 'L', 'XL'
    color: String   // e.g., 'Red', 'Blue'
  },
  
  // Product image at time of order (for receipts/invoices)
  image: String
});

/**
 * Shipping Address Sub-Schema
 * Captures delivery address details for the order
 * Separate from user profile so address can't be changed after order placement
 */
const shippingAddressSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String,
    required: true  // For delivery contact
  },
  addressLine1: {
    type: String,
    required: true  // Street address
  },
  addressLine2: String,  // Apartment, suite, etc.
  city: {
    type: String,
    required: true
  },
  county: {
    type: String,
    required: true  // For Kenyan counties
  },
  postalCode: String,  // Optional postal code
  country: {
    type: String,
    default: 'Kenya'  // Default to Kenya for local business
  }
});

/**
 * Main Order Schema
 * Represents a complete customer order with all related data
 * Immutable record of the transaction
 */
const orderSchema = new mongoose.Schema({
  // ========== ORDER IDENTIFICATION ==========
  // Human-readable unique order identifier
  orderNumber: {
    type: String,
    unique: true,    // No duplicate order numbers
    required: true,
    index: true       // Fast lookup by order number
  },
  
  // User who placed the order
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',      // Reference to User model
    required: true,
    index: true        // Fast lookup of user's orders
  },
  
  // ========== ORDER CONTENT ==========
  // Items purchased (embedded snapshots)
  items: [orderItemSchema],
  
  // ========== PRICING ==========
  // Detailed price breakdown
  subtotal: {
    type: Number,
    required: true,
    min: 0  // Sum of (price × quantity) for all items
  },
  
  shippingCost: {
    type: Number,
    default: 0,
    min: 0   // Delivery fee
  },
  
  taxAmount: {
    type: Number,
    default: 0,
    min: 0   // VAT/Sales tax
  },
  
  discountAmount: {
    type: Number,
    default: 0,
    min: 0   // Coupon/promotion discounts
  },
  
  totalAmount: {
    type: Number,
    required: true,
    min: 0   // subtotal + shipping + tax - discount
  },
  
  // ========== PAYMENT ==========
  // Payment method used
  paymentMethod: {
    type: String,
    enum: ['mpesa', 'card', 'bank-transfer', 'cash-on-delivery'],
    required: true
  },
  
  // Payment processing status
  paymentStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded'],
    default: 'pending',
    index: true  // For filtering by payment status
  },
  
  // Payment transaction details (varies by method)
  paymentDetails: {
    transactionId: String,      // Generic transaction ID
    mpesaReceipt: String,       // M-Pesa receipt number (e.g., 'NLJ7XX6K4L')
    cardLast4: String,          // Last 4 digits of card (for reference)
    paidAt: Date,               // When payment was completed
    paymentMetadata: mongoose.Schema.Types.Mixed  // Flexible for gateway-specific data
  },
  
  // ========== SHIPPING ==========
  // Where to send the order
  shippingAddress: {
    type: shippingAddressSchema,
    required: true
  },
  
  // Shipping speed
  shippingMethod: {
    type: String,
    enum: ['standard', 'express', 'pickup'],
    default: 'standard'
  },
  
  // Shipping fulfillment status
  shippingStatus: {
    type: String,
    enum: ['pending', 'processing', 'shipped', 'delivered', 'returned'],
    default: 'pending',
    index: true
  },
  
  // Tracking information
  trackingNumber: String,  // Courier tracking number
  trackingUrl: String,     // URL to track package
  estimatedDelivery: Date, // Expected delivery date
  deliveredAt: Date,       // Actual delivery date
  
  // ========== COUPON ==========
  // Coupon applied to this order (if any)
  couponApplied: {
    code: String,           // Coupon code used
    discountType: String,   // 'percentage' or 'fixed'
    discountValue: Number   // Amount/percentage
  },
  
  // ========== STATUS ==========
  // Overall order status
  status: {
    type: String,
    enum: [
      'pending', 'confirmed', 'processing', 
      'shipped', 'delivered', 'cancelled', 
      'refunded', 'disputed'
    ],
    default: 'pending',
    index: true
  },
  
  // Audit trail of status changes
  statusHistory: [{
    status: String,      // Status at this point
    note: String,        // Optional note about change
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'        // Who made the change (admin/customer)
    },
    changedAt: {
      type: Date,
      default: Date.now  // When change occurred
    }
  }],
  
  // ========== NOTES ==========
  customerNotes: String,  // Special instructions from customer
  adminNotes: String,      // Internal notes for staff
  
  // ========== TIMESTAMPS ==========
  // Key order milestones
  placedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  confirmedAt: Date,   // When order was confirmed
  processedAt: Date,   // When processing began
  shippedAt: Date,     // When shipped
  cancelledAt: Date,   // If cancelled
  
  // ========== METADATA ==========
  ipAddress: String,        // Customer IP for fraud detection
  userAgent: String,        // Browser/device info
  metadata: mongoose.Schema.Types.Mixed  // Flexible storage for additional data
  
}, {
  // Schema options
  timestamps: true,                     // Auto-add createdAt/updatedAt
  toJSON: { virtuals: true },            // Include virtuals in JSON
  toObject: { virtuals: true }            // Include virtuals in objects
});

// ========== INDEXES ==========
// Performance indexes for common queries
orderSchema.index({ orderNumber: 1 });                    // Lookup by order number
orderSchema.index({ user: 1, createdAt: -1 });            // User's orders, newest first
orderSchema.index({ paymentStatus: 1, shippingStatus: 1 }); // Combined status queries
orderSchema.index({ status: 1, placedAt: -1 });            // Orders by status and date
orderSchema.index({ 'paymentDetails.transactionId': 1 });  // Lookup by transaction ID

// ========== VIRTUAL PROPERTIES ==========
// Computed fields that don't persist to database

/**
 * Check if order is paid
 * @returns {boolean} True if payment completed
 */
orderSchema.virtual('isPaid').get(function() {
  return this.paymentStatus === 'completed';
});

/**
 * Check if order has shipped
 * @returns {boolean} True if shipped or delivered
 */
orderSchema.virtual('isShipped').get(function() {
  return ['shipped', 'delivered'].includes(this.shippingStatus);
});

/**
 * Check if order is delivered
 * @returns {boolean} True if delivered
 */
orderSchema.virtual('isDelivered').get(function() {
  return this.shippingStatus === 'delivered';
});

/**
 * Check if order can be cancelled
 * @returns {boolean} True if cancellation possible
 */
orderSchema.virtual('isCancellable').get(function() {
  // Can cancel if not yet shipped and not paid
  return ['pending', 'confirmed', 'processing'].includes(this.status) && 
         this.paymentStatus !== 'completed';
});

/**
 * Total number of items in order (sum of quantities)
 * @returns {number} Total item count
 */
orderSchema.virtual('itemsCount').get(function() {
  return this.items.reduce((count, item) => count + item.quantity, 0);
});

// ========== PRE-SAVE MIDDLEWARE ==========
// Runs before saving an order document

/**
 * Generate order number and track status changes
 */
orderSchema.pre('save', async function(next) {
  // ===== Generate unique order number if not exists =====
  if (!this.orderNumber) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);  // Last 2 digits of year
    const month = String(date.getMonth() + 1).padStart(2, '0');  // 2-digit month
    const day = String(date.getDate()).padStart(2, '0');  // 2-digit day
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');  // 4-digit random
    
    // Format: LW-YYMMDD-RANDOM (e.g., LW-240315-1234)
    this.orderNumber = `LW-${year}${month}${day}-${random}`;
  }
  
  // ===== Track status changes in history =====
  if (this.isModified('status')) {
    // Add entry to status history
    this.statusHistory.push({
      status: this.status,
      note: `Status changed to ${this.status}`,
      changedAt: new Date()
    });
    
    // Set specific milestone timestamps based on status
    switch(this.status) {
      case 'confirmed':
        this.confirmedAt = new Date();
        break;
      case 'processing':
        this.processedAt = new Date();
        break;
      case 'shipped':
        this.shippedAt = new Date();
        break;
      case 'delivered':
        this.deliveredAt = new Date();
        break;
      case 'cancelled':
        this.cancelledAt = new Date();
        break;
    }
  }
  
  next();
});

// ========== STATIC METHODS ==========
// Methods available on the Order model itself

/**
 * Find order by order number with populated references
 * @param {string} orderNumber - Order number to find
 * @returns {Query} Mongoose query object
 */
orderSchema.statics.findByOrderNumber = function(orderNumber) {
  return this.findOne({ orderNumber })
    .populate('user', 'name email')  // Include user name and email
    .populate('items.product', 'name images');  // Include product details
};

/**
 * Get paginated orders for a specific user
 * @param {string} userId - User ID
 * @param {number} page - Page number (1-based)
 * @param {number} limit - Items per page
 * @returns {Query} Mongoose query object
 */
orderSchema.statics.getUserOrders = function(userId, page = 1, limit = 10) {
  const skip = (page - 1) * limit;  // Calculate documents to skip
  
  return this.find({ user: userId })
    .sort('-placedAt')  // Newest first
    .skip(skip)
    .limit(limit)
    .populate('items.product', 'name images');  // Include product details
};

/**
 * Calculate sales statistics for a date range
 * @param {Date} startDate - Start of date range (optional)
 * @param {Date} endDate - End of date range (optional)
 * @returns {Promise<Array>} Aggregation results
 */
orderSchema.statics.getSalesStats = async function(startDate, endDate) {
  // Build date filter
  const match = {};
  if (startDate || endDate) {
    match.placedAt = {};
    if (startDate) match.placedAt.$gte = startDate;
    if (endDate) match.placedAt.$lte = endDate;
  }
  
  // MongoDB aggregation pipeline for sales stats
  return this.aggregate([
    // Filter by date range
    { $match: match },
    
    // Calculate totals
    {
      $group: {
        _id: null,  // Group all documents together
        totalOrders: { $sum: 1 },                       // Count orders
        totalRevenue: { $sum: '$totalAmount' },         // Sum of totals
        averageOrderValue: { $avg: '$totalAmount' },    // Average order value
        totalItems: { $sum: '$itemsCount' }             // Total items sold
      }
    }
  ]);
};

// Create and export the Order model
module.exports = mongoose.model('Order', orderSchema);