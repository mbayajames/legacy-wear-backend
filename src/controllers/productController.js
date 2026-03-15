// controllers/productController.js
// Product controller - handles all product-related operations
// Separates public (customer-facing) and admin (management) routes

const Product = require('../models/Product');        // Product model for database operations
const Category = require('../models/Category');      // Category model for category lookups
const AppError = require('../utils/AppError');       // Custom error class
const catchAsync = require('../utils/catchAsync');   // Wrapper to catch async errors
const APIFeatures = require('../utils/apiFeatures'); // Query builder for filtering, sorting, pagination

// ========== PUBLIC PRODUCT ROUTES ==========
// These routes are accessible to all users (no authentication required)

/**
 * Get all active products with filtering, sorting, and pagination
 * GET /api/products
 * Query params: ?page=1&limit=10&sort=-price&fields=name,price&category=categoryId
 * (Public)
 */
exports.getAllProducts = catchAsync(async (req, res) => {
  // Only show products with status 'active' to public (not drafts or archived)
  // Populate category information for frontend display
  const features = new APIFeatures(
    Product.find({ status: 'active' }).populate('category', 'name slug'),
    req.query
  )
    .filter()      // Filter by query params (e.g., ?category=id)
    .sort()        // Sort results (e.g., ?sort=-price for highest first)
    .limitFields() // Select specific fields (e.g., ?fields=name,price)
    .paginate();   // Paginate results (e.g., ?page=2&limit=20)
  
  const products = await features.query;
  
  // Get total count of active products for pagination metadata
  const total = await Product.countDocuments({ status: 'active' });
  
  res.status(200).json({
    status: 'success',
    results: products.length,  // Number in this page
    total,                      // Total available products
    data: { products }
  });
});

/**
 * Get single product by slug (URL-friendly name)
 * GET /api/products/:slug
 * Example: /api/products/classic-white-t-shirt
 * (Public)
 */
exports.getProduct = catchAsync(async (req, res, next) => {
  const product = await Product.findOne({ 
    slug: req.params.slug,
    status: 'active'  // Only show active products
  }).populate('category', 'name slug');  // Include category info
  
  if (!product) {
    return next(new AppError('No product found with that slug', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: { product }
  });
});

/**
 * Get product by ID (used internally by cart, admin, etc.)
 * GET /api/products/id/:id
 * Note: This route might need protection in production
 */
exports.getProductById = catchAsync(async (req, res, next) => {
  const product = await Product.findById(req.params.id);
  
  if (!product) {
    return next(new AppError('No product found with that ID', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: { product }
  });
});

/**
 * Search products with multiple filters
 * GET /api/products/search?q=shirt&category=men&minPrice=10&maxPrice=100&inStock=true
 * (Public)
 */
exports.searchProducts = catchAsync(async (req, res) => {
  const { q, category, minPrice, maxPrice, inStock } = req.query;
  
  // Build search query dynamically
  const query = {};
  
  // Text search on name/description/tags (if search term provided)
  if (q) {
    query.$text = { $search: q };  // MongoDB text search
  }
  
  // Filter by category slug (convert to category ID)
  if (category) {
    const categoryDoc = await Category.findOne({ slug: category });
    if (categoryDoc) {
      query.category = categoryDoc._id;
    }
  }
  
  // Price range filter
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = Number(minPrice);
    if (maxPrice) query.price.$lte = Number(maxPrice);
  }
  
  // In-stock filter
  if (inStock === 'true') {
    query.stock = { $gt: 0 };
  }
  
  // Only show active products
  query.status = 'active';
  
  // Execute search with appropriate sorting
  const products = await Product.find(query)
    .populate('category', 'name slug')
    .sort(q ? { score: { $meta: 'textScore' } } : '-createdAt'); 
    // If text search, sort by relevance; otherwise sort by newest
  
  res.status(200).json({
    status: 'success',
    results: products.length,
    data: { products }
  });
});

/**
 * Get featured products (for homepage)
 * GET /api/products/featured?limit=8
 * (Public)
 */
exports.getFeaturedProducts = catchAsync(async (req, res) => {
  const limit = req.query.limit || 10;
  
  // Use static method from Product model
  const products = await Product.getFeatured(limit);
  
  res.status(200).json({
    status: 'success',
    results: products.length,
    data: { products }
  });
});

/**
 * Get products on sale (for promotions)
 * GET /api/products/on-sale?limit=8
 * (Public)
 */
exports.getOnSaleProducts = catchAsync(async (req, res) => {
  const limit = req.query.limit || 10;
  
  // Use static method from Product model
  const products = await Product.getOnSale(limit);
  
  res.status(200).json({
    status: 'success',
    results: products.length,
    data: { products }
  });
});

/**
 * Get products by category slug
 * GET /api/products/category/:categorySlug
 * Example: /api/products/category/men-clothing
 * (Public)
 */
exports.getProductsByCategory = catchAsync(async (req, res, next) => {
  // Find category by slug
  const category = await Category.findOne({ slug: req.params.categorySlug });
  
  if (!category) {
    return next(new AppError('Category not found', 404));
  }
  
  // Build query for products in this category
  const features = new APIFeatures(
    Product.find({ 
      category: category._id,
      status: 'active' 
    }).populate('category', 'name slug'),
    req.query  // Allow filtering, sorting, pagination
  )
    .filter()
    .sort()
    .limitFields()
    .paginate();
  
  const products = await features.query;
  
  res.status(200).json({
    status: 'success',
    results: products.length,
    data: { 
      category,    // Include category info
      products 
    }
  });
});

/**
 * Get related products (same category, excluding current)
 * GET /api/products/:id/related
 * (Public)
 */
exports.getRelatedProducts = catchAsync(async (req, res, next) => {
  const product = await Product.findById(req.params.id);
  
  if (!product) {
    return next(new AppError('Product not found', 404));
  }
  
  // Find other products in same category
  const relatedProducts = await Product.find({
    category: product.category,
    _id: { $ne: product._id },  // Exclude current product
    status: 'active'
  })
    .limit(4)  // Limit to 4 related products
    .populate('category', 'name slug');
  
  res.status(200).json({
    status: 'success',
    results: relatedProducts.length,
    data: { products: relatedProducts }
  });
});

// ========== ADMIN PRODUCT ROUTES ==========
// These routes require authentication and admin privileges

/**
 * Create new product (Admin only)
 * POST /api/products
 * Body: { name, description, price, category, images, etc. }
 */
exports.createProduct = catchAsync(async (req, res, next) => {
  // Track who created this product
  req.body.createdBy = req.user.id;
  
  const product = await Product.create(req.body);
  
  res.status(201).json({
    status: 'success',
    data: { product }
  });
});

/**
 * Update existing product (Admin only)
 * PATCH /api/products/:id
 * Body: { name, price, stock, etc. } (any fields to update)
 */
exports.updateProduct = catchAsync(async (req, res, next) => {
  // Track who last updated this product
  req.body.updatedBy = req.user.id;
  
  const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true,              // Return updated document
    runValidators: true     // Validate new data
  });
  
  if (!product) {
    return next(new AppError('No product found with that ID', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: { product }
  });
});

