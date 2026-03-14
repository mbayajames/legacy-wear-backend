// strategies/index.js
// Centralized authentication strategies manager
// This file serves as a barrel export and orchestration layer for all Passport.js strategies
// It provides initialization, status tracking, and middleware factory functions

const localStrategy = require('./localStrategy');    // Email/password strategy
const jwtStrategy = require('./jwtStrategy');        // JWT token strategy
const googleStrategy = require('./googleStrategy');  // Google OAuth strategy
const { SERVER } = require('../config/key');        // Server configuration (environment, etc.)

/**
 * Initialize all Passport authentication strategies
 * This function orchestrates the initialization of all authentication strategies
 * Provides detailed logging and status tracking for each strategy
 * 
 * @param {Object} passport - Passport instance to register strategies with
 * @returns {Object} Results object indicating which strategies initialized successfully
 */
const initializeStrategies = (passport) => {
  console.log('\n🛡️  ===== AUTHENTICATION STRATEGIES =====');
  
  // Track initialization results for each strategy
  const results = {
    local: false,  // Email/password strategy
    jwt: false,    // JWT strategy
    google: false  // Google OAuth strategy
  };

  try {
    // ==================== 1️⃣ LOCAL STRATEGY (EMAIL/PASSWORD) ====================
    // Always available - core authentication method
    localStrategy(passport);
    results.local = true;  // Mark as successful
    
    // ==================== 2️⃣ JWT STRATEGY (TOKEN-BASED API AUTH) ====================
    // Always available - used for API protection
    jwtStrategy(passport);
    results.jwt = true;  // Mark as successful
    
    // ==================== 3️⃣ GOOGLE OAUTH STRATEGY ====================
    // Optional - may fail if credentials not configured
    try {
      googleStrategy(passport);  // This will check config internally
      results.google = true;  // Mark as successful if no error thrown
    } catch (error) {
      // Catch and log Google strategy failures without crashing the app
      console.warn('⚠️ Google strategy initialization failed:', error.message);
      // results.google remains false
    }

    // ==================== DISPLAY INITIALIZATION SUMMARY ====================
    // Show user-friendly status of all strategies
    console.log('\n📊 Strategy Status:');
    console.log(`   ✅ Local: ${results.local ? 'Ready' : 'Failed'}`);
    console.log(`   ✅ JWT: ${results.jwt ? 'Ready' : 'Failed'}`);
    console.log(`   ${results.google ? '✅' : '⚠️'} Google: ${results.google ? 'Ready' : 'Not configured'}`);
    
    // Provide helpful hints for missing configuration
    if (results.google) {
      console.log('   📱 Google OAuth: Available');
    } else {
      console.log('   📱 Google OAuth: Disabled (add GOOGLE_CLIENT_ID to enable)');
    }
    
    console.log('✅ All strategies initialized successfully\n');

  } catch (error) {
    // Catch any fatal errors during initialization
    console.error('❌ Strategy initialization failed:', error);
    throw error;  // Re-throw to prevent app from starting with broken auth
  }

  // Return results for potential use elsewhere in the app
  return results;
};

/**
 * Get available strategies based on configuration
 * This function checks which authentication methods are currently available
 * Useful for frontend to show/hide login options
 * 
 * @returns {Object} Object indicating which strategies are available
 */
const getAvailableStrategies = () => {
  return {
    local: true,  // Local strategy is always available
    jwt: true,    // JWT is always available
    // Google is only available if both client ID and secret are configured
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  };
};

/**
 * Strategy middleware factory
 * Creates reusable authentication middleware for routes
 * This factory pattern allows consistent error handling and response formatting
 * 
 * @param {string} strategy - Name of the strategy to use ('local', 'jwt', 'google')
 * @param {Object} options - Additional passport authenticate options
 * @returns {Function} Express middleware for authentication
 */
const authenticate = (strategy, options = {}) => {
  /**
   * Return middleware function
   * This function will be used in routes to protect endpoints
   * 
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  return (req, res, next) => {
    // Import passport inside function to avoid circular dependencies
    const passport = require('passport');
    
    /**
     * Call passport.authenticate with custom callback
     * This gives us control over error handling and response formatting
     * 
     * passport.authenticate returns a middleware function that we immediately call
     * with (req, res, next)
     */
    passport.authenticate(strategy, { 
      session: false,  // Always false - we use JWT, not sessions
      ...options       // Allow overriding default options
    }, (err, user, info) => {
      // ==================== ERROR HANDLING ====================
      // Handle internal server errors from passport or strategies
      if (err) {
        return next(err);  // Pass to Express error handler
      }
      
      // ==================== AUTHENTICATION FAILURE ====================
      // Handle cases where authentication failed (invalid credentials, etc.)
      if (!user) {
        // Return 401 Unauthorized with user-friendly message
        return res.status(401).json({
          status: 'fail',                              // Consistent API response format
          message: info?.message || 'Authentication failed',  // Error message from strategy
          ...(info || {})                              // Include any additional info from strategy
        });
      }
      
      // ==================== AUTHENTICATION SUCCESS ====================
      // Attach authenticated user to request object for downstream middleware/routes
      req.user = user;
      
      // Proceed to next middleware or route handler
      next();
    })(req, res, next);  // Immediately invoke the returned middleware
  };
};

/**
 * Export all utilities for use throughout the application
 * 
 * initializeStrategies: Used in main app.js to set up Passport
 * getAvailableStrategies: Used by frontend to show/hide login options
 * authenticate: Used in routes to protect endpoints
 */
module.exports = {
  initializeStrategies,
  getAvailableStrategies,
  authenticate
};