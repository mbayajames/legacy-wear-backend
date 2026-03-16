// routes/orderRoutes.js
// Order routes - handles all order-related operations for customers and admins
// Implements role-based access control with different permission levels

const express = require('express');                          // Express router
const orderController = require('../controllers/orderController'); // Order controller
const { protect, restrictTo } = require('../middlewares/auth');  // Authentication middleware
const { validate } = require('../middlewares/validate');    // Input validation middleware
const { 
  createOrderValidator,
  updateOrderStatusValidator 
} = require('../utils/validators/orderValidator');           // Order validation schemas

const router = express.Router();

// ========== PUBLIC ROUTES ==========
// These routes are accessible without authentication

/**
 * @route   GET /api/orders/track/:orderNumber
 * @desc    Track order status by order number (no login required)
 * @access  Public
 * @params  { orderNumber } - e.g., LW-240315-0042
 */
router.get('/track/:orderNumber', orderController.trackOrder);

// ========== PROTECTED ROUTES (Authenticated users) ==========
/**
 * Apply authentication middleware to all routes below
 * These routes require a valid JWT token
 */
router.use(protect);

/**
 * @route   GET /api/orders/my-orders
 * @desc    Get current user's order history with pagination
 * @access  Private (authenticated users only)
 * @query   ?page=1&limit=10&sort=-placedAt
 */
router.get('/my-orders', orderController.getMyOrders);

/**
 * @route   GET /api/orders/my-orders/:id
 * @desc    Get specific order details for current user
 * @access  Private (authenticated users only)
 * @note    Users can only access their own orders
 */
router.get('/my-orders/:id', orderController.getMyOrder);

/**
 * @route   POST /api/orders
 * @desc    Create a new order from user's cart
 * @access  Private (authenticated users only)
 * @body    { shippingAddress, paymentMethod, notes }
 */
router.post(
  '/',
  validate(createOrderValidator),  // Validate order data
  orderController.createOrder
);

/**
 * @route   PATCH /api/orders/:id/cancel
 * @desc    Cancel an order (if eligible)
 * @access  Private (authenticated users only)
 * @note    Users can only cancel their own orders
 */
router.patch('/:id/cancel', orderController.cancelOrder);

// ========== ADMIN ONLY ROUTES ==========
/**
 * Apply role restriction middleware to all routes below
 * These routes require admin or super-admin privileges
 */
router.use(restrictTo('admin', 'super-admin'));

/**
 * @route   GET /api/orders
 * @desc    Get all orders with filtering, sorting, pagination
 * @access  Private (Admin only)
 * @query   ?status=pending&sort=-placedAt&page=1&limit=20
 */
router.get('/', orderController.getAllOrders);

/**
 * @route   GET /api/orders/stats/overview
 * @desc    Get order statistics and analytics
 * @access  Private (Admin only)
 * @query   ?startDate=2024-01-01&endDate=2024-03-31
 */
router.get('/stats/overview', orderController.getOrderStats);

/**
 * @route   GET /api/orders/:id
 * @desc    Get detailed order information by ID
 * @access  Private (Admin only)
 */
router.get('/:id', orderController.getOrder);

/**
 * @route   PATCH /api/orders/:id/status
 * @desc    Update order status (confirmed, processing, shipped, delivered, etc.)
 * @access  Private (Admin only)
 * @body    { status, note }
 */
router.patch(
  '/:id/status',
  validate(updateOrderStatusValidator),  // Validate status update
  orderController.updateOrderStatus
);

/**
 * @route   PATCH /api/orders/:id/shipping
 * @desc    Update shipping details (tracking number, carrier, etc.)
 * @access  Private (Admin only)
 * @body    { shippingStatus, trackingNumber, trackingUrl, estimatedDelivery }
 */
router.patch(
  '/:id/shipping',
  orderController.updateShippingStatus
);

module.exports = router;