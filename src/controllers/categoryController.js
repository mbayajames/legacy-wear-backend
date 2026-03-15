// controllers/categoryController.js
// Category controller - handles all category operations for both public viewing and admin management
// Supports hierarchical categories, featured categories, and category trees for navigation

const Category = require('../models/Category');        // Category model for database operations
const Product = require('../models/Product');          // Product model for product counts
const AppError = require('../utils/AppError');         // Custom error class
const catchAsync = require('../utils/catchAsync');     // Async error wrapper
const APIFeatures = require('../utils/apiFeatures');   // Query builder for filtering, sorting, pagination

// ========== PUBLIC ROUTES ==========
// These routes are accessible to all users (no authentication required)

/**
 * Get all active categories with hierarchical tree
 * GET /api/categories
 * Query params: ?sort=name&limit=10&page=1
 * (Public)
 */
exports.getAllCategories = catchAsync(async (req, res) => {
  // ===== 1. GET FLAT LIST OF ACTIVE CATEGORIES =====
  const features = new APIFeatures(
    Category.find({ isActive: true }),  // Only show active categories
    req.query
  )
    .sort('sortOrder name')              // Sort by sortOrder first, then name
    .limitFields()                        // Select specific fields if requested
    .paginate();                           // Paginate results

  const categories = await features.query;
  
  // ===== 2. BUILD HIERARCHICAL TREE FOR NAVIGATION =====
  const tree = await Category.buildTree();  // Static method from Category model

  res.status(200).json({
    status: 'success',
    results: categories.length,
    data: { 
      categories,   // Flat list (useful for dropdowns)
      tree          // Hierarchical tree (useful for navigation menus)
    }
  });
});

/**
 * Get single category by slug with its products
 * GET /api/categories/:slug
 * Example: /api/categories/men-clothing
 * (Public)
 */
exports.getCategory = catchAsync(async (req, res, next) => {
  // ===== 1. FIND CATEGORY BY SLUG =====
  const category = await Category.findOne({ 
    slug: req.params.slug,
    isActive: true                         // Only show if active
  }).populate('children');                  // Include subcategories

  if (!category) {
    return next(new AppError('No category found with that slug', 404));
  }

  // ===== 2. GET PRODUCTS IN THIS CATEGORY =====
  const products = await Product.find({ 
    category: category._id,
    status: 'active'                        // Only active products
  })
    .select('name slug price images ratingsAverage')  // Only needed fields
    .limit(20);                                          // Limit for performance

  res.status(200).json({
    status: 'success',
    data: { 
      category,
      products,
      productCount: products.length
    }
  });
});

/**
 * Get complete category tree (all nested categories)
 * GET /api/categories/tree
 * Useful for building navigation menus on the frontend
 * (Public)
 */
exports.getCategoryTree = catchAsync(async (req, res) => {
  const tree = await Category.buildTree();
  
  res.status(200).json({
    status: 'success',
    data: { tree }
  });
});

/**
 * Get featured categories (for homepage)
 * GET /api/categories/featured
 * (Public)
 */
exports.getFeaturedCategories = catchAsync(async (req, res) => {
  const categories = await Category.find({ 
    isActive: true,
    isFeatured: true                       // Only featured categories
  })
    .sort('sortOrder')                       // Respect custom sort order
    .limit(8);                                // Limit to 8 categories

  res.status(200).json({
    status: 'success',
    results: categories.length,
    data: { categories }
  });
});

// ========== ADMIN ROUTES ==========
// These routes require authentication and admin privileges

/**
 * Create new category
 * POST /api/categories
 * Body: { name, description, parent, image, icon, isFeatured, sortOrder }
 * (Admin only)
 */
exports.createCategory = catchAsync(async (req, res, next) => {
  const { name, description, parent, image, icon, isFeatured, sortOrder } = req.body;

  const category = await Category.create({
    name,
    description,
    parent: parent || null,                  // null means top-level category
    image,
    icon,
    isFeatured: isFeatured || false,
    sortOrder: sortOrder || 0
  });

  res.status(201).json({
    status: 'success',
    data: { category }
  });
});

