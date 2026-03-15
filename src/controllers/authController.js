// controllers/authController.js
// Authentication controller - handles all user authentication operations
// Includes register, login, logout, password reset, email verification, and profile management

const jwt = require('jsonwebtoken');           // For verifying refresh tokens
const crypto = require('crypto');               // For creating secure tokens
const User = require('../models/User');         // User model for database operations
const { JWT, SERVER, FEATURES } = require('../config/key');  // Configuration
const AppError = require('../utils/AppError');  // Custom error class
const catchAsync = require('../utils/catchAsync'); // Wrapper to catch async errors
const { generateToken, generateRefreshToken } = require('../utils/generateToken'); // Token generators
const { sendWelcomeEmail, sendPasswordResetEmail, sendEmailVerificationEmail } = require('../services/emailService'); // Email services

// ========== HELPER FUNCTIONS ==========
/**
 * Create and send JWT tokens via cookies and response body
 * This centralizes token generation and cookie setting
 * 
 * @param {Object} user - User document from database
 * @param {number} statusCode - HTTP status code to send
 * @param {Object} res - Express response object
 */
const createSendToken = (user, statusCode, res) => {
  // Generate access token (short-lived) and refresh token (long-lived)
  const token = generateToken(user._id);
  const refreshToken = generateRefreshToken(user._id);
  
  // Remove sensitive data from user object before sending to client
  user.password = undefined;
  user.failedLoginAttempts = undefined;
  user.lockUntil = undefined;
  
  // Configure cookie options for security
  const cookieOptions = {
    expires: new Date(Date.now() + JWT.COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000), // Convert days to ms
    httpOnly: true,           // Prevent JavaScript access (XSS protection)
    secure: SERVER.IS_PRODUCTION, // HTTPS only in production
    sameSite: SERVER.IS_PRODUCTION ? 'none' : 'lax', // CSRF protection
    domain: SERVER.IS_PRODUCTION ? SERVER.DOMAIN : undefined // Domain for production
  };
  
  // Set cookies in response
  res.cookie('jwt', token, cookieOptions);
  res.cookie('refreshToken', refreshToken, cookieOptions);
  
  // Send JSON response with tokens and user data
  res.status(statusCode).json({
    status: 'success',
    token,
    refreshToken,
    data: {
      user
    }
  });
};

// ========== REGISTER ==========
/**
 * Register a new user
 * POST /api/auth/register
 * Body: { name, email, password }
 */
exports.register = catchAsync(async (req, res, next) => {
  const { name, email, password } = req.body;
  
  // Check if user already exists with this email
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return next(new AppError('User already exists with this email', 400));
  }
  
  // Create new user in database
  const user = await User.create({
    name,
    email: email.toLowerCase(), // Normalize email to lowercase
    password
  });
  
  // Generate email verification token
  const verificationToken = user.createEmailVerificationToken();
  await user.save({ validateBeforeSave: false }); // Save token without full validation
  
  // Send verification email if email service is enabled
  if (FEATURES.ENABLED.EMAIL_SERVICE) {
    try {
      await sendEmailVerificationEmail(user, verificationToken);
    } catch (error) {
      // Log but don't fail registration if email fails
      console.error('Failed to send verification email:', error);
    }
  }
  
  // Send welcome email
  if (FEATURES.ENABLED.EMAIL_SERVICE) {
    try {
      await sendWelcomeEmail(user);
    } catch (error) {
      console.error('Failed to send welcome email:', error);
    }
  }
  
  // Log user in immediately after registration
  createSendToken(user, 201, res);
});

