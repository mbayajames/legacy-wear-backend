// middlewares/rateLimiter.js
// Rate limiting middleware - prevents abuse by limiting requests per IP/user
// Uses MongoDB store for distributed rate limiting across multiple server instances

const rateLimit = require('express-rate-limit');          // Rate limiting library
const MongoStore = require('rate-limit-mongo');           // MongoDB store for persistent rate limiting
const { RATE_LIMIT, DATABASE } = require('../config/key'); // Configuration
const AppError = require('../utils/AppError');            // Custom error class

// ========== GENERAL API RATE LIMITER ==========
/**
 * Global rate limiter applied to most API endpoints
 * Uses MongoDB store for persistence across server restarts
 */
const apiLimiter = rateLimit({
  // Use MongoDB to store rate limit data (works with multiple server instances)
  store: new MongoStore({
    uri: DATABASE.getConnectionString(),  // MongoDB connection string
    collectionName: 'rateLimits',          // Collection to store rate limit data
    expireTimeMs: RATE_LIMIT.WINDOW_MS     // Auto-expire old records
  }),
  
  // Time window for rate limiting (e.g., 15 minutes)
  windowMs: RATE_LIMIT.WINDOW_MS,
  
  // Maximum number of requests allowed in the window
  max: RATE_LIMIT.MAX,
  
  // Response when rate limit is exceeded
  message: {
    status: 'error',
    message: 'Too many requests from this IP. Please try again later.'
  },
  
  // Return rate limit info in standard headers (RateLimit-*)
  standardHeaders: true,
  
  // Don't send legacy headers (X-RateLimit-*)
  legacyHeaders: false,
  
  /**
   * Generate a unique key for each client
   * Uses user ID for authenticated users, IP for guests
   */
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
  
  /**
   * Skip rate limiting for certain requests
   * Health checks should never be rate limited
   */
  skip: (req) => {
    return req.path === '/health';
  }
});

// ========== AUTH RATE LIMITER (Stricter) ==========
/**
 * Stricter rate limiter for authentication endpoints
 * Prevents brute force password guessing attacks
 */
const authLimiter = rateLimit({
  // Shorter window (15 minutes)
  windowMs: RATE_LIMIT.ENDPOINTS.auth.windowMs,
  
  // Very low limit (5 attempts per window)
  max: RATE_LIMIT.ENDPOINTS.auth.max,
  
  // Don't count successful logins against the limit
  // This prevents legitimate users from being locked out
  skipSuccessfulRequests: true,
  
  // Custom error message
  message: {
    status: 'error',
    message: RATE_LIMIT.ENDPOINTS.auth.message
  },
  
  /**
   * Key generator for auth attempts
   * Uses email to prevent brute force on specific accounts
   * Falls back to IP if email not provided
   */
  keyGenerator: (req) => {
    return req.body.email || req.ip;
  }
});

// ========== UPLOAD RATE LIMITER ==========
/**
 * Rate limiter for file upload endpoints
 * Prevents storage exhaustion attacks
 */
const uploadLimiter = rateLimit({
  // 1 hour window
  windowMs: RATE_LIMIT.ENDPOINTS.upload.windowMs,
  
  // 50 uploads per hour max
  max: RATE_LIMIT.ENDPOINTS.upload.max,
  
  // Custom message
  message: {
    status: 'error',
    message: RATE_LIMIT.ENDPOINTS.upload.message
  },
  
  /**
   * Key generator for uploads
   * Uses user ID for authenticated users, IP for guests
   */
  keyGenerator: (req) => req.user?.id || req.ip
});

// ========== ORDER RATE LIMITER ==========
/**
 * Rate limiter for order creation
 * Prevents order spam and abuse
 */
const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour in milliseconds
  max: 10,                    // 10 orders per hour max
  message: {
    status: 'error',
    message: 'Order limit reached. Please try again later.'
  },
  
  // Key by user ID if authenticated, IP if guest
  keyGenerator: (req) => req.user?.id || req.ip
});

// ========== CUSTOM RATE LIMITER FACTORY ==========
/**
 * Factory function to create custom rate limiters with specific options
 * Useful for creating endpoint-specific rate limits
 * 
 * @param {Object} options - Rate limiter configuration
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum requests
 * @param {string} options.message - Error message
 * @param {Function} options.keyGenerator - Function to generate client key
 * @param {Function} options.skip - Function to skip rate limiting
 * @returns {Function} Express rate limiter middleware
 */
const createRateLimiter = (options) => {
  return rateLimit({
    // Default values if not provided
    windowMs: options.windowMs || 15 * 60 * 1000,  // Default: 15 minutes
    max: options.max || 100,                         // Default: 100 requests
    message: options.message || 'Too many requests', // Default message
    
    // Custom key generator (required for user-based limiting)
    keyGenerator: options.keyGenerator,
    
    // Optional skip function
    skip: options.skip,
    
    // Custom handler that throws AppError (integrates with error handling)
    handler: (req, res) => {
      throw new AppError(options.message || 'Rate limit exceeded', 429);
    }
  });
};

module.exports = {
  apiLimiter,      // General API rate limiter
  authLimiter,     // Strict limiter for auth endpoints
  uploadLimiter,   // Limiter for file uploads
  orderLimiter,    // Limiter for order creation
  createRateLimiter // Factory for custom limiters
};