// middlewares/oauthMiddleware.js
// OAuth middleware - handles OAuth-specific security, state management, and user validation
// Provides CSRF protection, return URL handling, and OAuth user checks

const AppError = require('../utils/AppError');                // Custom error class
const { OAUTH } = require('../config/key');                    // OAuth configuration

// ========== CHECK IF GOOGLE OAUTH IS CONFIGURED ==========
/**
 * Middleware to check if Google OAuth is properly configured
 * Prevents attempts to use OAuth when credentials are missing
 */
const checkGoogleOAuth = (req, res, next) => {
  if (!OAUTH.GOOGLE.isConfigured()) {
    return next(new AppError('Google OAuth is not configured', 501));
  }
  next();
};

// ========== VERIFY OAUTH STATE PARAMETER (CSRF Protection) ==========
/**
 * Verify OAuth state parameter to prevent CSRF attacks
 * The state parameter should match the one stored in session
 * 
 * How it works:
 * 1. Before redirecting to Google, we store a random state in session
 * 2. Google returns the same state parameter in the callback
 * 3. We verify they match - if not, it could be a CSRF attack
 */
const verifyOAuthState = (req, res, next) => {
  const { state } = req.query;                     // State from Google callback
  const savedState = req.session.oauthState;        // State we stored earlier
  
  // If state doesn't match, possible CSRF attack
  if (!state || !savedState || state !== savedState) {
    return next(new AppError('Invalid OAuth state. Possible CSRF attack.', 403));
  }
  
  // Clear state from session after successful verification
  delete req.session.oauthState;
  next();
};

// ========== STORE OAUTH STATE IN SESSION ==========
/**
 * Generate and store a random state parameter in session
 * This state will be verified when Google redirects back
 */
const storeOAuthState = (req, res, next) => {
  // Generate cryptographically secure random string
  const state = require('crypto').randomBytes(16).toString('hex');
  
  // Store in session for later verification
  req.session.oauthState = state;
  
  // Attach to query params so Google includes it in callback
  req.query.state = state;
  next();
};

// ========== HANDLE OAUTH REDIRECT URL ==========
/**
 * Store the return URL in session before redirecting to OAuth provider
 * This allows us to redirect users back to the page they were on
 */
const handleOAuthRedirect = (req, res, next) => {
  const { returnTo } = req.query;  // e.g., ?returnTo=/cart or /profile
  
  if (returnTo) {
    req.session.returnTo = returnTo;  // Store for later use
  }
  next();
};

// ========== GET RETURN URL AFTER OAUTH ==========
/**
 * Retrieve the stored return URL and attach to request
 * Used after successful OAuth to redirect user back to original page
 */
const getReturnUrl = (req, res, next) => {
  // Use stored URL or default to homepage
  req.returnUrl = req.session.returnTo || '/';
  
  // Clear stored URL to prevent reuse
  delete req.session.returnTo;
  next();
};

// ========== CHECK IF USER IS OAUTH USER ==========
/**
 * Check if the current user is authenticated via OAuth
 * Used to restrict certain actions for OAuth users
 */
const checkOAuthUser = (req, res, next) => {
  if (req.user && req.user.googleId) {
    return next(new AppError('This action is not available for Google-authenticated users', 400));
  }
  next();
};

// ========== REQUIRE PASSWORD SET FOR OAUTH USERS ==========
/**
 * For OAuth users, check if they have set a password
 * Used when OAuth users want to perform actions that require password
 */
const requirePasswordSet = async (req, res, next) => {
  if (req.user && req.user.googleId) {
    // Need to explicitly select password field (normally excluded)
    const user = await require('../models/User').findById(req.user.id).select('+password');
    
    if (!user.password) {
      // Return special response indicating password needs to be set
      return res.status(400).json({
        status: 'fail',
        message: 'Please set a password for your account first',
        requiresPasswordSetup: true  // Frontend can use this to show password form
      });
    }
  }
  next();
};

module.exports = {
  checkGoogleOAuth,        // Check if OAuth is configured
  verifyOAuthState,        // Verify CSRF protection state
  storeOAuthState,         // Generate and store CSRF state
  handleOAuthRedirect,     // Store return URL before OAuth
  getReturnUrl,            // Retrieve return URL after OAuth
  checkOAuthUser,          // Check if user is OAuth user
  requirePasswordSet       // Check if OAuth user has password
};