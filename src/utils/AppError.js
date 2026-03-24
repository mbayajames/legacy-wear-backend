// utils/AppError.js
// Custom error class for operational errors in the application
// Extends native Error class with additional properties for better error handling

/**
 * AppError Class
 * A custom error class that extends the native JavaScript Error object.
 * Designed to distinguish between operational errors (expected) and 
 * programming errors (unexpected) for better error handling.
 * 
 * @class AppError
 * @extends Error
 */
class AppError extends Error {
  /**
   * Create an AppError instance
   * 
   * @param {string} message - Error message to display to the user
   * @param {number} statusCode - HTTP status code (e.g., 400, 401, 404, 500)
   * @param {Array|null} errors - Optional array of validation errors or additional error details
   */
  constructor(message, statusCode, errors = null) {
    // ===== 1. CALL PARENT CONSTRUCTOR =====
    // Call the parent Error class constructor with the message
    // This sets the error message and ensures proper inheritance
    super(message);
    
    // ===== 2. SET HTTP STATUS CODE =====
    // Store the HTTP status code (e.g., 400, 401, 404, 500)
    this.statusCode = statusCode;
    
    // ===== 3. SET STATUS CATEGORY =====
    // Determine if error is client-side (4xx) or server-side (5xx)
    // 'fail' for client errors (400-499) - user can fix
    // 'error' for server errors (500-599) - technical issue
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    
    // ===== 4. MARK AS OPERATIONAL ERROR =====
    // Flag to identify operational errors (errors we expect to handle)
    // Used by error handler to decide what to send to client
    // Operational errors = predictable (validation, not found, etc.)
    // Programming errors = bugs (undefined variables, etc.)
    this.isOperational = true;
    
    // ===== 5. STORE ADDITIONAL ERROR DETAILS =====
    // Optional array of validation errors or extra details
    // Useful for sending structured error information to frontend
    // Example: [{ field: 'email', message: 'Email is required' }]
    this.errors = errors;

    // ===== 6. CAPTURE STACK TRACE =====
    // Capture the stack trace for debugging
    // This maintains proper stack trace information when the error is thrown
    // The second argument excludes the constructor call from the stack trace
    // for cleaner debugging output
    Error.captureStackTrace(this, this.constructor);
  }
}

// Export the class for use throughout the application
module.exports = AppError;