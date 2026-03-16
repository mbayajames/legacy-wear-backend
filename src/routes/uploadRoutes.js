// routes/uploadRoutes.js
// Upload routes - handles all file upload operations with different strategies
// Includes rate limiting, file validation, and role-based access control

const express = require('express');                          // Express router
const uploadController = require('../controllers/uploadController'); // Upload controller
const { protect, restrictTo } = require('../middlewares/auth');  // Authentication middleware
const upload = require('../middlewares/upload');             // Multer upload configuration
const rateLimiter = require('../middlewares/rateLimiter');   // Rate limiting middleware

const router = express.Router();

// ========== BASE AUTHENTICATION ==========
/**
 * Apply authentication to all upload routes
 * Users must be logged in to upload files (prevents anonymous uploads)
 */
router.use(protect);

// ========== GENERAL UPLOADS ==========
// Routes for general-purpose image uploads

/**
 * @route   POST /api/upload/image
 * @desc    Upload a single image (general purpose)
 * @access  Private (authenticated users only)
 * @body    multipart/form-data with field 'image'
 * @limiter 50 uploads per hour per user
 */
router.post(
  '/image',
  rateLimiter.uploadLimiter,          // Limit upload frequency
  upload.single('image'),              // Accept single file with field name 'image'
  uploadController.uploadImage
);

/**
 * @route   POST /api/upload/images
 * @desc    Upload multiple images at once
 * @access  Private (authenticated users only)
 * @body    multipart/form-data with field 'images' (multiple files)
 * @limiter 50 uploads per hour per user
 * @max     10 files per request
 */
router.post(
  '/images',
  rateLimiter.uploadLimiter,           // Limit upload frequency
  upload.array('images', 10),           // Accept up to 10 files with field name 'images'
  uploadController.uploadMultipleImages
);

/**
 * @route   DELETE /api/upload/image/:publicId
 * @desc    Delete an image from Cloudinary using its public ID
 * @access  Private (authenticated users only)
 * @params  { publicId } - Cloudinary public ID of the image to delete
 */
router.delete('/image/:publicId', uploadController.deleteImage);

// ========== PRODUCT UPLOADS ==========
// Specialized route for product images with product-specific transformations

/**
 * @route   POST /api/upload/product
 * @desc    Upload images specifically for products
 * @access  Private (authenticated users only)
 * @body    multipart/form-data with fields 'images' and optional 'productId'
 * @limiter 50 uploads per hour per user
 * @max     10 files per request
 * @note    Applies product-specific image transformations
 */
router.post(
  '/product',
  rateLimiter.uploadLimiter,           // Limit upload frequency
  upload.array('images', 10),           // Accept up to 10 files
  uploadController.uploadProductImages
);

// ========== AVATAR UPLOADS ==========
// Specialized route for user profile pictures

/**
 * @route   POST /api/upload/avatar
 * @desc    Upload user avatar (automatically replaces old avatar)
 * @access  Private (authenticated users only)
 * @body    multipart/form-data with field 'avatar'
 * @limiter 50 uploads per hour per user
 * @note    - Auto-resizes to square
 *         - Replaces existing avatar
 *         - Updates user document with new URL
 */
router.post(
  '/avatar',
  rateLimiter.uploadLimiter,           // Limit upload frequency
  upload.single('avatar'),              // Accept single file with field name 'avatar'
  uploadController.uploadAvatar
);

// ========== CATEGORY UPLOADS ==========
// Admin-only route for category images

/**
 * @route   POST /api/upload/category
 * @desc    Upload category image (admin only)
 * @access  Private (Admin only)
 * @body    multipart/form-data with fields 'image' and optional 'categoryId'
 * @limiter 50 uploads per hour per user
 * @note    - Requires admin privileges
 *         - Applies thumbnail transformations
 */
router.post(
  '/category',
  restrictTo('admin', 'super-admin'),   // Only admins can upload category images
  rateLimiter.uploadLimiter,            // Limit upload frequency
  upload.single('image'),                // Accept single file with field name 'image'
  uploadController.uploadCategoryImage
);

module.exports = router;