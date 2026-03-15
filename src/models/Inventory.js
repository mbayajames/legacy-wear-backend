// models/Inventory.js
// Inventory model for MongoDB - manages product stock levels, movements, and reordering
// Tracks available, reserved, and total quantities with batch tracking and movement history

const mongoose = require('mongoose');  // MongoDB ODM for schema definition

/**
 * Inventory Schema Definition
 * Comprehensive inventory management system for tracking product stock
 * Supports quantity tracking, reservations, batch management, and movement history
 */
const inventorySchema = new mongoose.Schema({
  // ========== PRODUCT REFERENCE ==========
  // Links inventory to a specific product (one-to-one relationship)
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',      // Reference to Product model
    required: true,
    unique: true,        // One inventory record per product
    index: true           // Fast lookup by product
  },
  
  // Stock Keeping Unit - unique identifier for inventory tracking
  sku: {
    type: String,
    required: true,
    unique: true,        // No duplicate SKUs
    uppercase: true       // Normalize to uppercase
  },
  
  // ========== STOCK LEVELS ==========
  // Total physical stock in warehouse
  quantity: {
    type: Number,
    required: true,
    min: 0,               // Cannot have negative stock
    default: 0
  },
  
  // Stock reserved for pending orders (not yet shipped)
  reservedQuantity: {
    type: Number,
    default: 0,
    min: 0                // Cannot have negative reservations
  },
  
  // Stock available for sale (quantity - reservedQuantity)
  availableQuantity: {
    type: Number,
    default: 0
  },
  
  // Threshold for low stock alerts
  reorderPoint: {
    type: Number,
    default: 10,
    min: 0                // When stock falls below this, alert
  },
  
  // Recommended quantity to reorder when stock is low
  reorderQuantity: {
    type: Number,
    default: 20,
    min: 1                // Must reorder at least 1
  },
  
  // ========== WAREHOUSE LOCATION ==========
  // Physical location in warehouse
  location: {
    warehouse: String,     // Which warehouse
    aisle: String,         // Aisle number/letter
    shelf: String,         // Shelf identifier
    bin: String            // Specific bin location
  },
  
  // ========== BATCH TRACKING ==========
  // For products with expiry dates or batch-specific tracking
  batches: [{
    batchNumber: String,    // Supplier batch/lot number
    quantity: Number,       // Quantity in this batch
    expiryDate: Date,       // For perishable items
    receivedDate: Date,     // When batch was received
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier'       // Supplier for this batch
    },
    costPrice: Number        // Purchase cost for this batch
  }],
  
  // ========== MOVEMENT HISTORY ==========
  // Complete audit trail of all stock changes
  movements: [{
    type: {
      type: String,
      enum: [
        'received', 'sold', 'returned', 
        'damaged', 'adjusted', 'transferred'
      ]                     // Type of movement
    },
    quantity: Number,        // Change in quantity (positive or negative)
    previousQuantity: Number, // Stock before movement
    newQuantity: Number,      // Stock after movement
    reference: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'movements.referenceModel'  // Dynamic reference
    },
    referenceModel: {
      type: String,
      enum: ['Order', 'PurchaseOrder', 'Return', 'Adjustment']  // Collection name
    },
    note: String,            // Optional note about movement
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'            // Who performed the movement
    },
    performedAt: {
      type: Date,
      default: Date.now      // When movement occurred
    }
  }],
  
  // ========== LOW STOCK ALERT ==========
  // Track if alert has been sent to avoid spam
  lowStockAlertSent: {
    type: Boolean,
    default: false           // Whether alert has been sent
  },
  
  lastAlertSentAt: Date,      // When last alert was sent
  
  // ========== METADATA ==========
  notes: String,              // General inventory notes
  
  lastCountedAt: Date,        // Last physical count date
  countedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'               // Who performed the count
  }
  
}, {
  // Schema options
  timestamps: true  // Auto-add createdAt and updatedAt
});

// ========== INDEXES ==========
// Performance indexes for common queries
inventorySchema.index({ sku: 1 });                    // Lookup by SKU
inventorySchema.index({ 'location.warehouse': 1 });   // Filter by warehouse
inventorySchema.index({ quantity: 1 });                // Find items by stock level
inventorySchema.index({ reorderPoint: 1 });            // Find items needing reorder

// ========== VIRTUAL PROPERTIES ==========
// Computed fields that don't persist to database

/**
 * Check if stock is below reorder point
 * @returns {boolean} True if stock is low
 */
inventorySchema.virtual('isLowStock').get(function() {
  return this.availableQuantity <= this.reorderPoint;
});

/**
 * Check if product is out of stock
 * @returns {boolean} True if no stock available
 */
inventorySchema.virtual('isOutOfStock').get(function() {
  return this.availableQuantity <= 0;
});

/**
 * Check if reorder is needed and alert not yet sent
 * @returns {boolean} True if needs reorder alert
 */
inventorySchema.virtual('needsReorder').get(function() {
  return this.isLowStock && !this.lowStockAlertSent;
});

// ========== PRE-SAVE MIDDLEWARE ==========
// Runs before saving an inventory document

