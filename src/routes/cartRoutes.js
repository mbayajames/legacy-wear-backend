// routes/cartRoutes.js
// Shopping cart routes - handles cart operations for both authenticated and guest users
// Supports persistent carts for logged-in users and session-based carts for guests

const express = require('express');                          // Express router
const cartController = require('../controllers/cartController'); // Cart controller
const { protect, optionalAuth } = require('../middlewares/auth');  // Authentication middleware
const { validate } = require('../middlewares/validate');    // Input validation middleware
const { 
  addToCartValidator,
  updateCartValidator 
} = require('../utils/validators/cartValidator');           // Cart validation schemas

const router = express.Router();

// ========== CART ROUTES (Support both authenticated and guest users) ==========
// These routes work for both logged-in users (using JWT) and guests (using session ID)
// The optionalAuth middleware attaches user if authenticated, but doesn't require it

/**
 * @route   GET /api/cart
 * @desc    Get current user's cart (creates one if doesn't exist)
 * @access  Public (works with or without authentication)
 * @note    - Authenticated: cart tied to user ID
 *          - Guest: cart tied to session ID
 */
router.get('/', optionalAuth, cartController.getCart);

/**
 * @route   POST /api/cart/add
 * @desc    Add item to cart (or increment quantity if already exists)
 * @access  Public (works with or without authentication)
 * @body    { productId, quantity, variant: { size, color } }
 */
router.post(
  '/add',
  optionalAuth,                       // User may or may not be logged in
  validate(addToCartValidator),        // Validate input data
  cartController.addToCart
);

/**
 * @route   PATCH /api/cart/item/:itemId
 * @desc    Update quantity of a specific cart item
 * @access  Public (works with or without authentication)
 * @params  { itemId } - ID of the cart item to update
 * @body    { quantity }
 */
router.patch(
  '/item/:itemId',
  optionalAuth,                        // User may or may not be logged in
  validate(updateCartValidator),        // Validate quantity
  cartController.updateCartItem
);

/**
 * @route   DELETE /api/cart/item/:itemId
 * @desc    Remove a specific item from cart
 * @access  Public (works with or without authentication)
 * @params  { itemId } - ID of the cart item to remove
 */
router.delete(
  '/item/:itemId',
  optionalAuth,                        // User may or may not be logged in
  cartController.removeFromCart
);

/**
 * @route   DELETE /api/cart/clear
 * @desc    Remove all items from cart
 * @access  Public (works with or without authentication)
 */
router.delete('/clear', optionalAuth, cartController.clearCart);

/**
 * @route   POST /api/cart/apply-coupon
 * @desc    Apply a discount coupon to the cart
 * @access  Public (works with or without authentication)
 * @body    { couponCode }
 */
router.post(
  '/apply-coupon',
  optionalAuth,                        // User may or may not be logged in
  cartController.applyCoupon
);

/**
 * @route   DELETE /api/cart/remove-coupon
 * @desc    Remove applied coupon from cart
 * @access  Public (works with or without authentication)
 */
router.delete(
  '/remove-coupon',
  optionalAuth,                        // User may or may not be logged in
  cartController.removeCoupon
);

// ========== PROTECTED ROUTES (Authenticated users only) ==========
// These routes require the user to be logged in (valid JWT token)

/**
 * @route   POST /api/cart/merge
 * @desc    Merge guest cart with user cart after login
 * @access  Private (authenticated users only)
 * @note    Called automatically after login if user had items in guest cart
 */
router.post('/merge', protect, cartController.mergeCarts);

module.exports = router;