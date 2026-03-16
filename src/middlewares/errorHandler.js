// middlewares/errorHandler.js
// Global error handling middleware - catches all errors and formats responses appropriately
// Provides different error responses for development vs production environments

const AppError = require('../utils/AppError');        // Custom error class
const { SERVER } = require('../config/key');          // Server configuration

// ========== ERROR SENDER FUNCTIONS ==========
/**
 * Development error response - includes full error details for debugging
 * Sends stack trace, error object, and detailed messages
 */
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,           // 'fail' or 'error'
    error: err,                   // Full error object (includes stack trace)
    message: err.message,          // Error message
    stack: err.stack,              // Stack trace for debugging
    errors: err.errors             // Validation errors array (if any)
  });
};

/**
 * Production error response - safe for end users
 * Only shows operational errors, hides implementation details
 */
const sendErrorProd = (err, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      errors: err.errors  // Validation errors (safe to show)
    });
  } else {
    // Programming or other unknown error: don't leak error details
    console.error('ERROR 💥', err);  // Log for debugging
    
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong. Please try again later.'
    });
  }
};

// ========== HANDLE SPECIFIC ERROR TYPES ==========
// These functions convert specific database/JWT errors into AppError instances

/**
 * Handle MongoDB CastError (e.g., invalid ObjectId)
 * Example: GET /api/users/invalid-id
 */
const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400);
};

/**
 * Handle MongoDB duplicate key error (code 11000)
 * Example: Trying to create user with existing email
 */
const handleDuplicateFieldsDB = (err) => {
  // Extract the duplicate value from error message
  const value = err.errmsg.match(/(["'])(\\?.)*?\1/)[0];
  const message = `Duplicate field value: ${value}. Please use another value.`;
  return new AppError(message, 400);
};

/**
 * Handle MongoDB validation errors
 * Example: Required field missing, validation rule violated
 */
const handleValidationErrorDB = (err) => {
  // Extract all validation error messages
  const errors = Object.values(err.errors).map(el => el.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new AppError(message, 400, errors); // Pass errors array for detailed response
};

/**
 * Handle invalid JWT token
 */
const handleJWTError = () => new AppError('Invalid token. Please log in again.', 401);

/**
 * Handle expired JWT token
 */
const handleJWTExpiredError = () => new AppError('Your token has expired. Please log in again.', 401);

// ========== MAIN ERROR HANDLER ==========
/**
 * Global error handling middleware for Express
 * Catches all errors passed via next(error)
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
module.exports = (err, req, res, next) => {
  // Set default values if not provided
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';
  
  // Development: send detailed error response
  if (SERVER.IS_DEVELOPMENT) {
    sendErrorDev(err, res);
  } 
  // Production: sanitize error before sending
  else {
    // Create a copy of the error to avoid mutating the original
    let error = { ...err };
    error.message = err.message;
    error.errors = err.errors;
    
    // Handle specific MongoDB errors
    if (error.name === 'CastError') error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === 'ValidationError') error = handleValidationErrorDB(error);
    
    // Handle specific JWT errors
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();
    
    // Send production-friendly response
    sendErrorProd(error, res);
  }
};