// models/Product.js
// Product model for MongoDB - defines the structure and behavior of product data
// Comprehensive e-commerce product schema with inventory, pricing, variants, and search capabilities

const mongoose = require('mongoose');  // MongoDB ODM for schema definition

/**
 * Product Schema Definition
 * Defines the structure of product documents in MongoDB
 * Includes comprehensive fields for e-commerce functionality
 */
const productSchema = new mongoose.Schema({
  // ========== BASIC INFO ==========
  // Core product identification fields
  name: {
    type: String,
    required: [true, 'Product name is required'],  // Custom error message
    trim: true,                                      // Remove whitespace
    maxlength: [100, 'Product name cannot exceed 100 characters'],
    index: true                                       // Index for faster searches
  },
  
  slug: {
    type: String,
    unique: true,        // Ensure unique slugs for URL-friendly product pages
    lowercase: true,      // Convert to lowercase for consistency
    index: true           // Index for faster lookups by slug
  },
  
  description: {
    type: String,
    required: [true, 'Product description is required'],
    maxlength: [2000, 'Description cannot exceed 2000 characters']  // Limit for database
  },
  
  shortDescription: {
    type: String,
    maxlength: [200, 'Short description cannot exceed 200 characters']  // For previews
  },
  
  // ========== PRICING ==========
  // All price-related fields with validation
  price: {
    type: Number,
    required: [true, 'Product price is required'],
    min: [0, 'Price cannot be negative'],
    set: v => Math.round(v * 100) / 100 // Ensure 2 decimal places (prevents floating point issues)
  },
  
  compareAtPrice: {
    type: Number,
    min: [0, 'Compare at price cannot be negative'],
    validate: {
      validator: function(value) {
        // Compare at price (original price) must be higher than current price
        return !value || value > this.price;
      },
      message: 'Compare at price must be greater than regular price'
    }
  },
  
  costPerItem: {
    type: Number,
    min: [0, 'Cost per item cannot be negative'],
    select: false // Hide from regular users (profit margin confidential)
  },
  
  // ========== INVENTORY ==========
  // Stock management fields
  stock: {
    type: Number,
    required: [true, 'Stock quantity is required'],
    min: [0, 'Stock cannot be negative'],
    default: 0  // Default to 0 if not specified
  },
  
  lowStockAlert: {
    type: Number,
    default: 5,  // Alert when stock falls below 5
    min: [1, 'Low stock alert must be at least 1']
  },
  
  sku: {
    type: String,
    unique: true,    // SKU must be unique
    sparse: true,    // Allows multiple null values
    uppercase: true  // Convert to uppercase for consistency
  },
  
  barcode: {
    type: String,
    unique: true,    // Barcode must be unique
    sparse: true     // Allows multiple null values
  },
  
  // ========== MEDIA ==========
  // Product images with Cloudinary integration
  images: [{
    url: {
      type: String,
      required: true  // Each image must have a URL
    },
    publicId: String, // Cloudinary public ID (for deletion/updates)
    alt: String,      // Alt text for accessibility/SEO
    isPrimary: {
      type: Boolean,
      default: false  // Which image is the main product image
    },
    order: {
      type: Number,
      default: 0      // Display order for gallery
    }
  }],
  
  // ========== CATEGORIZATION ==========
  // Taxonomies for organizing products
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',  // Reference to Category model
    required: [true, 'Product category is required'],
    index: true        // Index for category filtering
  },
  
  subcategory: {
    type: String,
    trim: true
  },
  
  tags: [{
    type: String,
    trim: true,
    lowercase: true   // Convert to lowercase for consistent filtering
  }],
  
  // ========== ATTRIBUTES ==========
  // Product specifications
  brand: {
    type: String,
    trim: true
  },
  
  sizes: [{
    type: String,
    enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL']  // Allowed sizes
  }],
  
  colors: [{
    name: String,     // Color name (e.g., "Red", "Blue")
    code: String,     // Hex color code (e.g., "#FF0000")
    image: String     // Optional variant-specific image
  }],
  
  materials: [String],  // Fabric/material composition
  
  weight: {
    value: Number,
    unit: {
      type: String,
      enum: ['g', 'kg', 'lb'],  // Allowed weight units
      default: 'g'
    }
  },
  
  // ========== RATINGS ==========
  // Aggregated review data
  ratingsAverage: {
    type: Number,
    default: 0,
    min: [0, 'Rating must be above 0'],
    max: [5, 'Rating must be below 5'],
    set: val => Math.round(val * 10) / 10 // Round to 1 decimal place (e.g., 4.5)
  },
  
  ratingsQuantity: {
    type: Number,
    default: 0  // Total number of ratings
  },
  
  // ========== SALES ==========
  // Sales and promotion fields
  soldCount: {
    type: Number,
    default: 0  // Total units sold (for popularity sorting)
  },
  
  isFeatured: {
    type: Boolean,
    default: false,
    index: true  // For featured product queries
  },
  
  isOnSale: {
    type: Boolean,
    default: false  // Calculated field, set by pre-save hook
  },
  
  discountPercentage: {
    type: Number,
    min: [0, 'Discount cannot be negative'],
    max: [100, 'Discount cannot exceed 100%'],
    validate: {
      validator: function(value) {
        return !value || (value > 0 && value <= 100);
      },
      message: 'Discount must be between 1 and 100'
    }
  },
  
  // ========== SEO ==========
  // Search engine optimization fields
  metaTitle: String,
  metaDescription: String,
  metaKeywords: [String],
  
  // ========== STATUS ==========
  // Product lifecycle management
  status: {
    type: String,
    enum: ['draft', 'active', 'archived'],  // Product states
    default: 'draft',
    index: true  // For filtering by status
  },
  
  publishedAt: Date,  // When product was first published
  
  // ========== AUDIT ==========
  // Track who created/updated the product
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'  // Reference to User model
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
  
}, {
  // Schema options
  timestamps: true,                     // Automatically add createdAt and updatedAt
  toJSON: { virtuals: true },            // Include virtuals when converting to JSON
  toObject: { virtuals: true }            // Include virtuals when converting to object
});

