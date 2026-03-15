// controllers/adminController.js
// Admin controller - provides comprehensive dashboard, reports, and system monitoring
// All routes in this controller should be protected by admin middleware

const User = require('../models/User');              // User model for user statistics
const Product = require('../models/Product');        // Product model for inventory stats
const Order = require('../models/Order');            // Order model for sales data
const Review = require('../models/Review');          // Review model for moderation queue
const Payment = require('../models/Payment');        // Payment model for financial stats
const AppError = require('../utils/AppError');       // Custom error class
const catchAsync = require('../utils/catchAsync');   // Async error wrapper
const { ADMIN } = require('../config/key');          // Admin configuration

// ========== DASHBOARD STATS ==========
/**
 * Get comprehensive dashboard statistics
 * GET /api/admin/dashboard/stats
 * Returns: user stats, product stats, order stats, revenue, pending items, recent activity
 * (Admin only)
 */
exports.getDashboardStats = catchAsync(async (req, res) => {
  // ===== 1. CALCULATE DATE RANGES =====
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));        // Today 00:00:00
  const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay())); // Start of week (Sunday)
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1); // Start of month
  const startOfYear = new Date(today.getFullYear(), 0, 1);        // Start of year
  
  // ===== 2. RUN PARALLEL QUERIES FOR PERFORMANCE =====
  // Promise.all runs all database queries concurrently for speed
  const [
    totalUsers,
    newUsersToday,
    totalProducts,
    lowStockProducts,
    outOfStockProducts,
    totalOrders,
    ordersToday,
    revenueToday,
    revenueThisMonth,
    revenueThisYear,
    pendingReviews,
    pendingPayments
  ] = await Promise.all([
    // ----- USER STATS -----
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: startOfDay } }),
    
    // ----- PRODUCT STATS -----
    Product.countDocuments(),
    // Count products where stock is <= lowStockAlert AND stock > 0
    Product.countDocuments({ 
      $expr: { $lte: ['$stock', '$lowStockAlert'] },
      stock: { $gt: 0 }
    }),
    Product.countDocuments({ stock: 0 }),
    
    // ----- ORDER STATS -----
    Order.countDocuments(),
    Order.countDocuments({ placedAt: { $gte: startOfDay } }),
    
    // ----- REVENUE STATS (using aggregation) -----
    Order.aggregate([
      { $match: { placedAt: { $gte: startOfDay }, paymentStatus: 'completed' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]),
    Order.aggregate([
      { $match: { placedAt: { $gte: startOfMonth }, paymentStatus: 'completed' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]),
    Order.aggregate([
      { $match: { placedAt: { $gte: startOfYear }, paymentStatus: 'completed' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]),
    
    // ----- MODERATION QUEUE -----
    Review.countDocuments({ status: 'pending' }),
    
    // ----- PENDING PAYMENTS -----
    Payment.countDocuments({ status: 'pending' })
  ]);
  
  // ===== 3. GET RECENT ORDERS FOR DISPLAY =====
  const recentOrders = await Order.find()
    .sort('-placedAt')
    .limit(10)
    .populate('user', 'name email');  // Include user details
  
  // ===== 4. GET TOP SELLING PRODUCTS =====
  const topProducts = await Product.find()
    .sort('-soldCount')
    .limit(5)
    .select('name price soldCount stock images');  // Only needed fields
  
  // ===== 5. FORMAT AND RETURN RESPONSE =====
  res.status(200).json({
    status: 'success',
    data: {
      users: {
        total: totalUsers,
        newToday: newUsersToday
      },
      products: {
        total: totalProducts,
        lowStock: lowStockProducts,
        outOfStock: outOfStockProducts
      },
      orders: {
        total: totalOrders,
        today: ordersToday
      },
      revenue: {
        today: revenueToday[0]?.total || 0,        // Use optional chaining and default
        thisMonth: revenueThisMonth[0]?.total || 0,
        thisYear: revenueThisYear[0]?.total || 0
      },
      pending: {
        reviews: pendingReviews,
        payments: pendingPayments
      },
      recentOrders,
      topProducts
    }
  });
});

// ========== GET RECENT ACTIVITY ==========
/**
 * Get combined recent activity feed
 * GET /api/admin/activity?limit=20
 * Returns: Chronological feed of orders, users, reviews, payments
 * (Admin only)
 */
exports.getRecentActivity = catchAsync(async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  
  // ===== 1. FETCH RECENT DATA FROM ALL COLLECTIONS =====
  const recentOrders = await Order.find()
    .sort('-placedAt')
    .limit(limit)
    .populate('user', 'name email')
    .select('orderNumber totalAmount status placedAt');
  
  const recentUsers = await User.find()
    .sort('-createdAt')
    .limit(limit)
    .select('name email role createdAt');
  
  const recentReviews = await Review.find()
    .sort('-createdAt')
    .limit(limit)
    .populate('user', 'name')
    .populate('product', 'name')
    .select('rating title status createdAt');
  
  const recentPayments = await Payment.find()
    .sort('-createdAt')
    .limit(limit)
    .populate('user', 'name email')
    .populate('order', 'orderNumber')
    .select('amount method status createdAt');
  
  // ===== 2. COMBINE AND FORMAT ACTIVITY ITEMS =====
  const activity = [
    // Format orders as activity items
    ...recentOrders.map(o => ({
      type: 'order',
      id: o._id,
      title: `Order #${o.orderNumber}`,
      description: `KES ${o.totalAmount} - ${o.status}`,
      user: o.user,
      createdAt: o.placedAt,
      link: `/admin/orders/${o._id}`  // Admin UI link
    })),
    // Format users as activity items
    ...recentUsers.map(u => ({
      type: 'user',
      id: u._id,
      title: `New User: ${u.name}`,
      description: u.email,
      user: u,
      createdAt: u.createdAt,
      link: `/admin/users/${u._id}`
    })),
    // Format reviews as activity items
    ...recentReviews.map(r => ({
      type: 'review',
      id: r._id,
      title: `Review: ${r.title}`,
      description: `${r.rating} stars - ${r.status}`,
      user: r.user,
      product: r.product,
      createdAt: r.createdAt,
      link: `/admin/reviews/${r._id}`
    })),
    // Format payments as activity items
    ...recentPayments.map(p => ({
      type: 'payment',
      id: p._id,
      title: `Payment: ${p.method}`,
      description: `KES ${p.amount} - ${p.status}`,
      user: p.user,
      order: p.order,
      createdAt: p.createdAt,
      link: `/admin/payments/${p._id}`
    }))
  ]
  // Sort all activity by date (newest first)
  .sort((a, b) => b.createdAt - a.createdAt)
  // Limit to requested number
  .slice(0, limit);

  res.status(200).json({
    status: 'success',
    results: activity.length,
    data: { activity }
  });
});

// ========== GET SALES REPORT ==========
/**
 * Generate sales report with various grouping options
 * GET /api/admin/reports/sales?startDate=2024-01-01&endDate=2024-03-31&groupBy=day
 * Returns: Sales data grouped by day/month/year, payment method breakdown, top products
 * (Admin only)
 */
exports.getSalesReport = catchAsync(async (req, res) => {
  const { startDate, endDate, groupBy = 'day' } = req.query;

  // ===== 1. BUILD DATE FILTER =====
  const match = {};
  if (startDate || endDate) {
    match.placedAt = {};
    if (startDate) match.placedAt.$gte = new Date(startDate);
    if (endDate) match.placedAt.$lte = new Date(endDate);
  }
  // Only include completed payments in sales data
  match.paymentStatus = 'completed';

  // ===== 2. DETERMINE GROUPING BASED ON REQUEST =====
  let groupId;
  switch(groupBy) {
    case 'day':
      groupId = {
        year: { $year: '$placedAt' },
        month: { $month: '$placedAt' },
        day: { $dayOfMonth: '$placedAt' }
      };
      break;
    case 'month':
      groupId = {
        year: { $year: '$placedAt' },
        month: { $month: '$placedAt' }
      };
      break;
    case 'year':
      groupId = { year: { $year: '$placedAt' } };
      break;
    default:
      groupId = {
        year: { $year: '$placedAt' },
        month: { $month: '$placedAt' },
        day: { $dayOfMonth: '$placedAt' }
      };
  }

  // ===== 3. AGGREGATE SALES DATA =====
  const salesData = await Order.aggregate([
    { $match: match },                    // Filter by date
    {
      $group: {
        _id: groupId,                       // Group by time period
        orders: { $sum: 1 },                 // Number of orders
        revenue: { $sum: '$totalAmount' },   // Total revenue
        items: { $sum: '$itemsCount' },      // Total items sold
        averageOrderValue: { $avg: '$totalAmount' }  // Average order value
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }  // Chronological order
  ]);

  // ===== 4. GET PAYMENT METHOD BREAKDOWN =====
  const paymentMethods = await Payment.aggregate([
    { $match: { status: 'completed' } },
    {
      $group: {
        _id: '$method',      // Group by payment method (mpesa, card, etc.)
        count: { $sum: 1 },
        total: { $sum: '$amount' }
      }
    }
  ]);

  // ===== 5. GET TOP SELLING PRODUCTS =====
  const topProducts = await Order.aggregate([
    { $match: match },                       // Apply same date filter
    { $unwind: '$items' },                    // Deconstruct items array
    {
      $group: {
        _id: '$items.product',                 // Group by product ID
        name: { $first: '$items.name' },       // Product name (from snapshot)
        quantity: { $sum: '$items.quantity' }, // Total quantity sold
        revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } // Revenue
      }
    },
    { $sort: { quantity: -1 } },               // Most sold first
    { $limit: 10 }                              // Top 10 products
  ]);

  // ===== 6. CALCULATE SUMMARY TOTALS =====
  res.status(200).json({
    status: 'success',
    data: {
      salesData,
      paymentMethods,
      topProducts,
      summary: {
        totalOrders: salesData.reduce((sum, d) => sum + d.orders, 0),
        totalRevenue: salesData.reduce((sum, d) => sum + d.revenue, 0),
        totalItems: salesData.reduce((sum, d) => sum + d.items, 0),
        averageOrderValue: salesData.length > 0 
          ? salesData.reduce((sum, d) => sum + d.averageOrderValue, 0) / salesData.length 
          : 0
      }
    }
  });
});

// ========== GET INVENTORY REPORT ==========
/**
 * Get inventory status report
 * GET /api/admin/reports/inventory
 * Returns: Products grouped by stock status, inventory value, counts
 * (Admin only)
 */
exports.getInventoryReport = catchAsync(async (req, res) => {
  // ===== 1. CLASSIFY PRODUCTS BY STOCK STATUS =====
  const products = await Product.aggregate([
    {
      $project: {
        name: 1,
        sku: 1,
        stock: 1,
        lowStockAlert: 1,
        price: 1,
        soldCount: 1,
        status: 1,
        // Calculate stock status using conditional logic
        stockStatus: {
          $cond: [
            { $eq: ['$stock', 0] },                       // If stock = 0
            'out_of_stock',
            { $cond: [
              { $lte: ['$stock', '$lowStockAlert'] },     // If stock <= lowStockAlert
              'low_stock',
              'in_stock'                                    // Otherwise in stock
            ]}
          ]
        }
      }
    },
    {
      $group: {
        _id: '$stockStatus',                               // Group by status
        count: { $sum: 1 },                                 // Number of products
        products: { $push: '$$ROOT' },                      // Include product details
        totalValue: { 
          $sum: { $multiply: ['$price', '$stock'] }        // Calculate inventory value
        }
      }
    }
  ]);

  // ===== 2. CALCULATE TOTAL INVENTORY VALUE =====
  const totalValue = await Product.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: { $multiply: ['$price', '$stock'] } }
      }
    }
  ]);

  // ===== 3. FORMAT RESPONSE WITH SUMMARY =====
  res.status(200).json({
    status: 'success',
    data: {
      inventory: products,
      totalInventoryValue: totalValue[0]?.total || 0,
      summary: {
        inStock: products.find(p => p._id === 'in_stock')?.count || 0,
        lowStock: products.find(p => p._id === 'low_stock')?.count || 0,
        outOfStock: products.find(p => p._id === 'out_of_stock')?.count || 0
      }
    }
  });
});

