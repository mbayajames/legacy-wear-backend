// controllers/reviewController.js
// Review controller - handles all product review operations for customers and admins
// Includes creating, updating, deleting reviews, moderation, and helpful/report features

const Review = require('../models/Review');           // Review model for database operations
const Product = require('../models/Product');         // Product model for product validation
const Order = require('../models/Order');             // Order model for verified purchase check
const AppError = require('../utils/AppError');        // Custom error class
const catchAsync = require('../utils/catchAsync');    // Async error wrapper
const APIFeatures = require('../utils/apiFeatures');  // Query builder for filtering, sorting, pagination

// ========== CREATE REVIEW ==========
/**
 * Create a new product review
 * POST /api/reviews
 * Body: { productId, rating, title, comment, images }
 * (Protected route - user must be logged in)
 */
exports.createReview = catchAsync(async (req, res, next) => {
  const { productId, rating, title, comment, images } = req.body;
  
  // ===== 1. VALIDATE PRODUCT EXISTS =====
  const product = await Product.findById(productId);
  if (!product) {
    return next(new AppError('Product not found', 404));
  }
  
  // ===== 2. PREVENT DUPLICATE REVIEWS =====
  // Users can only review a product once
  const existingReview = await Review.findOne({
    product: productId,
    user: req.user.id
  });
  
  if (existingReview) {
    return next(new AppError('You have already reviewed this product', 400));
  }
  
  // ===== 3. CHECK FOR VERIFIED PURCHASE =====
  // See if user has actually purchased and received this product
  const hasPurchased = await Order.exists({
    user: req.user.id,
    'items.product': productId,
    status: 'delivered'  // Only count delivered orders
  });
  
  // ===== 4. CREATE REVIEW =====
  const review = await Review.create({
    product: productId,
    user: req.user.id,
    rating,
    title,
    comment,
    images,
    isVerifiedPurchase: hasPurchased,  // Flag for verified badge
    status: 'pending'                   // New reviews need moderation
  });
  
  res.status(201).json({
    status: 'success',
    data: { review }
  });
});

// ========== GET PRODUCT REVIEWS ==========
/**
 * Get all approved reviews for a product with statistics
 * GET /api/reviews/product/:productId
 * Query params: ?page=1&limit=10&sort=-createdAt
 * (Public route)
 */
exports.getProductReviews = catchAsync(async (req, res, next) => {
  const { productId } = req.params;
  
  // ===== 1. GET PAGINATED REVIEWS =====
  const features = new APIFeatures(
    Review.find({ 
      product: productId,
      status: 'approved'  // Only show approved reviews
    }).populate('user', 'name avatar'),  // Include user info
    req.query
  )
    .sort('-createdAt')    // Newest first by default
    .limitFields()
    .paginate();
  
  const reviews = await features.query;
  
  // ===== 2. CALCULATE RATING DISTRIBUTION =====
  // How many 5-star, 4-star, etc. reviews
  const distribution = await Review.aggregate([
    { $match: { product: mongoose.Types.ObjectId(productId), status: 'approved' } },
    {
      $group: {
        _id: '$rating',      // Group by rating value (1-5)
        count: { $sum: 1 }    // Count reviews for each rating
      }
    },
    { $sort: { _id: 1 } }     // Sort by rating (1 to 5)
  ]);
  
  // ===== 3. CALCULATE OVERALL STATISTICS =====
  const stats = await Review.aggregate([
    { $match: { product: mongoose.Types.ObjectId(productId), status: 'approved' } },
    {
      $group: {
        _id: null,                      // Group all together
        averageRating: { $avg: '$rating' },  // Average rating
        totalReviews: { $sum: 1 }        // Total number of reviews
      }
    }
  ]);
  
  res.status(200).json({
    status: 'success',
    results: reviews.length,
    data: {
      reviews,
      stats: stats[0] || { averageRating: 0, totalReviews: 0 },  // Default if no reviews
      distribution
    }
  });
});

// ========== UPDATE REVIEW ==========
/**
 * Update user's own review
 * PATCH /api/reviews/:id
 * Body: { rating, title, comment, images }
 * (Protected route - user must own the review)
 */
exports.updateReview = catchAsync(async (req, res, next) => {
  // Find review that belongs to this user
  const review = await Review.findOne({
    _id: req.params.id,
    user: req.user.id  // Ensures user owns this review
  });
  
  if (!review) {
    return next(new AppError('Review not found or you do not own it', 404));
  }
  
  // Only allow updating specific fields
  const allowedFields = ['rating', 'title', 'comment', 'images'];
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      review[field] = req.body[field];
    }
  });
  
  // Reset status to pending for re-moderation
  // This prevents users from posting inappropriate content after approval
  review.status = 'pending';
  
  await review.save();
  
  res.status(200).json({
    status: 'success',
    data: { review }
  });
});

// ========== DELETE REVIEW ==========
/**
 * Delete user's own review
 * DELETE /api/reviews/:id
 * (Protected route - user must own the review)
 */
