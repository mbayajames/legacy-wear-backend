// models/Category.js
// Category model for MongoDB - manages product categories with hierarchical structure
// Supports nested categories, ancestry tracking, and category trees for navigation

const mongoose = require('mongoose');  // MongoDB ODM for schema definition

/**
 * Category Schema Definition
 * Defines the structure of product categories in MongoDB
 * Supports hierarchical categories (parent-child relationships) with ancestry tracking
 */
const categorySchema = new mongoose.Schema({
  // ========== BASIC INFO ==========
  // Core category identification
  name: {
    type: String,
    required: [true, 'Category name is required'],
    unique: true,        // No duplicate category names
    trim: true,          // Remove whitespace
    maxlength: [50, 'Category name cannot exceed 50 characters']
  },
  
  // URL-friendly version of the name
  slug: {
    type: String,
    unique: true,        // No duplicate slugs
    lowercase: true,     // Convert to lowercase for consistency
    index: true          // Fast lookup by slug
  },
  
  // Category description (for SEO and user information)
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  
  // ========== HIERARCHY ==========
  // Parent category (for nested categories)
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',      // Self-reference to same collection
    default: null,        // null means top-level category
    index: true           // Fast lookup of children
  },
  
  // Ancestry path - stores all ancestors for quick traversal
  // This denormalizes the hierarchy for performance
  ancestors: [{
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category'      // Reference to ancestor category
    },
    name: String,           // Ancestor name (denormalized)
    slug: String            // Ancestor slug (denormalized)
  }],
  
  // ========== MEDIA ==========
  // Category image/icon
  image: {
    url: String,           // Image URL (Cloudinary or local)
    publicId: String,      // Cloudinary public ID (for updates/deletion)
    alt: String            // Alt text for accessibility/SEO
  },
  
  icon: String,             // Font Awesome icon name or SVG path
  
  // ========== SEO ==========
  // Search engine optimization fields
  metaTitle: String,        // Custom title for search results
  metaDescription: String,  // Custom description for search results
  metaKeywords: [String],   // Keywords for search engines
  
  // ========== VISIBILITY ==========
  // Control category display
  isActive: {
    type: Boolean,
    default: true,          // Active by default
    index: true             // Filter active/inactive categories
  },
  
  isFeatured: {
    type: Boolean,
    default: false          // Not featured by default
  },
  
  // ========== SORTING ==========
  // Custom sort order for display
  sortOrder: {
    type: Number,
    default: 0              // Lower numbers appear first
  },
  
  // ========== STATISTICS ==========
  // Denormalized count of products in this category
  productCount: {
    type: Number,
    default: 0              // Updated periodically or via hooks
  }
  
}, {
  // Schema options
  timestamps: true,                     // Auto-add createdAt/updatedAt
  toJSON: { virtuals: true },            // Include virtuals in JSON
  toObject: { virtuals: true }            // Include virtuals in objects
});

// ========== INDEXES ==========
// Performance indexes for common queries
categorySchema.index({ slug: 1 });                    // Lookup by slug
categorySchema.index({ parent: 1, sortOrder: 1 });    // Get children in sort order
categorySchema.index({ isActive: 1, isFeatured: 1 }); // Filter active/featured

// ========== VIRTUAL PROPERTIES ==========
// Computed fields that don't persist to database

/**
 * Virtual populate for child categories
 * This creates a virtual field that loads all subcategories
 * Not stored in DB, populated on-demand
 */
categorySchema.virtual('children', {
  ref: 'Category',          // Model to use
  localField: '_id',         // Field in this schema
  foreignField: 'parent'     // Field in Category schema that references this
});

/**
 * Get full URL path for category
 * Combines all ancestor slugs with current slug
 * e.g., "men/clothing/shirts" for a "shirts" category under "men/clothing"
 * 
 * @returns {string} Full path string
 */
categorySchema.virtual('fullPath').get(function() {
  if (this.ancestors && this.ancestors.length > 0) {
    // Join all ancestor slugs with current slug
    const path = this.ancestors.map(a => a.slug).join('/');
    return `${path}/${this.slug}`;
  }
  // Top-level category
  return this.slug;
});

// ========== PRE-SAVE MIDDLEWARE ==========
// Runs before saving a category document

/**
 * Auto-generate slug and update ancestors before saving
 */
categorySchema.pre('save', async function(next) {
  // ===== Generate URL-friendly slug from name =====
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with hyphens
      .replace(/^-|-$/g, '');        // Remove leading/trailing hyphens
  }
  
  // ===== Update ancestors if parent changed =====
  if (this.isModified('parent') && this.parent) {
    // Fetch the parent category
    const parentCategory = await this.constructor.findById(this.parent);
    if (parentCategory) {
      // Build ancestors array: parent's ancestors + parent itself
      this.ancestors = [
        ...(parentCategory.ancestors || []),  // Parent's ancestors
        {
          _id: parentCategory._id,
          name: parentCategory.name,
          slug: parentCategory.slug
        }
      ];
    }
  }
  
  next();
});

// ========== STATIC METHODS ==========
// Methods available on the Category model itself

/**
 * Build a hierarchical tree of all categories
 * Useful for navigation menus, category selectors, etc.
 * 
 * @returns {Promise<Array>} Tree structure of categories
 */
categorySchema.statics.buildTree = async function() {
  // Load all categories with their children populated
  const categories = await this.find().populate('children');
  
  // Filter to get only top-level categories (no parent)
  const tree = categories.filter(c => !c.parent);
  
  /**
   * Recursive function to build tree node
   * @param {Object} category - Category to convert to node
   * @returns {Object} Category node with children
   */
  const buildNode = (category) => ({
    ...category.toObject(),  // Convert Mongoose document to plain object
    children: category.children ? 
      category.children.map(child => buildNode(child)) : []  // Recursively add children
  });
  
  // Build tree starting from top-level categories
  return tree.map(node => buildNode(node));
};

/**
 * Get active categories with product counts
 * Uses aggregation pipeline for efficient counting
 * 
 * @returns {Promise<Array>} Categories with product counts
 */
categorySchema.statics.getActiveWithProductCount = function() {
  return this.aggregate([
    // Step 1: Only include active categories
    { $match: { isActive: true } },
    
    // Step 2: Join with products collection
    {
      $lookup: {
        from: 'products',                 // Collection to join
        localField: '_id',                  // Field from categories
        foreignField: 'category',            // Field from products
        as: 'products'                       // Output array field
      }
    },
    
    // Step 3: Add product count field
    {
      $addFields: {
        productCount: { $size: '$products' }  // Count products in array
      }
    },
    
    // Step 4: Remove the products array (we only need the count)
    {
      $project: {
        products: 0  // Exclude products array from result
      }
    },
    
    // Step 5: Sort by sortOrder, then name
    { $sort: { sortOrder: 1, name: 1 } }
  ]);
};

// Create and export the Category model
module.exports = mongoose.model('Category', categorySchema);