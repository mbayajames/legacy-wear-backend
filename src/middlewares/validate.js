// middlewares/validate.js
// Validation middleware - handles request data validation using Joi schemas
// Provides flexible validation for body, params, and query with common validators

const AppError = require('../utils/AppError');  // Custom error class

// ========== VALIDATION MIDDLEWARE FACTORY ==========
/**
 * Creates a validation middleware for a specific request source
 * 
 * @param {Object} schema - Joi validation schema
 * @param {string} source - Source to validate ('body', 'params', 'query') - defaults to 'body'
 * @returns {Function} Express middleware
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    // Get data from the specified request source
    const data = req[source];
    
    // Validate the data against the provided Joi schema
    const { error, value } = schema.validate(data, {
      abortEarly: false,      // Return all errors, not just the first one
      stripUnknown: true,      // Remove fields not defined in schema
      errors: {
        wrap: {
          label: false        // Don't wrap error messages in quotes
        }
      }
    });
    
    // If validation failed, format and return errors
    if (error) {
      // Format each validation error into a consistent structure
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),  // Field name (supports nested paths)
        message: detail.message         // Human-readable error message
      }));
      
      // Pass to error handler with 400 status and error details
      return next(new AppError('Validation failed', 400, errors));
    }
    
    // Replace request data with validated/sanitized data
    // This ensures we only use validated, safe data
    req[source] = value;
    
    // Continue to next middleware/controller
    next();
  };
};

// ========== VALIDATE PARAMS ==========
/**
 * Convenience middleware for validating URL parameters
 * 
 * @param {Object} schema - Joi validation schema
 * @returns {Function} Express middleware
 */
const validateParams = (schema) => validate(schema, 'params');

// ========== VALIDATE QUERY ==========
/**
 * Convenience middleware for validating query parameters
 * 
 * @param {Object} schema - Joi validation schema
 * @returns {Function} Express middleware
 */
const validateQuery = (schema) => validate(schema, 'query');

// ========== COMMON VALIDATION RULES ==========
/**
 * Reusable validation functions for common data types
 * These can be used in custom validators or directly in routes
 */
const commonValidators = {
  /**
   * Validate MongoDB ObjectId format
   * @param {string} value - ID to validate
   * @returns {string} Validated ID
   * @throws {AppError} If invalid
   */
  objectId: (value) => {
    // MongoDB ObjectIds are 24-character hex strings
    const isValid = /^[0-9a-fA-F]{24}$/.test(value);
    if (!isValid) {
      throw new AppError('Invalid ID format', 400);
    }
    return value;
  },
  
  /**
   * Validate and normalize email address
   * @param {string} value - Email to validate
   * @returns {string} Normalized lowercase email
   * @throws {AppError} If invalid
   */
  email: (value) => {
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(value)) {
      throw new AppError('Invalid email format', 400);
    }
    // Normalize to lowercase for consistent storage
    return value.toLowerCase();
  },
  
  /**
   * Validate Kenyan phone number format
   * Accepts: 07XXXXXXXX or +2547XXXXXXXX
   * @param {string} value - Phone number to validate
   * @returns {string} Validated phone number
   * @throws {AppError} If invalid
   */
  phone: (value) => {
    const phoneRegex = /^(\+254|0)[7][0-9]{8}$/;
    if (!phoneRegex.test(value)) {
      throw new AppError('Invalid phone number. Use format: 07XXXXXXXX or +2547XXXXXXXX', 400);
    }
    return value;
  },
  
  /**
   * Validate password strength
   * Requirements: min 8 chars, uppercase, lowercase, number
   * @param {string} value - Password to validate
   * @returns {string} Validated password
   * @throws {AppError} If too weak
   */
  password: (value) => {
    if (value.length < 8) {
      throw new AppError('Password must be at least 8 characters', 400);
    }
    if (!/[A-Z]/.test(value)) {
      throw new AppError('Password must contain at least one uppercase letter', 400);
    }
    if (!/[a-z]/.test(value)) {
      throw new AppError('Password must contain at least one lowercase letter', 400);
    }
    if (!/[0-9]/.test(value)) {
      throw new AppError('Password must contain at least one number', 400);
    }
    return value;
  },
  
  /**
   * Validate URL format
   * @param {string} value - URL to validate
   * @returns {string} Validated URL
   * @throws {AppError} If invalid
   */
  url: (value) => {
    try {
      new URL(value);  // Will throw if invalid
      return value;
    } catch {
      throw new AppError('Invalid URL format', 400);
    }
  }
};

module.exports = {
  validate,
  validateParams,
  validateQuery,
  commonValidators
};