exports.deleteReview = catchAsync(async (req, res, next) => {
  const review = await Review.findOneAndDelete({
    _id: req.params.id,
    user: req.user.id  // Ensures user owns this review
  });
  
  if (!review) {
    return next(new AppError('Review not found or you do not own it', 404));
  }
  
  res.status(204).json({
    status: 'success',
    data: null
  });
});

// ========== MARK REVIEW HELPFUL ==========
/**
 * Increment helpful count for a review
 * POST /api/reviews/:id/helpful
 * (Public route - no auth needed for simplicity)
 */
exports.markHelpful = catchAsync(async (req, res, next) => {
  const review = await Review.findById(req.params.id);
  
  if (!review) {
    return next(new AppError('Review not found', 404));
  }
  
  // Increment helpful count
  review.helpfulCount += 1;
  await review.save();
  
  res.status(200).json({
    status: 'success',
    data: { helpfulCount: review.helpfulCount }
  });
});

// ========== REPORT REVIEW ==========
/**
 * Report a review as inappropriate
 * POST /api/reviews/:id/report
 * (Public route - anyone can report)
 */
exports.reportReview = catchAsync(async (req, res, next) => {
  const review = await Review.findById(req.params.id);
  
  if (!review) {
    return next(new AppError('Review not found', 404));
  }
  
  // Increment report count and flag for moderation
  review.reportedCount += 1;
  review.status = 'flagged';  // Flagged reviews need admin attention
  await review.save();
  
  res.status(200).json({
    status: 'success',
    message: 'Review reported successfully'
  });
});

// ========== ADMIN: GET ALL REVIEWS ==========
/**
 * Get all reviews (including pending and flagged)
 * GET /api/reviews
 * Query params: ?status=pending&sort=-createdAt
 * (Admin only)
 */
exports.getAllReviews = catchAsync(async (req, res) => {
  const features = new APIFeatures(
    Review.find()
      .populate('user', 'name email')        // Include user details
      .populate('product', 'name'),           // Include product details
    req.query
  )
    .filter()        // Filter by status, etc.
    .sort('-createdAt')
    .limitFields()
    .paginate();
  
  const reviews = await features.query;
  
  res.status(200).json({
    status: 'success',
    results: reviews.length,
    data: { reviews }
  });
});

// ========== ADMIN: MODERATE REVIEW ==========
/**
 * Approve, reject, or manage flagged reviews
 * PATCH /api/reviews/:id/moderate
 * Body: { status, moderationNote }
 * (Admin only)
 */
exports.moderateReview = catchAsync(async (req, res, next) => {
  const { status, moderationNote } = req.body;
  
  const review = await Review.findById(req.params.id);
  
  if (!review) {
    return next(new AppError('Review not found', 404));
  }
  
  // Update moderation fields
  review.status = status;
  review.moderatedBy = req.user.id;      // Track who moderated
  review.moderatedAt = new Date();        // When it was moderated
  
  if (moderationNote) {
    review.moderationNote = moderationNote;  // Reason for moderation
  }
  
  await review.save();
  
  res.status(200).json({
    status: 'success',
    data: { review }
  });
});

// ========== ADMIN: ADD SELLER RESPONSE ==========
/**
 * Add seller response to a review
 * POST /api/reviews/:id/respond
 * Body: { comment }
 * (Admin only - could also be seller role)
 */
exports.addSellerResponse = catchAsync(async (req, res, next) => {
  const { comment } = req.body;
  
  const review = await Review.findById(req.params.id);
  
  if (!review) {
    return next(new AppError('Review not found', 404));
  }
  
  // Add seller response
  review.sellerResponse = {
    comment,
    respondedBy: req.user.id,  // Admin/seller who responded
    respondedAt: new Date()
  };
  
  await review.save();
  
  res.status(200).json({
    status: 'success',
    data: { review }
  });
});

// ========== GET REVIEW STATS ==========
/**
 * Get overall review statistics for admin dashboard
 * GET /api/reviews/stats
 * (Admin only)
 */
exports.getReviewStats = catchAsync(async (req, res) => {
  // Stats by status
  const stats = await Review.aggregate([
    {
      $group: {
        _id: '$status',           // Group by status (pending, approved, etc.)
        count: { $sum: 1 },        // Count reviews in each status
        averageRating: { $avg: '$rating' }  // Average rating in each group
      }
    }
  ]);
  
  // Quick counts for dashboard
  const totalReviews = await Review.countDocuments();
  const pendingReviews = await Review.countDocuments({ status: 'pending' });
  const approvedReviews = await Review.countDocuments({ status: 'approved' });
  const flaggedReviews = await Review.countDocuments({ status: 'flagged' });
  
  res.status(200).json({
    status: 'success',
    data: {
      total: totalReviews,
      pending: pendingReviews,
      approved: approvedReviews,
      flagged: flaggedReviews,
      breakdown: stats
    }
  });
});