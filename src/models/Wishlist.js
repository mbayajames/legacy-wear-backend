// models/Wishlist.js
// Wishlist model for MongoDB - allows users to save products they're interested in for future purchase
// Features: Product saving with variant support, sharing capabilities, and notification preferences

const mongoose = require('mongoose');  // MongoDB ODM for schema definition
const crypto = require('crypto');      // Node.js crypto for generating secure share tokens

/**
 * Wishlist Schema Definition
 * Defines the structure of user wishlists in MongoDB
 * Each user has exactly one wishlist containing multiple saved products
 */
const wishlistSchema = new mongoose.Schema({
  // ========== USER ASSOCIATION ==========
  // Links the wishlist to a specific user account
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',        // Reference to User model
    required: true,      // Every wishlist must belong to a user
    unique: true,        // One wishlist per user (prevents multiple wishlists)
    index: true          // Fast lookup by user ID
  },
  
  // ========== WISHLIST ITEMS ==========
  // Array of products saved to the wishlist
  items: [{
    // Product reference
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',     // Reference to Product model
      required: true       // Each item must reference a product
    },
    
    // Product variant (for items with options like clothing)
    variant: {
      size: String,        // e.g., 'S', 'M', 'L', 'XL'
      color: String        // e.g., 'Red', 'Blue', 'Black'
    },
    
    // Timestamp of when item was added to wishlist
    addedAt: {
      type: Date,
      default: Date.now    // Automatically set to current time
    },
    
    // Personal notes about this item (e.g., "For mom's birthday")
    notes: String,
    
    // Notification preferences
    notifyOnPriceDrop: {
      type: Boolean,
      default: false       // User wants email when price decreases
    },
    
    notifyOnRestock: {
      type: Boolean,
      default: false       // User wants email when back in stock
    }
  }],
  
  // ========== WISHLIST SHARING ==========
  // Controls wishlist visibility and sharing
  isPublic: {
    type: Boolean,
    default: false         // Private by default for privacy
  },
  
  // Unique token for sharing wishlist via URL
  // e.g., legacywear.com/wishlist/share/abc123def456
  shareToken: String,
  
  // ========== WISHLIST METADATA ==========
  // Name of the wishlist (supports potential future multiple wishlists)
  name: {
    type: String,
    default: 'My Wishlist'  // Default name if user doesn't customize
  }
  
}, {
  // Schema options
  timestamps: true  // Automatically add and manage createdAt and updatedAt fields
});

// ========== INDEXES ==========
// Database indexes for query performance
wishlistSchema.index({ user: 1 });                    // Primary lookup by user
wishlistSchema.index({ shareToken: 1 }, { sparse: true });  // Lookup shared wishlists (sparse ignores null tokens)
wishlistSchema.index({ 'items.product': 1 });         // Find which wishlists contain a specific product

// ========== VIRTUAL PROPERTIES ==========
// Computed fields that don't get stored in the database

/**
 * Get total number of items in wishlist
 * @returns {number} Number of items
 */
wishlistSchema.virtual('itemCount').get(function() {
  return this.items.length;  // Simply return the length of the items array
});

// ========== INSTANCE METHODS ==========
// Methods available on each wishlist document instance

/**
 * Add an item to the wishlist
 * Prevents duplicate items (same product and variant)
 * 
 * @param {ObjectId} productId - ID of the product to add
 * @param {Object} variant - Size and color variant (optional)
 * @returns {Promise<Object>} Updated wishlist document
 */
wishlistSchema.methods.addItem = async function(productId, variant = {}) {
  // Check if item already exists in wishlist (same product and variant)
  const existingItem = this.items.find(item => 
    item.product.toString() === productId.toString() &&           // Compare product IDs
    item.variant?.size === variant.size &&                        // Compare size if exists
    item.variant?.color === variant.color                         // Compare color if exists
  );
  
  // Only add if it doesn't already exist (prevents duplicates)
  if (!existingItem) {
    this.items.push({
      product: productId,
      variant,
      addedAt: new Date()  // Set current timestamp
      // notes, notifyOnPriceDrop, notifyOnRestock use default values
    });
    await this.save();  // Persist changes to database
  }
  
  return this;  // Return wishlist for method chaining
};

/**
 * Remove an item from the wishlist
 * Removes based on product ID and variant
 * 
 * @param {ObjectId} productId - ID of the product to remove
 * @param {Object} variant - Size and color variant (optional)
 * @returns {Promise<Object>} Updated wishlist document
 */
wishlistSchema.methods.removeItem = async function(productId, variant = {}) {
  // Filter out items that match both product ID and variant
  this.items = this.items.filter(item => 
    !(item.product.toString() === productId.toString() &&         // Product matches
      item.variant?.size === variant.size &&                      // Size matches
      item.variant?.color === variant.color)                      // Color matches
  );
  
  await this.save();  // Persist changes to database
  return this;        // Return wishlist for method chaining
};

/**
 * Remove all items from the wishlist
 * @returns {Promise<Object>} Empty wishlist document
 */
wishlistSchema.methods.clearWishlist = async function() {
  this.items = [];      // Empty the items array
  await this.save();    // Persist changes to database
  return this;          // Return wishlist for method chaining
};

/**
 * Generate a unique share token for making the wishlist public
 * Uses crypto.randomBytes for cryptographically secure random string
 * 
 * @returns {string} Generated share token
 */
wishlistSchema.methods.generateShareToken = function() {
  // Generate 16 random bytes and convert to hexadecimal string
  // 16 bytes = 32 characters in hex (each byte = 2 hex chars)
  this.shareToken = crypto.randomBytes(16).toString('hex');
  
  // Note: This method doesn't auto-save - caller must call save()
  // Also doesn't auto-set isPublic to true - caller should do that
  return this.shareToken;
};

// Create and export the Wishlist model
module.exports = mongoose.model('Wishlist', wishlistSchema);