/**
 * Update existing category
 * PATCH /api/categories/:id
 * Body: { name, description, parent, image, icon, isFeatured, isActive, sortOrder }
 * (Admin only)
 */
exports.updateCategory = catchAsync(async (req, res, next) => {
  const category = await Category.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }      // Return updated doc, validate changes
  );

  if (!category) {
    return next(new AppError('No category found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { category }
  });
});

/**
 * Delete category (with safety checks)
 * DELETE /api/categories/:id
 * (Admin only)
 */
exports.deleteCategory = catchAsync(async (req, res, next) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    return next(new AppError('No category found with that ID', 404));
  }

  // ===== SAFETY CHECKS - PREVENT ORPHANED DATA =====
  
  // Check if category has products
  const productCount = await Product.countDocuments({ category: category._id });
  if (productCount > 0) {
    return next(new AppError('Cannot delete category with products. Move or delete products first.', 400));
  }

  // Check if category has subcategories
  // Note: 'children' is a virtual field populated by the query
  if (category.children && category.children.length > 0) {
    return next(new AppError('Cannot delete category with subcategories. Delete subcategories first.', 400));
  }

  await category.remove();

  res.status(204).json({
    status: 'success',
    data: null
  });
});

/**
 * Bulk update multiple categories at once
 * POST /api/categories/bulk-update
 * Body: { updates: [{ id: "cat1", data: { isActive: false } }, ...] }
 * (Admin only)
 */
exports.bulkUpdateCategories = catchAsync(async (req, res, next) => {
  const { updates } = req.body;

  // Validate input
  if (!Array.isArray(updates) || updates.length === 0) {
    return next(new AppError('Please provide an array of updates', 400));
  }

  // Prepare bulk operations
  const operations = updates.map(update => ({
    updateOne: {
      filter: { _id: update.id },
      update: update.data
    }
  }));

  // Execute all updates in a single database operation
  const result = await Category.bulkWrite(operations);

  res.status(200).json({
    status: 'success',
    data: {
      matched: result.matchedCount,    // Number of documents found
      modified: result.modifiedCount    // Number actually modified
    }
  });
});

/**
 * Reorder categories (drag-and-drop sorting)
 * POST /api/categories/reorder
 * Body: { orders: [{ id: "cat1", sortOrder: 1 }, ...] }
 * (Admin only)
 */
exports.reorderCategories = catchAsync(async (req, res, next) => {
  const { orders } = req.body;

  if (!Array.isArray(orders)) {
    return next(new AppError('Please provide an array of category orders', 400));
  }

  // Update each category's sortOrder
  const operations = orders.map(({ id, sortOrder }) => ({
    updateOne: {
      filter: { _id: id },
      update: { sortOrder }
    }
  }));

  await Category.bulkWrite(operations);

  // Return updated list in correct order
  const categories = await Category.find().sort('sortOrder');

  res.status(200).json({
    status: 'success',
    data: { categories }
  });
});

/**
 * Get category statistics with product data
 * GET /api/categories/stats
 * Returns: product count, total value, average price per category
 * (Admin only)
 */
exports.getCategoryStats = catchAsync(async (req, res) => {
  const stats = await Category.aggregate([
    {
      // Join with products collection
      $lookup: {
        from: 'products',
        localField: '_id',
        foreignField: 'category',
        as: 'products'
      }
    },
    {
      // Calculate statistics for each category
      $project: {
        name: 1,
        slug: 1,
        isActive: 1,
        isFeatured: 1,
        productCount: { $size: '$products' },              // Number of products
        totalValue: {
          $sum: {
            $map: {
              input: '$products',
              as: 'product',
              in: { $multiply: ['$$product.price', '$$product.stock'] }  // Inventory value
            }
          }
        },
        averagePrice: { $avg: '$products.price' }           // Average product price
      }
    },
    { $sort: { productCount: -1 } }                          // Most products first
  ]);

  res.status(200).json({
    status: 'success',
    data: { stats }
  });
});