/**
 * Delete product (Admin only)
 * DELETE /api/products/:id
 * Note: This permanently deletes the product
 */
exports.deleteProduct = catchAsync(async (req, res, next) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  
  if (!product) {
    return next(new AppError('No product found with that ID', 404));
  }
  
  res.status(204).json({
    status: 'success',
    data: null
  });
});

/**
 * Bulk create multiple products (Admin only)
 * POST /api/products/bulk
 * Body: { products: [{ name, price, ... }, { name, price, ... }] }
 */
exports.bulkCreateProducts = catchAsync(async (req, res, next) => {
  const products = req.body.products;
  
  // Validate input
  if (!Array.isArray(products) || products.length === 0) {
    return next(new AppError('Please provide an array of products', 400));
  }
  
  // Add createdBy to each product (audit trail)
  products.forEach(product => {
    product.createdBy = req.user.id;
  });
  
  // Insert all products at once (more efficient than individual creates)
  const createdProducts = await Product.insertMany(products);
  
  res.status(201).json({
    status: 'success',
    results: createdProducts.length,
    data: { products: createdProducts }
  });
});

/**
 * Bulk update multiple products (Admin only)
 * POST /api/products/bulk-update
 * Body: { productIds: [id1, id2], updates: { price: 29.99, isOnSale: true } }
 */
exports.bulkUpdateProducts = catchAsync(async (req, res, next) => {
  const { productIds, updates } = req.body;
  
  // Validate input
  if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
    return next(new AppError('Please provide an array of product IDs', 400));
  }
  
  // Track who performed the update
  updates.updatedBy = req.user.id;
  
  // Update all matching products
  const result = await Product.updateMany(
    { _id: { $in: productIds } },  // Match any of these IDs
    updates,                         // Apply these updates
    { runValidators: true }          // Validate data
  );
  
  res.status(200).json({
    status: 'success',
    data: {
      matched: result.matchedCount,   // Number of products found
      modified: result.modifiedCount   // Number actually changed
    }
  });
});

/**
 * Get product statistics by category (Admin only)
 * GET /api/products/stats
 * Returns: avg price, min/max price, total stock, total sold, avg rating per category
 */
exports.getProductStats = catchAsync(async (req, res) => {
  // Aggregation pipeline for detailed statistics
  const stats = await Product.aggregate([
    {
      // Group by category
      $group: {
        _id: '$category',
        totalProducts: { $sum: 1 },
        avgPrice: { $avg: '$price' },
        minPrice: { $min: '$price' },
        maxPrice: { $max: '$price' },
        totalStock: { $sum: '$stock' },
        totalSold: { $sum: '$soldCount' },
        avgRating: { $avg: '$ratingsAverage' }
      }
    },
    {
      // Join with categories collection to get category names
      $lookup: {
        from: 'categories',
        localField: '_id',
        foreignField: '_id',
        as: 'category'
      }
    },
    {
      // Unwind the category array (convert to object)
      $unwind: '$category'
    },
    {
      // Format the output
      $project: {
        category: '$category.name',
        totalProducts: 1,
        avgPrice: { $round: ['$avgPrice', 2] },  // Round to 2 decimals
        minPrice: 1,
        maxPrice: 1,
        totalStock: 1,
        totalSold: 1,
        avgRating: { $round: ['$avgRating', 1] }  // Round to 1 decimal
      }
    },
    {
      // Sort by most products first
      $sort: { totalProducts: -1 }
    }
  ]);
  
  res.status(200).json({
    status: 'success',
    data: { stats }
  });
});