// routes/adminRoutes.js
// Admin routes - provides administrative dashboard, reports, and system monitoring
// All routes are protected and restricted to admin/super-admin roles only

const express = require('express');                          // Express router
const adminController = require('../controllers/adminController'); // Admin controller
const { protect, restrictTo } = require('../middlewares/auth');  // Authentication middleware

const router = express.Router();

// ========== ADMIN AUTHORIZATION ==========
/**
 * Apply authentication and role restriction to ALL routes in this file
 * This ensures every admin endpoint is properly secured
 */
router.use(protect);                    // Must be logged in
router.use(restrictTo('admin', 'super-admin')); // Must be admin or super-admin

// ========== DASHBOARD ROUTES ==========
// Routes for the main admin dashboard with key metrics

/**
 * @route   GET /api/admin/dashboard/stats
 * @desc    Get comprehensive dashboard statistics
 * @access  Private (Admin only)
 * @returns {Object} User stats, product stats, order stats, revenue, pending items
 */
router.get('/dashboard/stats', adminController.getDashboardStats);

/**
 * @route   GET /api/admin/dashboard/activity
 * @desc    Get recent activity feed (orders, users, reviews, payments)
 * @access  Private (Admin only)
 * @query   ?limit=20 (number of activities to return)
 * @returns {Array} Chronological list of recent activities
 */
router.get('/dashboard/activity', adminController.getRecentActivity);

// ========== REPORT ROUTES ==========
// Routes for generating business reports and analytics

/**
 * @route   GET /api/admin/reports/sales
 * @desc    Generate sales report with various grouping options
 * @access  Private (Admin only)
 * @query   ?startDate=2024-01-01&endDate=2024-03-31&groupBy=day|month|year
 * @returns {Object} Sales data, payment methods, top products, summary
 */
router.get('/reports/sales', adminController.getSalesReport);

/**
 * @route   GET /api/admin/reports/inventory
 * @desc    Get inventory status report
 * @access  Private (Admin only)
 * @returns {Object} Products grouped by stock status, inventory value, counts
 */
router.get('/reports/inventory', adminController.getInventoryReport);

// ========== SYSTEM ROUTES ==========
// Routes for monitoring system health and performance

/**
 * @route   GET /api/admin/system/health
 * @desc    Monitor system health and performance metrics
 * @access  Private (Admin only)
 * @returns {Object} Database status, system metrics, queue information
 */
router.get('/system/health', adminController.getSystemHealth);

module.exports = router;