// ========== GET SYSTEM HEALTH ==========
/**
 * Monitor system health and performance
 * GET /api/admin/system/health
 * Returns: Database status, system metrics, queue information
 * (Admin only)
 */
exports.getSystemHealth = catchAsync(async (req, res) => {
  const mongoose = require('mongoose');
  
  // ===== 1. DATABASE STATUS =====
  // mongoose.connection.readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  
  // ===== 2. GET BASIC COUNTS =====
  const [
    userCount,
    productCount,
    orderCount,
    pendingOrderCount
  ] = await Promise.all([
    User.countDocuments(),
    Product.countDocuments(),
    Order.countDocuments(),
    Order.countDocuments({ status: 'pending' })
  ]);

  // ===== 3. GET BACKUP INFO (IF IMPLEMENTED) =====
  const lastBackup = await getLastBackupInfo();

  // ===== 4. RETURN SYSTEM METRICS =====
  res.status(200).json({
    status: 'success',
    data: {
      database: {
        status: dbStatus,
        collections: {
          users: userCount,
          products: productCount,
          orders: orderCount
        }
      },
      system: {
        uptime: process.uptime(),                          // Server uptime in seconds
        memoryUsage: process.memoryUsage(),                 // Memory stats (rss, heapTotal, heapUsed)
        nodeVersion: process.version,                       // Node.js version
        environment: process.env.NODE_ENV                    // Development/production
      },
      queue: {
        pendingOrders: pendingOrderCount                     // Orders needing attention
      },
      backup: lastBackup,
      timestamp: new Date().toISOString()                    // Current server time
    }
  });
});

// ========== HELPER FUNCTIONS ==========
/**
 * Get last backup information
 * Implement based on your backup system (e.g., MongoDB Atlas backups, custom cron jobs)
 */
const getLastBackupInfo = async () => {
  // TODO: Implement based on your backup solution
  // This could:
  // - Check a backup log collection
  // - Query MongoDB Atlas API
  // - Check file system for backup files
  // - Query a monitoring service
  return {
    lastBackup: null,
    status: 'not_configured'
  };
};