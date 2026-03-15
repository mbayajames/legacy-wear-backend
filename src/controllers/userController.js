// controllers/userController.js
// User management controller - handles admin operations for user management
// Includes CRUD operations, statistics, and bulk updates (all admin-only except where noted)

const User = require('../models/User');              // User model for database operations
const AppError = require('../utils/AppError');       // Custom error class
const catchAsync = require('../utils/catchAsync');   // Wrapper to catch async errors
const APIFeatures = require('../utils/apiFeatures'); // Query builder for filtering, sorting, pagination

// ========== GET ALL USERS (Admin only) ==========
/**
 * Get all users with filtering, sorting, and pagination
 * GET /api/users
 * Query params: ?page=1&limit=10&sort=-createdAt&fields=name,email&role=user
 * (Admin only)
 */
exports.getAllUsers = catchAsync(async (req, res) => {
  // Build query using APIFeatures utility
  // This handles filtering, sorting, field selection, and pagination from query string
  const features = new APIFeatures(User.find(), req.query)
    .filter()      // Filter by query params (e.g., ?role=admin)
    .sort()        // Sort results (e.g., ?sort=-createdAt)
    .limitFields() // Select specific fields (e.g., ?fields=name,email)
    .paginate();   // Paginate results (e.g., ?page=2&limit=10)
  
  // Execute the query
  const users = await features.query;
  
  // Get total count for pagination metadata
  const total = await User.countDocuments();
  
  res.status(200).json({
    status: 'success',
    results: users.length,      // Number of users in this page
    total,                       // Total number of users in database
    data: { users }               // Array of user documents
  });
});

// ========== GET USER BY ID (Admin only) ==========
/**
 * Get single user by ID with sensitive fields excluded
 * GET /api/users/:id
 * (Admin only)
 */
exports.getUser = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id)
    .select('-__v -passwordResetToken -passwordResetExpires -emailVerificationToken');
  // Exclude: version key, password reset fields, email verification fields
  
  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: { user }
  });
});

// ========== CREATE USER (Admin only) ==========
/**
 * Create a new user manually (admin creates account for someone)
 * POST /api/users
 * Body: { name, email, password, role }
 * (Admin only)
 */
exports.createUser = catchAsync(async (req, res, next) => {
  const { name, email, password, role } = req.body;
  
  // Check if user already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return next(new AppError('User already exists with this email', 400));
  }
  
  // Create user with optional role (defaults to 'user')
  const user = await User.create({
    name,
    email: email.toLowerCase(), // Normalize email to lowercase
    password,
    role: role || 'user',
    isEmailVerified: true // Admin-created users are auto-verified (no email needed)
  });
  
  // Remove password from response
  user.password = undefined;
  
  res.status(201).json({
    status: 'success',
    data: { user }
  });
});

// ========== UPDATE USER (Admin only) ==========
/**
 * Update user details (except password)
 * PATCH /api/users/:id
 * Body: { name, email, role, active, etc. }
 * (Admin only)
 */
exports.updateUser = catchAsync(async (req, res, next) => {
  // Prevent password update through this route (use dedicated password endpoint)
  if (req.body.password) {
    return next(new AppError('Cannot update password through this route. Use /update-password', 400));
  }
  
  // Update user with provided fields
  const user = await User.findByIdAndUpdate(req.params.id, req.body, {
    new: true,              // Return updated document
    runValidators: true     // Run schema validators
  }).select('-__v -passwordResetToken -passwordResetExpires');
  
  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: { user }
  });
});

// ========== DELETE USER (Admin only) ==========
/**
 * Permanently delete a user from database
 * DELETE /api/users/:id
 * (Admin only - use with caution!)
 */
exports.deleteUser = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndDelete(req.params.id);
  
  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }
  
  // 204 No Content - successful deletion, no response body
  res.status(204).json({
    status: 'success',
    data: null
  });
});

// ========== GET USER STATS (Admin only) ==========
/**
 * Get user statistics and breakdown by role
 * GET /api/users/stats
 * (Admin only)
 */
exports.getUserStats = catchAsync(async (req, res) => {
  // Aggregate pipeline to get statistics by role
  const stats = await User.aggregate([
    {
      // Group by user role
      $group: {
        _id: '$role',        // Group by role field
        count: { $sum: 1 },   // Total users in this role
        
        // Count users with verified email
        verifiedCount: {
          $sum: { $cond: ['$isEmailVerified', 1, 0] }
        },
        
        // Count active users
        activeCount: {
          $sum: { $cond: ['$active', 1, 0] }
        }
      }
    },
    {
      // Add calculated fields
      $project: {
        role: '$_id',         // Rename _id to role
        count: 1,
        verifiedCount: 1,
        activeCount: 1,
        // Calculate unverified users
        unverifiedCount: { $subtract: ['$count', '$verifiedCount'] },
        // Calculate inactive users
        inactiveCount: { $subtract: ['$count', '$activeCount'] }
      }
    }
  ]);
  
  // Get total users across all roles
  const totalUsers = await User.countDocuments();
  
  // Get users registered today (since midnight)
  const newUsersToday = await User.countDocuments({
    createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
  });
  
  res.status(200).json({
    status: 'success',
    data: {
      total: totalUsers,
      newToday: newUsersToday,
      breakdown: stats  // Array of stats by role
    }
  });
});

// ========== GET USER ACTIVITY ==========
/**
 * Get user activity timestamps (login, last active, etc.)
 * GET /api/users/:id/activity
 * (Admin only - for monitoring)
 */
exports.getUserActivity = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id)
    .select('lastLogin lastActive createdAt updatedAt');
  
  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      lastLogin: user.lastLogin,
      lastActive: user.lastActive,
      joinedAt: user.createdAt,
      lastUpdated: user.updatedAt
    }
  });
});

// ========== BULK UPDATE USERS (Admin only) ==========
/**
 * Update multiple users at once
 * POST /api/users/bulk-update
 * Body: { userIds: [id1, id2, ...], updates: { role: 'admin', active: true } }
 * (Admin only - powerful operation!)
 */
exports.bulkUpdateUsers = catchAsync(async (req, res, next) => {
  const { userIds, updates } = req.body;
  
  // Validate input
  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return next(new AppError('Please provide an array of user IDs', 400));
  }
  
  // Perform bulk update
  const result = await User.updateMany(
    { _id: { $in: userIds } },  // Match any of these IDs
    updates,                      // Apply these updates
    { runValidators: true }       // Validate data
  );
  
  res.status(200).json({
    status: 'success',
    data: {
      matched: result.matchedCount,   // Number of documents matched
      modified: result.modifiedCount   // Number of documents actually modified
    }
  });
});