// ========== LOGIN ==========
/**
 * Login existing user
 * POST /api/auth/login
 * Body: { email, password }
 */
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  
  // Validate input presence
  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }
  
  // Find user and explicitly include password and security fields
  const user = await User.findOne({ email: email.toLowerCase() })
    .select('+password +failedLoginAttempts +lockUntil');
  
  if (!user) {
    return next(new AppError('Invalid email or password', 401));
  }
  
  // Check if account is temporarily locked due to too many failed attempts
  if (user.lockUntil && user.lockUntil > Date.now()) {
    const remainingTime = Math.ceil((user.lockUntil - Date.now()) / 60000); // Minutes
    return next(new AppError(`Account locked. Try again in ${remainingTime} minutes`, 401));
  }
  
  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  
  if (!isPasswordValid) {
    // Increment failed login attempts (brute force protection)
    await user.incrementLoginAttempts();
    
    // Check if account just became locked
    const updatedUser = await User.findById(user._id).select('+lockUntil');
    
    if (updatedUser.lockUntil && updatedUser.lockUntil > Date.now()) {
      return next(new AppError('Too many failed attempts. Account locked for 30 minutes', 401));
    }
    
    return next(new AppError('Invalid email or password', 401));
  }
  
  // Check if account is active (not deactivated)
  if (!user.active) {
    return next(new AppError('Account deactivated. Please contact support', 401));
  }
  
  // Reset failed login attempts on successful login
  await user.resetLoginAttempts();
  
  // Update last login timestamp
  user.lastLogin = Date.now();
  await user.save({ validateBeforeSave: false });
  
  // Send tokens and user data
  createSendToken(user, 200, res);
});

// ========== LOGOUT ==========
/**
 * Logout user by clearing cookies
 * POST /api/auth/logout
 */
exports.logout = (req, res) => {
  // Set cookies to expire immediately (10 seconds)
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });
  
  res.cookie('refreshToken', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });
  
  res.status(200).json({ status: 'success' });
};

// ========== REFRESH TOKEN ==========
/**
 * Get new access token using refresh token
 * POST /api/auth/refresh-token
 * Body: { refreshToken }
 */
exports.refreshToken = catchAsync(async (req, res, next) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return next(new AppError('Please provide refresh token', 400));
  }
  
  try {
    // Verify refresh token with its specific secret
    const decoded = jwt.verify(refreshToken, JWT.REFRESH_SECRET);
    
    // Find user
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return next(new AppError('User not found', 401));
    }
    
    // Generate new tokens (token rotation for security)
    const newToken = generateToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);
    
    res.status(200).json({
      status: 'success',
      token: newToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    return next(new AppError('Invalid refresh token', 401));
  }
});

// ========== FORGOT PASSWORD ==========
/**
 * Request password reset email
 * POST /api/auth/forgot-password
 * Body: { email }
 */
exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  
  // Find user by email
  const user = await User.findOne({ email: email.toLowerCase() });
  
  if (!user) {
    // Don't reveal if user exists (security)
    return next(new AppError('No user found with that email', 404));
  }
  
  // Generate password reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });
  
  // Send reset email if service enabled
  if (FEATURES.ENABLED.EMAIL_SERVICE) {
    try {
      await sendPasswordResetEmail(user, resetToken);
      
      res.status(200).json({
        status: 'success',
        message: 'Token sent to email'
      });
    } catch (error) {
      // If email fails, clear the token
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });
      
      return next(new AppError('Error sending email. Try again later.', 500));
    }
  } else {
    // Development mode - return token directly (for testing)
    res.status(200).json({
      status: 'success',
      message: 'Email service disabled. Reset token:',
      resetToken
    });
  }
});

// ========== RESET PASSWORD ==========
/**
 * Reset password using token
 * POST /api/auth/reset-password/:token
 * Body: { password }
 */
exports.resetPassword = catchAsync(async (req, res, next) => {
  const { token } = req.params;
  const { password } = req.body;
  
  // Hash the token to compare with stored hash
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  
  // Find user with valid token (not expired)
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() } // Token not expired
  });
  
  if (!user) {
    return next(new AppError('Token is invalid or has expired', 400));
  }
  
  // Update password and clear reset token fields
  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
  
  // Log user in automatically
  createSendToken(user, 200, res);
});

