// utils/catchAsync.js
// Higher-order function to wrap async route handlers and automatically catch errors
// Eliminates the need for try-catch blocks in every async controller function

/**
 * catchAsync - Wraps an async function and catches any errors
 * 
 * Why we need this:
 * - Express doesn't automatically catch errors from async functions
 * - Without this, rejected promises would crash the server or get swallowed
 * - This wrapper ensures all async errors are passed to Express error handler
 * 
 * @param {Function} fn - The async function to wrap (usually a controller)
 * @returns {Function} - Express middleware function with error handling
 */
module.exports = (fn) => {
  // Return a new function that Express can call (req, res, next)
  return (req, res, next) => {
    // Execute the async function and catch any errors
    // If fn() returns a promise (which async functions do), .catch() will handle rejection
    // Any error is passed to Express's next() function, which triggers the error handler
    fn(req, res, next).catch(next);
  };
};