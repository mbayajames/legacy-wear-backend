// middlewares/auth.js
// Authentication and authorization middleware
// Handles JWT verification, role-based access control, resource ownership, and rate limiting

const passport = require('passport');                          // Passport for JWT authentication
const AppError = require('../utils/AppError');                // Custom error class
const catchAsync = require('../utils/catchAsync');            // Async error wrapper
const { FEATURES } = require('../config/key');                // Feature flags configuration

// ========== PROTECT ROUTES (JWT Authentication) ==========
/**
 * Middleware to protect routes - requires valid JWT token
 * Uses Passport JWT strategy to authenticate the user
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {Promise<void>}
 */
const protect = catchAsync(async (req, res, next) => {
  return new Promise((resolve, reject) => {
    // Call passport authenticate with JWT strategy
    passport.authenticate('jwt', { session: false }, (err, user, info) => {
      if (err) {
        // Authentication error (e.g., database error)
        return reject(new AppError('Authentication error', 401));
      }
      
      if (!user) {
        // No user found or invalid token
        // info.message contains specific error from strategy
        return reject(new AppError('You are not logged in. Please log in to access this resource.', 401));
      }
      
      // Check if user account is active (not deactivated)
      if (!user.active) {
        return reject(new AppError('Your account has been deactivated. Please contact support.', 401));
      }
      
      // Attach user to request object for use in controllers
      req.user = user;
      resolve();
    })(req, res, next);
  })
    .then(() => next())
    .catch(err => next(err));
});

// ========== OPTIONAL AUTHENTICATION ==========
/**
 * Middleware for optional authentication
 * Attaches user to req if token exists, but doesn't require it
 * Useful for routes that work for both guests and logged-in users
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const optionalAuth = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user) => {
    if (user) {
      // If token valid, attach user to request
      req.user = user;
    }
    // Continue regardless (no error if no user)
    next();
  })(req, res, next);
};

// ========== RESTRICT TO SPECIFIC ROLES ==========
/**
 * Middleware factory to restrict access to specific roles
 * Must be used after protect middleware (req.user must exist)
 * 
 * @param {...string} roles - Allowed roles (e.g., 'admin', 'super-admin')
 * @returns {Function} Express middleware
 */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    // Check if user is logged in (protect should have run first)
    if (!req.user) {
      return next(new AppError('You are not logged in', 401));
    }
    
    // Check if user's role is in allowed roles
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    
    next();
  };
};

// ========== CHECK IF USER OWNS RESOURCE ==========
/**
 * Middleware factory to check if user owns a resource
 * Useful for routes where users can only modify their own data
 * 
 * @param {Model} model - Mongoose model to check ownership against
 * @returns {Function} Express middleware
 */
const checkOwnership = (model) => {
  return catchAsync(async (req, res, next) => {
    // Find the resource by ID
    const resource = await model.findById(req.params.id);
    
    if (!resource) {
      return next(new AppError('Resource not found', 404));
    }
    
    // Check if user owns the resource OR is admin
    // resource.user should be the ID of the owner
    if (resource.user?.toString() !== req.user.id && req.user.role !== 'admin') {
      return next(new AppError('You do not own this resource', 403));
    }
    
    // Attach resource to request for use in controller
    req.resource = resource;
    next();
  });
};

// ========== VERIFY EMAIL REQUIREMENT ==========
/**
 * Middleware to require verified email for certain actions
 * Only applies if email service is enabled
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const requireVerifiedEmail = (req, res, next) => {
  // Check if email verification is enabled and user's email is verified
  if (FEATURES.ENABLED.EMAIL_SERVICE && !req.user.isEmailVerified) {
    return next(new AppError('Please verify your email address first', 403));
  }
  next();
};

// ========== CHECK RATE LIMIT PER USER ==========
/**
 * Middleware factory for user-based rate limiting
 * Tracks requests per user ID and limits based on configuration
 * 
 * @param {number} maxRequests - Maximum requests allowed in window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Function} Express middleware
 */
const userRateLimit = (maxRequests, windowMs) => {
  // Map to store request timestamps per user
  const requests = new Map();
  
  return (req, res, next) => {
    // Skip if user not logged in
    if (!req.user) return next();
    
    const userId = req.user.id;
    const now = Date.now();
    
    // Get existing requests for this user
    const userRequests = requests.get(userId) || [];
    
    // Filter to only include requests within the current window
    const recentRequests = userRequests.filter(time => time > now - windowMs);
    
    // Check if user has exceeded limit
    if (recentRequests.length >= maxRequests) {
      return next(new AppError('Too many requests. Please try again later.', 429));
    }
    
    // Add current request timestamp
    recentRequests.push(now);
    requests.set(userId, recentRequests);
    
    // ===== CLEANUP OLD ENTRIES =====
    // Prevent memory leak by cleaning up old entries
    if (requests.size > 10000) {
      for (const [id, times] of requests) {
        const validTimes = times.filter(time => time > now - windowMs);
        if (validTimes.length === 0) {
          // No recent requests, remove user from map
          requests.delete(id);
        } else {
          // Update with filtered timestamps
          requests.set(id, validTimes);
        }
      }
    }
    
    next();
  };
};

module.exports = {
  protect,
  optionalAuth,
  restrictTo,
  checkOwnership,
  requireVerifiedEmail,
  userRateLimit
};