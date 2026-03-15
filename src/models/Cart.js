// models/Cart.js
// Shopping cart model for MongoDB - manages user carts, items, quantities, and pricing
// Supports both authenticated users and guest sessions with cart persistence

const mongoose = require('mongoose');  // MongoDB ODM for schema definition

/**
 * Cart Item Sub-Schema
 * Defines the structure of individual items within a cart
 * Each item represents a product with specific variant and quantity
 */
const cartItemSchema = new mongoose.Schema({
  // Reference to the product being added
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',  // Reference to Product model
    required: true
  },
  
  // Product variant selections (for products with options)
  variant: {
    size: String,   // e.g., 'M', 'L', 'XL'
    color: String   // e.g., 'Red', 'Blue'
  },
  
  // Quantity of this item
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Quantity cannot be less than 1'],  // Minimum 1 item
    max: [10, 'Quantity cannot exceed 10 per item'],  // Limit per item (prevents abuse)
    default: 1
  },
  
  // Price snapshot at time of adding to cart
  // Stored separately so price changes don't affect existing cart items
  price: {
    type: Number,
    required: true,
    min: [0, 'Price cannot be negative']
  },
  
  // Timestamp for when item was added (for sorting/expiry)
  addedAt: {
    type: Date,
    default: Date.now
  }
});

/**
 * Main Cart Schema
 * Represents a user's shopping cart with items and coupon application
 */
const cartSchema = new mongoose.Schema({
  // ========== USER ASSOCIATION ==========
  // Each cart belongs to exactly one user
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',  // Reference to User model
    required: true,
    unique: true,  // One cart per user
    index: true     // Fast lookup by user
  },
  
  // ========== CART ITEMS ==========
  // Array of cart items (embedded documents)
  items: [cartItemSchema],
  
  // ========== COUPON/DISCOUNT ==========
  // Applied coupon information
  coupon: {
    code: String,           // Coupon code (e.g., 'SAVE20')
    discountType: {
      type: String,
      enum: ['percentage', 'fixed']  // Type of discount
    },
    discountValue: Number,  // Value (percentage amount or fixed amount)
    appliedAt: Date         // When coupon was applied
  },
  
  // ========== GUEST CART SUPPORT ==========
  // For users who aren't logged in
  sessionId: {
    type: String,
    index: true,       // Fast lookup by session
    sparse: true       // Allows multiple null values (authenticated users)
  },
  
  // ========== CART EXPIRY ==========
  // Automatic cleanup of abandoned carts
  expiresAt: {
    type: Date,
    default: () => Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days from creation
    index: true        // For TTL index
  }
  
}, {
  // Schema options
  timestamps: true,                     // Auto-add createdAt/updatedAt
  toJSON: { virtuals: true },            // Include virtuals in JSON output
  toObject: { virtuals: true }            // Include virtuals in objects
});

// ========== INDEXES ==========
// Performance indexes for common queries
cartSchema.index({ user: 1 });                    // Primary lookup by user
cartSchema.index({ sessionId: 1 });                // Lookup guest carts by session
// TTL index - automatically delete expired carts
cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ========== VIRTUAL PROPERTIES ==========
// Computed fields that don't persist to database

/**
 * Calculate subtotal before discounts
 * Sum of (price * quantity) for all items
 * @returns {number} Cart subtotal
 */
cartSchema.virtual('subtotal').get(function() {
  return this.items.reduce((total, item) => {
    return total + (item.price * item.quantity);
  }, 0);
});

/**
 * Calculate discount amount based on coupon
 * @returns {number} Total discount to apply
 */
cartSchema.virtual('discountAmount').get(function() {
  if (!this.coupon) return 0;
  
  if (this.coupon.discountType === 'percentage') {
    // Percentage discount (e.g., 20% off)
    return this.subtotal * (this.coupon.discountValue / 100);
  } else {
    // Fixed amount discount (e.g., $10 off)
    // Can't discount more than subtotal
    return Math.min(this.coupon.discountValue, this.subtotal);
  }
});

/**
 * Calculate final total after discounts
 * @returns {number} Cart total
 */
cartSchema.virtual('total').get(function() {
  return this.subtotal - this.discountAmount;
});

/**
 * Total number of items (sum of quantities)
 * @returns {number} Total item count
 */
cartSchema.virtual('itemCount').get(function() {
  return this.items.reduce((count, item) => count + item.quantity, 0);
});

/**
 * Number of unique products (ignores quantity)
 * @returns {number} Unique item count
 */
cartSchema.virtual('uniqueItemCount').get(function() {
  return this.items.length;
});

// ========== INSTANCE METHODS ==========
// Methods available on each cart document

