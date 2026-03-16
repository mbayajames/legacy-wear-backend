// middlewares/admin.js
// Admin-specific middleware for authorization, permission checking, and audit logging
// Provides granular control over admin actions with role-based and permission-based access

const AppError = require('../utils/AppError');                // Custom error class
const { ADMIN } = require('../config/key');                    // Admin configuration

// ========== CHECK IF USER IS ADMIN ==========
/**
 * Middleware to check if user has admin or super-admin role
 * Must be used after protect middleware (req.user must exist)
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const isAdmin = (req, res, next) => {
  // Check if user is logged in (protect should have run first)
  if (!req.user) {
    return next(new AppError('You are not logged in', 401));
  }
  
  // Check if user has admin or super-admin role
  if (req.user.role !== 'admin' && req.user.role !== 'super-admin') {
    return next(new AppError('Admin access required', 403));
  }
  
  next();
};

// ========== CHECK IF USER IS SUPER ADMIN ==========
/**
 * Middleware to check if user has super-admin role
 * Also verifies email against configured super admin list for extra security
 * Must be used after protect middleware
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const isSuperAdmin = (req, res, next) => {
  // Check if user is logged in
  if (!req.user) {
    return next(new AppError('You are not logged in', 401));
  }
  
  // Check if user has super-admin role
  if (req.user.role !== 'super-admin') {
    return next(new AppError('Super admin access required', 403));
  }
  
  // Extra security: Verify email is in configured super admin list
  // This prevents someone with super-admin role from another environment
  if (!ADMIN.SUPER_ADMINS.includes(req.user.email)) {
    return next(new AppError('Unauthorized super admin access', 403));
  }
  
  next();
};

// ========== CHECK PERMISSION ==========
/**
 * Middleware factory to check for specific permissions
 * Uses the permission matrix from ADMIN.PERMISSIONS configuration
 * 
 * @param {string} permission - Permission to check (e.g., 'read:any', 'update:any')
 * @returns {Function} Express middleware
 */
const hasPermission = (permission) => {
  return (req, res, next) => {
    // Check if user is logged in
    if (!req.user) {
      return next(new AppError('You are not logged in', 401));
    }
    
    // Get permissions for user's role from config
    const userPermissions = ADMIN.PERMISSIONS[req.user.role] || [];
    
    // Check if user has wildcard (*) or specific permission
    if (userPermissions.includes('*') || userPermissions.includes(permission)) {
      return next();
    }
    
    // Permission denied
    return next(new AppError(`Permission denied: ${permission} required`, 403));
  };
};

// ========== AUDIT LOG FOR ADMIN ACTIONS ==========
/**
 * Middleware to log all admin actions for audit trail
 * Intercepts response to capture status code and logs after request completes
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const auditLog = async (req, res, next) => {
  // Store original send function to intercept later
  const originalSend = res.send;
  
  // Override send to log after response is sent
  res.send = function(body) {
    // Only log actions by admin/super-admin users
    if (req.user && (req.user.role === 'admin' || req.user.role === 'super-admin')) {
      // Create comprehensive log entry
      const logEntry = {
        admin: req.user.email,                    // Who performed action
        action: `${req.method} ${req.originalUrl}`, // What action
        params: req.params,                        // URL parameters
        query: req.query,                          // Query string
        body: req.body,                             // Request body (be careful with sensitive data)
        timestamp: new Date().toISOString(),       // When
        ip: req.ip,                                 // IP address
        userAgent: req.get('user-agent'),           // Browser/device info
        responseStatus: res.statusCode              // Result of action
      };
      
      // Log to console in development
      // In production, this could be saved to database or logging service
      console.log('📋 Admin Audit:', JSON.stringify(logEntry, null, 2));
      
      // TODO: Save to database for permanent audit trail
      // This would be implemented based on requirements
      // await AuditLog.create(logEntry);
    }
    
    // Call original send function with the response body
    originalSend.call(this, body);
  };
  
  next();
};

module.exports = {
  isAdmin,
  isSuperAdmin,
  hasPermission,
  auditLog
};