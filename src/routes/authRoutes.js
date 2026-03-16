// routes/authRoutes.js
// Authentication routes - defines all authentication-related endpoints
// Includes local auth, Google OAuth, email verification, password reset, and profile management

const express = require('express');                          // Express router
const passport = require('passport');                        // Passport for authentication strategies
const authController = require('../controllers/authController');     // Local auth controller
const oauthController = require('../controllers/oauthController');   // OAuth controller
const { validate } = require('../middlewares/validate');    // Input validation middleware
const rateLimiter = require('../middlewares/rateLimiter');  // Rate limiting middleware
const { protect } = require('../middlewares/auth');         // Authentication middleware
const { 
  registerValidator, 
  loginValidator, 
  emailValidator,
  passwordValidator,
  resetPasswordValidator 
} = require('../utils/validators/authValidator');           // Validation schemas

const router = express.Router();

// ========== PUBLIC ROUTES ==========
// These routes do not require authentication

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 * @body    { name, email, password }
 */
router.post(
  '/register',
  rateLimiter.authLimiter,                // Limit registration attempts (prevent spam)
  validate(registerValidator),             // Validate input
  authController.register                  // Controller
);

/**
 * @route   POST /api/auth/login
 * @desc    Login existing user
 * @access  Public
 * @body    { email, password }
 */
router.post(
  '/login',
  rateLimiter.authLimiter,                // Limit login attempts (brute force protection)
  validate(loginValidator),                 // Validate input
  authController.login                      // Controller
);

/**
 * @route   GET /api/auth/logout
 * @desc    Logout user (clear cookies)
 * @access  Public
 */
router.get('/logout', authController.logout);

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Get new access token using refresh token
 * @access  Public
 * @body    { refreshToken }
 */
router.post('/refresh-token', authController.refreshToken);

/**
 * @route   GET /api/auth/verify-email/:token
 * @desc    Verify email address using token
 * @access  Public
 * @params  { token }
 */
router.get('/verify-email/:token', authController.verifyEmail);

/**
 * @route   POST /api/auth/resend-verification
 * @desc    Resend email verification link
 * @access  Public
 * @body    { email }
 */
router.post(
  '/resend-verification',
  rateLimiter.authLimiter,                // Limit resend attempts
  validate(emailValidator),                 // Validate email
  authController.resendVerification
);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset email
 * @access  Public
 * @body    { email }
 */
router.post(
  '/forgot-password',
  rateLimiter.authLimiter,                // Limit requests
  validate(emailValidator),                 // Validate email
  authController.forgotPassword
);

/**
 * @route   PATCH /api/auth/reset-password/:token
 * @desc    Reset password using token
 * @access  Public
 * @params  { token }
 * @body    { password }
 */
router.patch(
  '/reset-password/:token',
  rateLimiter.authLimiter,                // Limit attempts
  validate(resetPasswordValidator),        // Validate new password
  authController.resetPassword
);

// ========== GOOGLE OAUTH ROUTES ==========

/**
 * @route   GET /api/auth/google
 * @desc    Initiate Google OAuth flow
 * @access  Public
 */
router.get(
  '/google',
  passport.authenticate('google', { 
    scope: ['profile', 'email'],           // Request profile and email from Google
    prompt: 'select_account'                // Force account selection even if logged in to Google
  })
);

/**
 * @route   GET /api/auth/google/callback
 * @desc    Google OAuth callback URL
 * @access  Public (called by Google)
 */
router.get(
  '/google/callback',
  passport.authenticate('google', { 
    session: true,                          // Use session for OAuth state
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=google_auth_failed`  // Redirect on failure
  }),
  oauthController.googleCallback            // Handle success
);

// ========== PROTECTED ROUTES ==========
// These routes require authentication (valid JWT token)

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', protect, authController.getMe);

/**
 * @route   PATCH /api/auth/update-me
 * @desc    Update current user profile
 * @access  Private
 * @body    { name, avatar, phone } (any fields to update)
 */
router.patch(
  '/update-me',
  protect,                                  // Must be logged in
  authController.updateMe                   // Update profile
);

/**
 * @route   PATCH /api/auth/update-password
 * @desc    Update password (when user knows current password)
 * @access  Private
 * @body    { currentPassword, newPassword }
 */
router.patch(
  '/update-password',
  protect,                                  // Must be logged in
  validate(passwordValidator),               // Validate new password
  authController.updatePassword              // Update password
);

/**
 * @route   DELETE /api/auth/delete-me
 * @desc    Soft delete user account (deactivate)
 * @access  Private
 */
router.delete('/delete-me', protect, authController.deleteMe);

/**
 * @route   GET /api/auth/oauth-status
 * @desc    Check OAuth status (Google linked, etc.)
 * @access  Private
 */
router.get('/oauth-status', protect, oauthController.checkOAuthStatus);

/**
 * @route   POST /api/auth/link-google
 * @desc    Link Google account to existing user
 * @access  Private
 * @body    { googleId, email, avatar }
 */
router.post(
  '/link-google',
  protect,                                  // Must be logged in
  oauthController.linkGoogleAccount         // Link Google
);

/**
 * @route   DELETE /api/auth/unlink-google
 * @desc    Unlink Google account from user
 * @access  Private
 */
router.delete(
  '/unlink-google',
  protect,                                  // Must be logged in
  oauthController.unlinkGoogleAccount       // Unlink Google
);

/**
 * @route   GET /api/auth/oauth-success
 * @desc    Handle successful OAuth redirect
 * @access  Private (user will have JWT cookie)
 */
router.get('/oauth-success', protect, oauthController.handleOAuthSuccess);

module.exports = router;