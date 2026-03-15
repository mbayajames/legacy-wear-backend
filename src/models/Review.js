// models/Review.js
// Review model for MongoDB - manages product reviews, ratings, and moderation
// Handles user feedback with verification, moderation, and automatic product rating updates

const mongoose = require('mongoose');  // MongoDB ODM for schema definition

/**
 * Review Schema Definition
 * Defines the structure of product reviews in MongoDB
 * Includes comprehensive fields for ratings, content, moderation, and verification
 */
const reviewSchema = new mongoose.Schema({
  // ========== RELATIONSHIPS ==========
  // Core references to other models
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',  // Reference to Product model
    required: [true, 'Review must belong to a product'],
    index: true       // Fast lookup by product
  },
  
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',      // Reference to User model
    required: [true, 'Review must belong to a user'],
    index: true       // Fast lookup by user
  },
  
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',     // Reference to Order model (for verified purchase)
    index: true       // Optional - links to specific order
  },
  
  // ========== REVIEW CONTENT ==========
  // Core review data
  rating: {
    type: Number,
    required: [true, 'Please provide a rating'],
    min: [1, 'Rating must be at least 1'],    // 1-star minimum
    max: [5, 'Rating cannot exceed 5']        // 5-star maximum
  },
  
  title: {
    type: String,
    required: [true, 'Please provide a review title'],
    trim: true,  // Remove whitespace
    maxlength: [100, 'Title cannot exceed 100 characters']  // Short and concise
  },
  
  comment: {
    type: String,
    required: [true, 'Please provide a review comment'],
    trim: true,
    maxlength: [1000, 'Comment cannot exceed 1000 characters']  // Detailed feedback
  },
  
  // ========== MEDIA ==========
  // Optional images with captions
  images: [{
    url: String,      // Image URL (Cloudinary or local)
    caption: String   // Optional caption for the image
  }],
  
  // ========== VERIFICATION ==========
  // Indicates if reviewer actually purchased the product
  isVerifiedPurchase: {
    type: Boolean,
    default: false    // False until verified
  },
  
  // ========== MODERATION ==========
  // Review status and community metrics
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'flagged'],  // Review states
    default: 'pending',    // New reviews start as pending
    index: true            // Fast filtering by status
  },
  
  helpfulCount: {
    type: Number,
    default: 0  // Number of users who found this helpful
  },
  
  reportedCount: {
    type: Number,
    default: 0  // Number of times reported for inappropriate content
  },
  
  // ========== RESPONSES ==========
  // Seller response to review
  sellerResponse: {
    comment: String,                            // Response text
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'                                // Admin who responded
    },
    respondedAt: Date                            // When response was posted
  },
  
  // ========== METADATA ==========
  // Additional data for moderation and analytics
  ipAddress: String,        // IP address of reviewer (for fraud detection)
  userAgent: String,        // Browser/device info
  
  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'             // Admin who moderated
  },
  moderatedAt: Date,        // When moderation occurred
  moderationNote: String     // Reason for moderation action
  
}, {
  // Schema options
  timestamps: true,                     // Auto-add createdAt/updatedAt
  toJSON: { virtuals: true },            // Include virtuals in JSON
  toObject: { virtuals: true }            // Include virtuals in objects
});

// ========== INDEXES ==========
// Performance indexes for common queries
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });  // Product reviews sorted by date
reviewSchema.index({ user: 1, product: 1 }, { unique: true }); // One review per user per product
reviewSchema.index({ helpfulCount: -1 });                        // Most helpful reviews first
reviewSchema.index({ rating: 1 });                               // Filter by rating

// ========== STATIC METHODS ==========
// Methods available on the Review model itself

/**
 * Calculate and update average ratings for a product
 * Runs asynchronously after reviews are saved/modified
 * 
 * @param {ObjectId} productId - ID of the product to update
 * @returns {Promise<void>}
 */
reviewSchema.statics.calcAverageRatings = async function(productId) {
  // Aggregate pipeline to calculate rating statistics
  const stats = await this.aggregate([
    {
      // Only include approved reviews in calculations
      $match: { 
        product: productId,
        status: 'approved'
      }
    },
    {
      // Group by product and calculate statistics
      $group: {
        _id: '$product',                    // Group by product ID
        avgRating: { $avg: '$rating' },      // Average rating
        numRatings: { $sum: 1 },              // Total number of reviews
        ratingCounts: {
          $push: '$rating'                    // Array of all ratings (for distribution)
        }
      }
    }
  ]);
  
  // Update the Product document with new ratings
  if (stats.length > 0) {
    // Product has reviews - update with calculated values
    await mongoose.model('Product').findByIdAndUpdate(productId, {
      ratingsAverage: stats[0].avgRating,      // Update average rating
      ratingsQuantity: stats[0].numRatings      // Update total count
    });
  } else {
    // Product has no approved reviews - reset to defaults
    await mongoose.model('Product').findByIdAndUpdate(productId, {
      ratingsAverage: 0,        // Reset to 0
      ratingsQuantity: 0         // Reset to 0
    });
  }
};

// ========== POST-SAVE MIDDLEWARE ==========
// Middleware that runs after saving a review document

/**
 * After saving a new review, update the product's average rating
 * This ensures product ratings stay in sync
 */
reviewSchema.post('save', function() {
  // this.constructor refers to the Review model
  this.constructor.calcAverageRatings(this.product);
});

/**
 * After findOneAndUpdate/Delete operations, update product ratings
 * Regex matches any operation starting with 'findOneAnd' (update, delete, etc.)
 */
reviewSchema.post(/^findOneAnd/, async function(doc) {
  // doc is the document that was operated on
  if (doc) {
    await doc.constructor.calcAverageRatings(doc.product);
  }
});

// Create and export the Review model
module.exports = mongoose.model('Review', reviewSchema);