// ========== VERIFY EMAIL ==========
/**
 * Verify email address using token
 * GET /api/auth/verify-email/:token
 */
exports.verifyEmail = catchAsync(async (req, res, next) => {
  const { token } = req.params;
  
  // Hash token to compare with stored hash
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  
  // Find user with valid token
  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() }
  });
  
  if (!user) {
    return next(new AppError('Token is invalid or has expired', 400));
  }
  
  // Mark email as verified and clear token
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });
  
  res.status(200).json({
    status: 'success',
    message: 'Email verified successfully'
  });
});

// ========== RESEND VERIFICATION ==========
/**
 * Resend email verification link
 * POST /api/auth/resend-verification
 * Body: { email }
 */
exports.resendVerification = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  
  // Find user
  const user = await User.findOne({ email: email.toLowerCase() });
  
  if (!user) {
    return next(new AppError('No user found with that email', 404));
  }
  
  // Check if already verified
  if (user.isEmailVerified) {
    return next(new AppError('Email already verified', 400));
  }
  
  // Generate new verification token
  const verificationToken = user.createEmailVerificationToken();
  await user.save({ validateBeforeSave: false });
  
  // Send email
  await sendEmailVerificationEmail(user, verificationToken);
  
  res.status(200).json({
    status: 'success',
    message: 'Verification email sent'
  });
});

// ========== GET ME ==========
/**
 * Get current user profile
 * GET /api/auth/me
 * (Protected route)
 */
exports.getMe = catchAsync(async (req, res) => {
  // User is already attached to req by auth middleware
  const user = await User.findById(req.user.id)
    .populate('cart')      // Include cart data
    .select('-__v');       // Exclude version field
  
  res.status(200).json({
    status: 'success',
    data: { user }
  });
});

// ========== UPDATE ME ==========
/**
 * Update current user profile
 * PATCH /api/auth/update-me
 * Body: { name, avatar, phone }
 * (Protected route)
 */
exports.updateMe = catchAsync(async (req, res, next) => {
  // Prevent password update through this route (use dedicated endpoint)
  if (req.body.password || req.body.passwordConfirm) {
    return next(new AppError('This route is not for password updates. Please use /update-password', 400));
  }
  
  // Filter allowed fields (prevent updating sensitive fields)
  const allowedFields = ['name', 'avatar', 'phone'];
  const filteredBody = {};
  
  Object.keys(req.body).forEach(key => {
    if (allowedFields.includes(key)) {
      filteredBody[key] = req.body[key];
    }
  });
  
  // Update user
  const user = await User.findByIdAndUpdate(req.user.id, filteredBody, {
    new: true,              // Return updated document
    runValidators: true     // Run schema validators
  });
  
  res.status(200).json({
    status: 'success',
    data: { user }
  });
});

// ========== UPDATE PASSWORD ==========
/**
 * Update password (when user knows current password)
 * PATCH /api/auth/update-password
 * Body: { currentPassword, newPassword }
 * (Protected route)
 */
exports.updatePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  
  // Get user with password field
  const user = await User.findById(req.user.id).select('+password');
  
  // Verify current password
  if (!(await user.comparePassword(currentPassword))) {
    return next(new AppError('Current password is incorrect', 401));
  }
  
  // Update password
  user.password = newPassword;
  await user.save();
  
  // Log user in with new token
  createSendToken(user, 200, res);
});

// ========== DELETE ME ==========
/**
 * Soft delete user account (deactivate)
 * DELETE /api/auth/delete-me
 * (Protected route)
 */
exports.deleteMe = catchAsync(async (req, res, next) => {
  // Soft delete - set active to false instead of actually deleting
  await User.findByIdAndUpdate(req.user.id, { active: false });
  
  res.status(204).json({
    status: 'success',
    data: null
  });
});