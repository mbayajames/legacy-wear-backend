// controllers/oauthController.js
// OAuth controller - handles OAuth authentication callbacks and account linking
// Manages Google OAuth flow, account linking/unlinking, and OAuth status checks

const jwt = require('jsonwebtoken');                    // For JWT token generation
const User = require('../models/User');                  // User model for database operations
const { JWT, SERVER, FEATURES } = require('../config/key'); // Configuration
const AppError = require('../utils/AppError');           // Custom error class
const catchAsync = require('../utils/catchAsync');       // Async error wrapper
const { generateToken } = require('../utils/generateToken'); // Token generator

// ========== GOOGLE OAUTH CALLBACK ==========
/**
 * Google OAuth callback handler
 * This is called by Passport after Google authenticates the user
 * GET /api/auth/google/callback
 * (Public - called by Google OAuth)
 */
exports.googleCallback = catchAsync(async (req, res) => {
  // User is attached to req by Passport's Google strategy
  const user = req.user;
  
  if (!user) {
    // Redirect to frontend login page with error
    return res.redirect(`${process.env.FRONTEND_URL}/login?error=authentication_failed`);
  }

  // ===== GENERATE JWT TOKEN =====
  const token = generateToken(user._id);

  // ===== SET SECURE HTTP-ONLY COOKIE =====
  const cookieOptions = {
    expires: new Date(Date.now() + JWT.COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000), // Convert days to ms
    httpOnly: true,                    // Prevent JavaScript access (XSS protection)
    secure: SERVER.IS_PRODUCTION,       // HTTPS only in production
    sameSite: SERVER.IS_PRODUCTION ? 'none' : 'lax', // CSRF protection
    domain: SERVER.IS_PRODUCTION ? SERVER.DOMAIN : undefined // Domain for production
  };

  res.cookie('jwt', token, cookieOptions);

  // ===== OPTIONAL: STORE IN SESSION =====
  // This can be useful for server-rendered pages or additional session data
  req.session.token = token;
  req.session.userId = user._id;

  // ===== REDIRECT TO FRONTEND =====
  // The frontend will detect the cookie and consider the user logged in
  res.redirect(`${process.env.FRONTEND_URL}/oauth-success`);
});

// ========== HANDLE OAUTH SUCCESS ==========
/**
 * Handle successful OAuth authentication (called from frontend after redirect)
 * GET /api/auth/oauth/success
 * (Protected route - user must be logged in via OAuth)
 */
exports.handleOAuthSuccess = catchAsync(async (req, res, next) => {
  // User should be attached by the JWT strategy (from the cookie set in callback)
  if (!req.user) {
    return next(new AppError('You are not logged in', 401));
  }

  // Fetch full user details (excluding sensitive fields)
  const user = await User.findById(req.user._id)
    .select('-__v -passwordResetToken -passwordResetExpires');

  res.status(200).json({
    status: 'success',
    data: { user }
  });
});

// ========== LINK GOOGLE ACCOUNT ==========
/**
 * Link Google account to existing email/password user
 * POST /api/auth/oauth/link/google
 * Body: { googleId, email, avatar }
 * (Protected route - user must be logged in)
 */
exports.linkGoogleAccount = catchAsync(async (req, res, next) => {
  const { googleId, email, avatar } = req.body;
  const userId = req.user.id;

  const user = await User.findById(userId);

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // ===== SECURITY CHECK =====
  // Ensure this Google account isn't already linked to another user
  const existingUser = await User.findOne({ googleId });
  if (existingUser && existingUser.id !== userId) {
    return next(new AppError('This Google account is already linked to another user', 400));
  }

  // ===== LINK THE ACCOUNT =====
  user.googleId = googleId;
  user.isEmailVerified = true;  // Google emails are verified
  user.avatar = user.avatar || avatar;  // Use Google avatar if user doesn't have one
  await user.save();

  res.status(200).json({
    status: 'success',
    message: 'Google account linked successfully'
  });
});

// ========== UNLINK GOOGLE ACCOUNT ==========
/**
 * Unlink Google account from user
 * POST /api/auth/oauth/unlink/google
 * (Protected route - user must be logged in)
 */
exports.unlinkGoogleAccount = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  const user = await User.findById(userId);

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // ===== SAFETY CHECK =====
  // If user doesn't have a password, they can't unlink Google
  // Otherwise they'd have no way to log in!
  if (!user.password) {
    return next(new AppError('Please set a password first before unlinking Google account', 400));
  }

  // ===== UNLINK THE ACCOUNT =====
  user.googleId = undefined;
  await user.save();

  res.status(200).json({
    status: 'success',
    message: 'Google account unlinked successfully'
  });
});

// ========== CHECK OAUTH STATUS ==========
/**
 * Check OAuth status for current user
 * GET /api/auth/oauth/status
 * Returns: isOAuthUser, authMethod, hasPassword, googleLinked
 * (Protected route - user must be logged in)
 */
exports.checkOAuthStatus = catchAsync(async (req, res) => {
  const user = req.user;

  res.status(200).json({
    status: 'success',
    data: {
      isOAuthUser: user.isOAuthUser,        // Virtual: true if user has any OAuth provider
      authMethod: user.authMethod,           // Virtual: 'google' or 'local'
      hasPassword: !!user.password,          // Whether user has a password set
      googleLinked: !!user.googleId          // Whether Google is linked
    }
  });
});