// ========== INDEXES ==========
// Database indexes for query performance
productSchema.index({ name: 'text', description: 'text', tags: 'text' });  // Text search index
productSchema.index({ price: 1 });                    // Sort/filter by price
productSchema.index({ createdAt: -1 });                // Sort by newest first
productSchema.index({ ratingsAverage: -1 });           // Sort by highest rated
productSchema.index({ soldCount: -1 });                // Sort by best selling
productSchema.index({ category: 1, status: 1 });       // Combined category+status filter
productSchema.index({ 'sizes': 1 });                    // Filter by size
productSchema.index({ 'colors.name': 1 });              // Filter by color

// ========== VIRTUAL PROPERTIES ==========
// Computed fields that don't persist to database

/**
 * Calculate final price after discount
 * @returns {number} Price after applying discount
 */
productSchema.virtual('finalPrice').get(function() {
  if (this.isOnSale && this.discountPercentage) {
    return this.price * (1 - this.discountPercentage / 100);
  }
  return this.price;
});

/**
 * Check if product is in stock
 * @returns {boolean} True if stock > 0
 */
productSchema.virtual('inStock').get(function() {
  return this.stock > 0;
});

/**
 * Check if product stock is low
 * @returns {boolean} True if stock <= lowStockAlert and > 0
 */
productSchema.virtual('lowStock').get(function() {
  return this.stock > 0 && this.stock <= this.lowStockAlert;
});

/**
 * Check if product is out of stock
 * @returns {boolean} True if stock === 0
 */
productSchema.virtual('outOfStock').get(function() {
  return this.stock === 0;
});

/**
 * Get primary product image
 * @returns {Object} Primary image or first image
 */
productSchema.virtual('primaryImage').get(function() {
  const primary = this.images.find(img => img.isPrimary);
  return primary || this.images[0];  // Fallback to first image
});

// ========== PRE-SAVE MIDDLEWARE ==========
// Middleware that runs before saving a document

/**
 * Auto-generate fields before saving
 */
productSchema.pre('save', function(next) {
  // ===== Generate URL-friendly slug from name =====
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with hyphens
      .replace(/^-|-$/g, '');        // Remove leading/trailing hyphens
  }
  
  // ===== Auto-set isOnSale based on discount =====
  if (this.discountPercentage && this.discountPercentage > 0) {
    this.isOnSale = true;
  } else {
    this.isOnSale = false;
  }
  
  // ===== Set published date when product becomes active =====
  if (this.isModified('status') && this.status === 'active' && !this.publishedAt) {
    this.publishedAt = Date.now();  // Record publication time
  }
  
  next();
});

// ========== STATIC METHODS ==========
// Methods available on the Product model itself

/**
 * Search products by text query
 * @param {string} query - Search text
 * @param {Object} filters - Additional filters (category, etc.)
 * @returns {Query} Mongoose query object
 */
productSchema.statics.search = function(query, filters = {}) {
  const searchQuery = query ? {
    $text: { $search: query }  // Use MongoDB text search
  } : {};
  
  // Only return active products
  return this.find({ ...searchQuery, ...filters, status: 'active' });
};

/**
 * Get featured products
 * @param {number} limit - Maximum number to return
 * @returns {Query} Mongoose query object
 */
productSchema.statics.getFeatured = function(limit = 10) {
  return this.find({ 
    isFeatured: true, 
    status: 'active',
    stock: { $gt: 0 }  // Only in-stock products
  })
  .populate('category', 'name slug')  // Include category data
  .limit(limit)
  .sort('-createdAt');  // Newest first
};

/**
 * Get products on sale
 * @param {number} limit - Maximum number to return
 * @returns {Query} Mongoose query object
 */
productSchema.statics.getOnSale = function(limit = 10) {
  return this.find({ 
    isOnSale: true, 
    status: 'active',
    stock: { $gt: 0 }  // Only in-stock products
  })
  .populate('category', 'name slug')
  .limit(limit)
  .sort('-discountPercentage');  // Highest discount first
};

// Create and export the Product model
module.exports = mongoose.model('Product', productSchema);