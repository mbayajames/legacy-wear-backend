// routes/productRoutes.js
// Product routes - handles all product-related endpoints for both public viewing and admin management
// Includes caching, nested review routes, and role-based access control

const express = require('express');                          // Express router
const productController = require('../controllers/productController'); // Product controller
const reviewRoutes = require('./reviewRoutes');               // Nested review routes
const { protect, restrictTo } = require('../middlewares/auth');  // Authentication middleware
const { validate } = require('../middlewares/validate');    // Input validation middleware
const { cache } = require('../middlewares/cache');          // Response caching middleware
const { 
  createProductValidator,
  updateProductValidator 
} = require('../utils/validators/productValidator');        // Product validation schemas

const router = express.Router();

// ========== PUBLIC ROUTES ==========
// These routes are accessible to all users (no authentication required)
// All public routes are cached for 5 minutes (300 seconds) to improve performance

/**
 * @route   GET /api/products
 * @desc    Get all active products with filtering, sorting, pagination
 * @access  Public
 * @cache   5 minutes
 * @query   ?page=1&limit=10&sort=-price&category=cat123&fields=name,price
 */
router.get('/', cache(300), productController.getAllProducts);

/**
 * @route   GET /api/products/search
 * @desc    Search products with multiple filters
 * @access  Public
 * @cache   5 minutes
 * @query   ?q=shirt&category=men&minPrice=10&maxPrice=100&inStock=true
 */
router.get('/search', cache(300), productController.searchProducts);

/**
 * @route   GET /api/products/featured
 * @desc    Get featured products (for homepage)
 * @access  Public
 * @cache   5 minutes
 * @query   ?limit=8
 */
router.get('/featured', cache(300), productController.getFeaturedProducts);

/**
 * @route   GET /api/products/on-sale
 * @desc    Get products currently on sale
 * @access  Public
 * @cache   5 minutes
 * @query   ?limit=8
 */
router.get('/on-sale', cache(300), productController.getOnSaleProducts);

/**
 * @route   GET /api/products/slug/:slug
 * @desc    Get single product by URL-friendly slug
 * @access  Public
 * @cache   5 minutes
 * @example /api/products/slug/classic-white-t-shirt
 */
router.get('/slug/:slug', cache(300), productController.getProduct);

/**
 * @route   GET /api/products/category/:categorySlug
 * @desc    Get all products in a specific category
 * @access  Public
 * @cache   5 minutes
 * @example /api/products/category/mens-clothing
 */
router.get('/category/:categorySlug', cache(300), productController.getProductsByCategory);

/**
 * @route   GET /api/products/:id/related
 * @desc    Get related products (same category, excluding current)
 * @access  Public
 * @cache   5 minutes
 */
router.get('/:id/related', cache(300), productController.getRelatedProducts);

/**
 * @route   GET /api/products/:id
 * @desc    Get product by MongoDB ID (for internal use, e.g., cart)
 * @access  Public
 * @cache   5 minutes
 */
router.get('/:id', cache(300), productController.getProductById);

// ========== NESTED REVIEW ROUTES ==========
/**
 * Mount review routes under /api/products/:productId/reviews
 * This allows for nested resources like:
 * GET    /api/products/:productId/reviews
 * POST   /api/products/:productId/reviews
 * etc.
 */
router.use('/:productId/reviews', reviewRoutes);

// ========== PROTECTED ROUTES (Admin only) ==========
/**
 * Apply authentication and authorization middleware to all routes below
 * This ensures all subsequent routes require:
 * 1. Valid JWT token (protect)
 * 2. Admin or super-admin role (restrictTo)
 */
router.use(protect);
router.use(restrictTo('admin', 'super-admin'));

/**
 * @route   POST /api/products
 * @desc    Create a new product
 * @access  Private (Admin only)
 * @body    { name, description, price, category, images, ... }
 */
router.post(
  '/',
  validate(createProductValidator),  // Validate product data
  productController.createProduct
);

/**
 * @route   PATCH /api/products/:id
 * @desc    Update an existing product
 * @access  Private (Admin only)
 * @body    { name, price, stock, status, ... } (any fields to update)
 */
router.patch(
  '/:id',
  validate(updateProductValidator),  // Validate update data
  productController.updateProduct
);

/**
 * @route   DELETE /api/products/:id
 * @desc    Permanently delete a product
 * @access  Private (Admin only)
 * @warning This action cannot be undone!
 */
router.delete('/:id', productController.deleteProduct);

/**
 * @route   POST /api/products/bulk
 * @desc    Create multiple products at once
 * @access  Private (Admin only)
 * @body    { products: [{ name, price, ... }, ...] }
 */
router.post('/bulk', productController.bulkCreateProducts);

/**
 * @route   PATCH /api/products/bulk/update
 * @desc    Update multiple products at once
 * @access  Private (Admin only)
 * @body    { productIds: [id1, id2], updates: { price: 29.99, isOnSale: true } }
 */
router.patch('/bulk/update', productController.bulkUpdateProducts);

/**
 * @route   GET /api/products/stats/overview
 * @desc    Get product statistics (by category, averages, etc.)
 * @access  Private (Admin only)
 */
router.get('/stats/overview', productController.getProductStats);

module.exports = router;