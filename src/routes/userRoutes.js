// routes/userRoutes.js
// User management routes - handles all user administration operations
// All routes are protected and restricted to admin/super-admin roles

const express = require('express');                          // Express router
const userController = require('../controllers/userController'); // User controller
const { protect, restrictTo } = require('../middlewares/auth');  // Authentication middleware
const { validate } = require('../middlewares/validate');    // Input validation middleware
const { 
  createUserValidator,
  updateUserValidator 
} = require('../utils/validators/userValidator');           // User validation schemas

const router = express.Router();

// ========== PUBLIC ROUTES ==========
// (None - all user routes are protected)
// Users cannot access other users' data - this is admin-only functionality

// ========== PROTECTED ROUTES (All authenticated users) ==========
/**
 * Apply authentication middleware to all routes below
 * This ensures all subsequent routes require a valid JWT token
 */
router.use(protect);

// ========== ADMIN ONLY ROUTES ==========
/**
 * Apply role restriction middleware to all routes below
 * This ensures only users with 'admin' or 'super-admin' roles can access these routes
 * Super-admin has all permissions, admin has most permissions
 */
router.use(restrictTo('admin', 'super-admin'));

/**
 * @route   GET /api/users
 * @desc    Get all users with filtering, sorting, pagination
 * @access  Private (Admin only)
 * @query   ?page=1&limit=10&sort=-createdAt&role=user&fields=name,email
 */
router.get('/', userController.getAllUsers);

/**
 * @route   GET /api/users/stats
 * @desc    Get user statistics (total, by role, verified, etc.)
 * @access  Private (Admin only)
 */
router.get('/stats', userController.getUserStats);

/**
 * @route   POST /api/users
 * @desc    Create a new user manually (admin creates account)
 * @access  Private (Admin only)
 * @body    { name, email, password, role }
 */
router.post(
  '/',
  validate(createUserValidator),  // Validate input data
  userController.createUser
);

/**
 * @route   PATCH /api/users/bulk
 * @desc    Update multiple users at once (e.g., bulk role change)
 * @access  Private (Admin only)
 * @body    { userIds: [id1, id2], updates: { role: 'admin' } }
 */
router.patch('/bulk', userController.bulkUpdateUsers);

/**
 * @route   GET /api/users/:id
 * @desc    Get single user by ID
 * @access  Private (Admin only)
 */
router.get('/:id', userController.getUser);

/**
 * @route   PATCH /api/users/:id
 * @desc    Update user details (admin can update any user)
 * @access  Private (Admin only)
 * @body    { name, email, role, active, etc. } (cannot update password)
 */
router.patch(
  '/:id',
  validate(updateUserValidator),  // Validate input data
  userController.updateUser
);

/**
 * @route   DELETE /api/users/:id
 * @desc    Permanently delete a user
 * @access  Private (Admin only)
 * @warning This action cannot be undone!
 */
router.delete('/:id', userController.deleteUser);

/**
 * @route   GET /api/users/:id/activity
 * @desc    Get user activity timestamps (last login, last active, etc.)
 * @access  Private (Admin only)
 */
router.get('/:id/activity', userController.getUserActivity);

module.exports = router;