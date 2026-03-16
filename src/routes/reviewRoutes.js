// routes/reviewRoutes.js
// Review routes - handles all product review operations
// Supports nested routes under products (e.g., /api/products/:productId/reviews)
// Implements multi-level access control for public, authenticated users, and admins

const express = require('express');                          // Express router
const reviewController = require('../controllers/reviewController'); // Review controller
const { protect, restrictTo, optionalAuth } = require('../middlewares/auth'); // Auth middleware
const { validate } = require('../middlewares/validate');    // Input validation middleware
const { 
  createReviewValidator,
  updateReviewValidator 
} = require('../utils/validators/reviewValidator');         // Review validation schemas

// Create router with mergeParams: true to access productId from parent route
// This allows routes like /api/products/:productId/reviews
const router = express.Router({ mergeParams: true });

// ========== PUBLIC ROUTES ==========
// These routes are accessible without authentication

/**
 * @route   GET /api/products/:productId/reviews
 * @desc    Get all approved reviews for a specific product
 * @access  Public
 * @returns Reviews with user info and rating distribution
 */
router.get('/', reviewController.getProductReviews);

// ========== PROTECTED ROUTES (Authenticated users) ==========
// These routes require the user to be logged in (valid JWT token)

/**
 * @route   POST /api/products/:productId/reviews
 * @desc    Create a new review for a product
 * @access  Private (authenticated users only)
 * @body    { rating, title, comment, images }
 * @note    One review per user per product
 */
router.post(
  '/',
  protect,                              // Must be logged in
  validate(createReviewValidator),       // Validate review data
  reviewController.createReview
);

/**
 * @route   PATCH /api/reviews/:id
 * @desc    Update user's own review
 * @access  Private (authenticated users only)
 * @body    { rating, title, comment, images }
 * @note    Users can only update their own reviews
 */
router.patch(
  '/:id',
  protect,                              // Must be logged in
  validate(updateReviewValidator),       // Validate update data
  reviewController.updateReview
);

/**
 * @route   DELETE /api/reviews/:id
 * @desc    Delete user's own review
 * @access  Private (authenticated users only)
 * @note    Users can only delete their own reviews
 */
router.delete('/:id', protect, reviewController.deleteReview);

/**
 * @route   POST /api/reviews/:id/helpful
 * @desc    Mark a review as helpful (increment helpful count)
 * @access  Public (optional auth - tracks if user is logged in)
 * @note    No authentication required, but optional for analytics
 */
router.post('/:id/helpful', optionalAuth, reviewController.markHelpful);

/**
 * @route   POST /api/reviews/:id/report
 * @desc    Report a review as inappropriate
 * @access  Public (optional auth)
 * @note    Flags review for moderator attention
 */
router.post('/:id/report', optionalAuth, reviewController.reportReview);

// ========== ADMIN ONLY ROUTES ==========
// These routes require admin or super-admin privileges

/**
 * Apply role restriction middleware to all routes below
 * Only users with 'admin' or 'super-admin' roles can access
 */
router.use(restrictTo('admin', 'super-admin'));

/**
 * @route   GET /api/reviews/admin/all
 * @desc    Get all reviews (including pending and flagged)
 * @access  Private (Admin only)
 * @query   ?status=pending&sort=-createdAt&page=1
 */
router.get('/admin/all', reviewController.getAllReviews);

/**
 * @route   PATCH /api/reviews/:id/moderate
 * @desc    Moderate a review (approve, reject, etc.)
 * @access  Private (Admin only)
 * @body    { status, moderationNote }
 */
router.patch('/:id/moderate', reviewController.moderateReview);

/**
 * @route   POST /api/reviews/:id/respond
 * @desc    Add seller response to a review
 * @access  Private (Admin only)
 * @body    { comment }
 */
router.post('/:id/respond', reviewController.addSellerResponse);

/**
 * @route   GET /api/reviews/stats/overview
 * @desc    Get review statistics (total, pending, approved, etc.)
 * @access  Private (Admin only)
 */
router.get('/stats/overview', reviewController.getReviewStats);

module.exports = router;