/**
 * Update available quantity before saving
 * availableQuantity = quantity - reservedQuantity
 */
inventorySchema.pre('save', function(next) {
  this.availableQuantity = this.quantity - this.reservedQuantity;
  next();
});

// ========== INSTANCE METHODS ==========
// Methods available on each inventory document

/**
 * Adjust stock quantity (add or remove)
 * Records movement and checks for low stock alerts
 * 
 * @param {number} quantity - Change in quantity (positive or negative)
 * @param {string} type - Type of movement
 * @param {ObjectId} reference - Reference document ID
 * @param {string} note - Optional note
 * @param {ObjectId} user - User performing adjustment
 * @returns {Promise<Object>} Updated inventory
 */
inventorySchema.methods.adjustStock = async function(quantity, type, reference, note, user) {
  const previousQuantity = this.quantity;
  
  // Update stock levels
  this.quantity += quantity;
  this.availableQuantity = this.quantity - this.reservedQuantity;
  
  // Record movement in history
  this.movements.push({
    type,
    quantity,
    previousQuantity,
    newQuantity: this.quantity,
    reference,
    note,
    performedBy: user,
    performedAt: new Date()
  });
  
  // Reset low stock alert if stock increased above reorder point
  if (quantity > 0 && this.quantity > this.reorderPoint) {
    this.lowStockAlertSent = false;
  }
  
  await this.save();  // Save changes
  
  // Check if low stock alert needs to be sent
  if (this.needsReorder) {
    this.lowStockAlertSent = true;
    this.lastAlertSentAt = new Date();
    await this.save();
    
    // Emit event for notification system
    // This could be handled by an event emitter or message queue
    this.emit('low-stock', {
      product: this.product,
      sku: this.sku,
      currentStock: this.availableQuantity,
      reorderPoint: this.reorderPoint
    });
  }
  
  return this;
};

/**
 * Reserve stock for an order
 * Prevents overselling by reserving items
 * 
 * @param {number} quantity - Quantity to reserve
 * @param {ObjectId} orderId - Order reserving stock
 * @returns {Promise<Object>} Updated inventory
 * @throws {Error} If insufficient stock
 */
inventorySchema.methods.reserveStock = async function(quantity, orderId) {
  // Check if enough stock available
  if (quantity > this.availableQuantity) {
    throw new Error('Insufficient stock available');
  }
  
  // Increase reserved quantity
  this.reservedQuantity += quantity;
  this.availableQuantity = this.quantity - this.reservedQuantity;
  
  await this.save();
  return this;
};

/**
 * Release reserved stock (e.g., order cancelled)
 * 
 * @param {number} quantity - Quantity to release
 * @param {ObjectId} orderId - Order releasing stock
 * @returns {Promise<Object>} Updated inventory
 */
inventorySchema.methods.releaseStock = async function(quantity, orderId) {
  // Decrease reserved quantity (cannot go below 0)
  this.reservedQuantity = Math.max(0, this.reservedQuantity - quantity);
  this.availableQuantity = this.quantity - this.reservedQuantity;
  
  await this.save();
  return this;
};

/**
 * Fulfill reserved stock (order completed)
 * Moves from reserved to sold, reducing actual quantity
 * 
 * @param {number} quantity - Quantity to fulfill
 * @param {ObjectId} orderId - Order being fulfilled
 * @returns {Promise<Object>} Updated inventory
 */
inventorySchema.methods.fulfillReserved = async function(quantity, orderId) {
  const releaseQuantity = Math.min(quantity, this.reservedQuantity);
  
  // Reduce actual stock and reserved stock
  this.quantity -= releaseQuantity;
  this.reservedQuantity -= releaseQuantity;
  this.availableQuantity = this.quantity - this.reservedQuantity;
  
  // Record sale in movements
  this.movements.push({
    type: 'sold',
    quantity: -releaseQuantity,
    previousQuantity: this.quantity + releaseQuantity,
    newQuantity: this.quantity,
    reference: orderId,
    referenceModel: 'Order',
    performedAt: new Date()
  });
  
  await this.save();
  return this;
};

// ========== STATIC METHODS ==========
// Methods available on the Inventory model itself

/**
 * Find all items with stock below reorder point
 * @returns {Promise<Array>} Low stock items with product details
 */
inventorySchema.statics.getLowStockItems = function() {
  return this.find({
    // Calculate availableQuantity and compare to reorderPoint
    $expr: {
      $lte: [
        { $subtract: ['$quantity', '$reservedQuantity'] },
        '$reorderPoint'
      ]
    }
  }).populate('product', 'name sku price');  // Include product details
};

/**
 * Find all out of stock items
 * @returns {Promise<Array>} Out of stock items with product details
 */
inventorySchema.statics.getOutOfStockItems = function() {
  return this.find({
    // Calculate availableQuantity and check if <= 0
    $expr: {
      $lte: [
        { $subtract: ['$quantity', '$reservedQuantity'] },
        0
      ]
    }
  }).populate('product', 'name sku price');
};

// Create and export the Inventory model
module.exports = mongoose.model('Inventory', inventorySchema);