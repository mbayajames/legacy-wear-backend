// utils/validators/reviewValidator.js
// Review validators using Joi - validates product review data for creation, updates, and moderation
// Ensures reviews meet quality standards and prevents spam/inappropriate content

const Joi = require('joi');  // Joi validation library

// ========== CREATE REVIEW VALIDATOR ==========
/**
 * Validates review creation data
 * Used in POST /api/products/:productId/reviews
 * 
 * Validates:
 * - Product ID (MongoDB ObjectId format)
 * - Rating (1-5 stars)
 * - Title (3-100 chars)
 * - Comment (10-1000 chars)
 * - Optional images (max 5)
 */
const createReviewValidator = Joi.object({
  // ----- PRODUCT IDENTIFICATION -----
  productId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)  // MongoDB ObjectId format (24 hex chars)
    .required()
    .messages({
      'string.empty': 'Product ID is required',
      'string.pattern.base': 'Invalid product ID'
    }),
  
  // ----- RATING (1-5 stars) -----
  rating: Joi.number()
    .min(1)                // Minimum 1 star
    .max(5)                // Maximum 5 stars
    .required()
    .messages({
      'number.base': 'Rating must be a number',
      'number.min': 'Rating must be at least 1',
      'number.max': 'Rating cannot exceed 5'
    }),
  
  // ----- REVIEW TITLE -----
  title: Joi.string()
    .min(3)                // At least 3 characters (e.g., "Good")
    .max(100)              // Max 100 characters
    .required()
    .messages({
      'string.empty': 'Title is required',
      'string.min': 'Title must be at least 3 characters'
    }),
  
  // ----- REVIEW COMMENT (DETAILED FEEDBACK) -----
  comment: Joi.string()
    .min(10)               // At least 10 characters for meaningful feedback
    .max(1000)             // Max 1000 characters
    .required()
    .messages({
      'string.empty': 'Comment is required',
      'string.min': 'Comment must be at least 10 characters'
    }),
  
  // ----- OPTIONAL REVIEW IMAGES -----
  images: Joi.array()
    .items(Joi.object({
      url: Joi.string().uri(),        // Valid image URL (must start with http:// or https://)
      caption: Joi.string().optional() // Optional caption for the image
    }))
    .max(5)                // Maximum 5 images per review
    .optional()
});

// ========== UPDATE REVIEW VALIDATOR ==========
/**
 * Validates review updates
 * Used in PATCH /api/reviews/:id
 * 
 * All fields are optional - allows partial updates
 * Same validation rules as create but not required
 */
const updateReviewValidator = Joi.object({
  rating: Joi.number()
    .min(1)
    .max(5)
    .optional(),          // Not required for updates
  
  title: Joi.string()
    .min(3)
    .max(100)
    .optional(),
  
  comment: Joi.string()
    .min(10)
    .max(1000)
    .optional(),
  
  images: Joi.array()
    .items(Joi.object({
      url: Joi.string().uri(),
      caption: Joi.string().optional()
    }))
    .max(5)
    .optional()
});

// ========== MODERATE REVIEW VALIDATOR ==========
/**
 * Validates review moderation (admin only)
 * Used in PATCH /api/reviews/:id/moderate
 * 
 * Validates:
 * - Status (pending, approved, rejected, flagged)
 * - Optional moderation note
 */
const moderateReviewValidator = Joi.object({
  // Review moderation status
  status: Joi.string()
    .valid('pending', 'approved', 'rejected', 'flagged')
    // Status meanings:
    // - pending: Awaiting moderation (new review)
    // - approved: Visible on product page
    // - rejected: Not visible (inappropriate content)
    // - flagged: Reported by users, needs attention
    .required()
    .messages({
      'string.empty': 'Status is required',
      'any.only': 'Invalid moderation status'
    }),
  
  // Optional note explaining moderation decision
  moderationNote: Joi.string()
    .max(500)              // Limit note length
    .optional()
});

module.exports = {
  createReviewValidator,      // For creating new reviews
  updateReviewValidator,       // For updating existing reviews
  moderateReviewValidator      // For admin moderation
};