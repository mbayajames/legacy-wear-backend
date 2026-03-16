// routes/categoryRoutes.js
// Category routes - handles all category operations for public viewing and admin management
// Supports hierarchical categories, featured categories, and category tree navigation

const express = require('express');                          // Express router
const categoryController = require('../controllers/categoryController'); // Category controller
const { protect, restrictTo } = require('../middlewares/auth');  // Authentication middleware
const { validate } = require('../middlewares/validate');    // Input validation middleware
const { cache } = require('../middlewares/cache');          // Response caching middleware
const { 
  createCategoryValidator,
  updateCategoryValidator 
} = require('../utils/validators/categoryValidator');        // Category validation schemas

const router = express.Router();

// ========== PUBLIC ROUTES ==========
// These routes are accessible to all users (no authentication required)
// All public routes are cached for 1 hour (3600 seconds) to improve performance

/**
 * @route   GET /api/categories
 * @desc    Get all active categories with hierarchical tree
 * @access  Public
 * @cache   1 hour
 * @returns {Array} Flat list of categories + hierarchical tree
 */
router.get('/', cache(3600), categoryController.getAllCategories);

/**
 * @route   GET /api/categories/tree
 * @desc    Get complete category tree (all nested categories)
 * @access  Public
 * @cache   1 hour
 * @returns {Array} Hierarchical category structure for navigation
 */
router.get('/tree', cache(3600), categoryController.getCategoryTree);

/**
 * @route   GET /api/categories/featured
 * @desc    Get featured categories (for homepage)
 * @access  Public
 * @cache   1 hour
 * @returns {Array} Limited set of featured categories
 */
router.get('/featured', cache(3600), categoryController.getFeaturedCategories);

/**
 * @route   GET /api/categories/:slug
 * @desc    Get single category by slug with its products
 * @access  Public
 * @cache   1 hour
 * @params  { slug } - URL-friendly category identifier
 */
router.get('/:slug', cache(3600), categoryController.getCategory);

// ========== PROTECTED ROUTES (Admin only) ==========
// All routes below require authentication and admin privileges

/**
 * Apply authentication and authorization middleware to all routes below
 * This ensures only logged-in admins can access these endpoints
 */
router.use(protect);                          // Must be logged in
router.use(restrictTo('admin', 'super-admin')); // Must be admin or super-admin

/**
 * @route   POST /api/categories
 * @desc    Create a new category
 * @access  Private (Admin only)
 * @body    { name, description, parent, image, icon, isFeatured, sortOrder }
 */
router.post(
  '/',
  validate(createCategoryValidator),  // Validate category data
  categoryController.createCategory
);

/**
 * @route   PATCH /api/categories/:id
 * @desc    Update an existing category
 * @access  Private (Admin only)
 * @params  { id } - Category ID
 * @body    { name, description, parent, image, icon, isFeatured, isActive, sortOrder }
 */
router.patch(
  '/:id',
  validate(updateCategoryValidator),  // Validate update data
  categoryController.updateCategory
);

/**
 * @route   DELETE /api/categories/:id
 * @desc    Delete a category (with safety checks)
 * @access  Private (Admin only)
 * @params  { id } - Category ID
 * @warning Cannot delete categories with products or subcategories
 */
router.delete('/:id', categoryController.deleteCategory);

/**
 * @route   PATCH /api/categories/bulk/update
 * @desc    Bulk update multiple categories at once
 * @access  Private (Admin only)
 * @body    { updates: [{ id: "cat1", data: { isActive: false } }, ...] }
 */
router.patch('/bulk/update', categoryController.bulkUpdateCategories);

/**
 * @route   POST /api/categories/reorder
 * @desc    Reorder categories (drag-and-drop sorting)
 * @access  Private (Admin only)
 * @body    { orders: [{ id: "cat1", sortOrder: 1 }, ...] }
 */
router.post('/reorder', categoryController.reorderCategories);

/**
 * @route   GET /api/categories/stats/overview
 * @desc    Get category statistics with product data
 * @access  Private (Admin only)
 * @returns {Array} Product count, total value, average price per category
 */
router.get('/stats/overview', categoryController.getCategoryStats);

module.exports = router;