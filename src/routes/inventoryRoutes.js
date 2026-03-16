// routes/inventoryRoutes.js
// Inventory routes - handles all inventory management operations
// All routes are protected and restricted to admin/super-admin roles only

const express = require('express');                          // Express router
const inventoryController = require('../controllers/inventoryController'); // Inventory controller
const { protect, restrictTo } = require('../middlewares/auth');  // Authentication middleware
const { validate } = require('../middlewares/validate');    // Input validation middleware
const { 
  adjustStockValidator,
  initializeInventoryValidator 
} = require('../utils/validators/inventoryValidator');        // Inventory validation schemas

const router = express.Router();

// ========== ADMIN AUTHORIZATION ==========
/**
 * Apply authentication and role restriction to ALL routes in this file
 * Only users with 'admin' or 'super-admin' roles can access inventory management
 */
router.use(protect);                          // Must be logged in
router.use(restrictTo('admin', 'super-admin')); // Must be admin or super-admin

// ========== INVENTORY ROUTES ==========

/**
 * @route   GET /api/inventory
 * @desc    Get all inventory records with filtering and pagination
 * @access  Private (Admin only)
 * @query   ?page=1&limit=20&sort=-quantity&product=prod123
 */
router.get('/', inventoryController.getAllInventory);

/**
 * @route   GET /api/inventory/low-stock
 * @desc    Get all products with stock below reorder point
 * @access  Private (Admin only)
 * @returns {Array} Products needing reorder
 */
router.get('/low-stock', inventoryController.getLowStockItems);

/**
 * @route   GET /api/inventory/out-of-stock
 * @desc    Get all products with zero available stock
 * @access  Private (Admin only)
 * @returns {Array} Out of stock products
 */
router.get('/out-of-stock', inventoryController.getOutOfStockItems);

/**
 * @route   GET /api/inventory/product/:productId
 * @desc    Get inventory record for a specific product (creates if not exists)
 * @access  Private (Admin only)
 * @params  { productId } - Product ID
 */
router.get('/product/:productId', inventoryController.getProductInventory);

/**
 * @route   POST /api/inventory/product/:productId/initialize
 * @desc    Create initial inventory record for a product
 * @access  Private (Admin only)
 * @params  { productId } - Product ID
 * @body    { quantity, location }
 */
router.post(
  '/product/:productId/initialize',
  validate(initializeInventoryValidator),  // Validate quantity and location
  inventoryController.initializeInventory
);

/**
 * @route   PATCH /api/inventory/product/:productId/adjust
 * @desc    Adjust stock quantity for a product
 * @access  Private (Admin only)
 * @params  { productId } - Product ID
 * @body    { quantity, type, note }
 * @types   'received', 'sold', 'returned', 'damaged', 'adjusted', 'transferred'
 */
router.patch(
  '/product/:productId/adjust',
  validate(adjustStockValidator),  // Validate adjustment data
  inventoryController.adjustStock
);

/**
 * @route   POST /api/inventory/bulk-adjust
 * @desc    Adjust multiple products' stock at once
 * @access  Private (Admin only)
 * @body    { adjustments: [{ productId, quantity, type, note }, ...] }
 */
router.post('/bulk-adjust', inventoryController.bulkAdjustStock);

/**
 * @route   GET /api/inventory/product/:productId/movements
 * @desc    Get movement history for a specific product
 * @access  Private (Admin only)
 * @params  { productId } - Product ID
 * @query   ?limit=50&type=received
 */
router.get(
  '/product/:productId/movements',
  inventoryController.getInventoryMovements
);

/**
 * @route   PATCH /api/inventory/product/:productId/location
 * @desc    Update warehouse location for a product
 * @access  Private (Admin only)
 * @params  { productId } - Product ID
 * @body    { warehouse, aisle, shelf, bin }
 */
router.patch(
  '/product/:productId/location',
  inventoryController.updateLocation
);

/**
 * @route   POST /api/inventory/product/:productId/count
 * @desc    Perform physical inventory count and adjust if needed
 * @access  Private (Admin only)
 * @params  { productId } - Product ID
 * @body    { countedQuantity, note }
 */
router.post(
  '/product/:productId/count',
  inventoryController.countInventory
);

module.exports = router;