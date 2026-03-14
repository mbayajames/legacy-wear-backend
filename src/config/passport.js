// config/passport.js
// Passport.js authentication configuration file
// Sets up multiple authentication strategies for the application

const passport = require('passport');  // Main authentication middleware
const User = require('../models/User');  // User model for database operations
const { SESSION } = require('./key');  // Session configuration (though not directly used here)

// Import all authentication strategy modules
// Each strategy handles a specific authentication method
const localStrategy = require('../strategies/localStrategy');      // Username/password authentication
const jwtStrategy = require('../strategies/jwtStrategy');          // JWT token authentication
const googleStrategy = require('../strategies/googleStrategy');    // Google OAuth authentication
const facebookStrategy = require('../strategies/facebookStrategy'); // Facebook OAuth authentication

/**
 * Initialize all Passport.js authentication strategies
 * This function configures Passport with all available authentication methods
 */
const initializePassport = () => {
  console.log('🛡️ Initializing authentication strategies...');
  
  // Register each strategy with Passport
  // Each strategy function receives the passport instance and configures its specific strategy
  localStrategy(passport);      // Sets up LocalStrategy for email/password login
  jwtStrategy(passport);        // Sets up JWTStrategy for token-based authentication
  googleStrategy(passport);     // Sets up Google OAuth2 strategy
  facebookStrategy(passport);   // Sets up Facebook OAuth strategy
  
  /**
   * User Serialization (Session-based authentication only)
   * Determines what user data should be stored in the session
   * Called when user authenticates successfully
   * Stores only the user ID in the session to minimize session size
   * 
   * @param {Object} user - The authenticated user object
   * @param {Function} done - Callback function (error, id)
   */
  passport.serializeUser((user, done) => {
    done(null, user.id);  // Store only user ID in session
  });
  
  /**
   * User Deserialization (Session-based authentication only)
   * Retrieves full user object from database using ID stored in session
   * Called on every request that requires authentication
   * Populates req.user with the full user object
   * 
   * @param {string} id - User ID stored in session
   * @param {Function} done - Callback function (error, user)
   */
  passport.deserializeUser(async (id, done) => {
    try {
      // Fetch complete user data from database (excluding password)
      const user = await User.findById(id).select('-password');
      done(null, user);  // Attach user to request object (req.user)
    } catch (error) {
      done(error, null);  // Handle errors (e.g., database issues)
    }
  });
  
  console.log('✅ All authentication strategies initialized');
};

// Execute initialization immediately when this module is loaded
initializePassport();

// Export configured passport instance for use in main application
module.exports = passport;