/**
 * Add item to cart or increment existing item quantity
 * @param {string} productId - ID of product to add
 * @param {number} quantity - Quantity to add (default: 1)
 * @param {Object} variant - Size/color variant (optional)
 * @returns {Promise<Object>} Updated cart
 */
cartSchema.methods.addItem = async function(productId, quantity = 1, variant = {}) {
  // Check if item with same product and variant already exists
  const existingItem = this.items.find(item => 
    item.product.toString() === productId.toString() &&
    item.variant?.size === variant.size &&
    item.variant?.color === variant.color
  );
  
  if (existingItem) {
    // Increment quantity if item exists
    existingItem.quantity += quantity;
  } else {
    // Add new item (price will be populated in pre-save)
    this.items.push({
      product: productId,
      quantity,
      variant,
      price: 0 // Temporary - will be set in pre-save middleware
    });
  }
  
  return this.save();  // Save triggers pre-save middleware
};

/**
 * Update quantity of specific cart item
 * @param {string} itemId - ID of cart item to update
 * @param {number} quantity - New quantity
 * @returns {Promise<Object>} Updated cart
 */
cartSchema.methods.updateItemQuantity = async function(itemId, quantity) {
  // Find item by its _id (using Mongoose .id() helper)
  const item = this.items.id(itemId);
  if (!item) throw new Error('Item not found in cart');
  
  item.quantity = quantity;
  return this.save();
};

/**
 * Remove specific item from cart
 * @param {string} itemId - ID of cart item to remove
 * @returns {Promise<Object>} Updated cart
 */
cartSchema.methods.removeItem = async function(itemId) {
  // Filter out the item to remove
  this.items = this.items.filter(item => 
    item._id.toString() !== itemId.toString()
  );
  return this.save();
};

/**
 * Remove all items from cart
 * @returns {Promise<Object>} Empty cart
 */
cartSchema.methods.clearCart = async function() {
  this.items = [];
  this.coupon = undefined;  // Remove any applied coupon
  return this.save();
};

/**
 * Apply coupon to cart
 * @param {Object} coupon - Coupon object with code, type, value
 * @returns {Promise<Object>} Updated cart with coupon
 */
cartSchema.methods.applyCoupon = async function(coupon) {
  this.coupon = {
    code: coupon.code,
    discountType: coupon.type,
    discountValue: coupon.value,
    appliedAt: Date.now()
  };
  return this.save();
};

/**
 * Remove coupon from cart
 * @returns {Promise<Object>} Cart without coupon
 */
cartSchema.methods.removeCoupon = async function() {
  this.coupon = undefined;
  return this.save();
};

// ========== PRE-SAVE MIDDLEWARE ==========
// Runs before saving a cart document

/**
 * Populate product prices for new items
 * Ensures cart items have current prices at time of addition
 */
cartSchema.pre('save', async function(next) {
  // Find items with temporary price (0) that need real pricing
  const itemsNeedingPrice = this.items.filter(item => item.price === 0);
  
  if (itemsNeedingPrice.length > 0) {
    // Get all product IDs from items needing pricing
    const productIds = itemsNeedingPrice.map(item => item.product);
    
    // Fetch products with their prices
    const products = await mongoose.model('Product').find({
      _id: { $in: productIds }
    }).select('price finalPrice');  // Only need price fields
    
    // Create map for quick lookup: productId -> price
    const productMap = products.reduce((map, product) => {
      // Use finalPrice if on sale, otherwise regular price
      map[product._id.toString()] = product.finalPrice || product.price;
      return map;
    }, {});
    
    // Set prices for items
    itemsNeedingPrice.forEach(item => {
      const productId = item.product.toString();
      if (productMap[productId]) {
        item.price = productMap[productId];
      }
    });
  }
  
  next();
});

// ========== STATIC METHODS ==========
// Methods available on the Cart model itself

/**
 * Get or create cart for user (handles guest cart transfer)
 * @param {string} userId - User ID (for authenticated users)
 * @param {string} sessionId - Session ID (for guest carts)
 * @returns {Promise<Object>} User's cart with populated items
 */
cartSchema.statics.getOrCreateCart = async function(userId, sessionId = null) {
  // Try to find existing cart for user
  let cart = await this.findOne({ user: userId });
  
  // If no user cart but guest session exists, transfer guest cart
  if (!cart && sessionId) {
    // Check for guest cart with this session
    cart = await this.findOne({ sessionId });
    if (cart) {
      // Transfer guest cart to user
      cart.user = userId;
      cart.sessionId = undefined;  // Remove session ID
      await cart.save();
    }
  }
  
  // If still no cart, create new one
  if (!cart) {
    cart = await this.create({ user: userId });
  }
  
  // Populate product details for all items
  return cart.populate('items.product');
};

// Create and export the Cart model
module.exports = mongoose.model('Cart', cartSchema);