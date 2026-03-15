// controllers/orderController.js
// Order controller - handles all order-related operations for customers and admins
// Includes order creation, tracking, cancellation, and admin management

const Order = require('../models/Order');           // Order model for database operations
const Cart = require('../models/Cart');             // Cart model to get user's cart
const Product = require('../models/Product');       // Product model for stock updates
const Payment = require('../models/Payment');       // Payment model for transaction records
const AppError = require('../utils/AppError');      // Custom error class
const catchAsync = require('../utils/catchAsync');  // Wrapper to catch async errors
const APIFeatures = require('../utils/apiFeatures'); // Query builder for filtering, sorting, pagination
const { sendOrderConfirmationEmail, sendShippingUpdateEmail } = require('../services/emailService'); // Email notifications

// ========== CREATE ORDER ==========
/**
 * Create a new order from user's cart
 * POST /api/orders
 * Body: { shippingAddress, paymentMethod, notes }
 * (Protected route - user must be logged in)
 */
exports.createOrder = catchAsync(async (req, res, next) => {
  const { shippingAddress, paymentMethod, notes } = req.body;
  
  // ===== 1. GET USER'S CART =====
  const cart = await Cart.findOne({ user: req.user.id })
    .populate('items.product');  // Populate product details for validation
  
  if (!cart || cart.items.length === 0) {
    return next(new AppError('Your cart is empty', 400));
  }
  
  // ===== 2. VALIDATE STOCK AND PREPARE ORDER ITEMS =====
  const orderItems = [];
  for (const item of cart.items) {
    const product = item.product;
    
    // Check if enough stock is available
    if (product.stock < item.quantity) {
      return next(new AppError(`Insufficient stock for ${product.name}`, 400));
    }
    
    // Create order item snapshot (immutable record)
    orderItems.push({
      product: product._id,
      name: product.name,               // Snapshot of product name
      quantity: item.quantity,
      price: item.price,                 // Price at time of order
      variant: item.variant,             // Size/color chosen
      image: product.primaryImage?.url   // Product image for receipt
    });
  }
  
  // ===== 3. CALCULATE ORDER TOTALS =====
  const subtotal = cart.subtotal;
  const shippingCost = subtotal >= 10000 ? 0 : 500; // Free shipping over KES 10,000
  const taxAmount = subtotal * 0.16;                 // 16% VAT (Kenya)
  const discountAmount = cart.discountAmount || 0;
  const totalAmount = subtotal + shippingCost + taxAmount - discountAmount;
  
  // ===== 4. GENERATE UNIQUE ORDER NUMBER =====
  const orderNumber = await generateOrderNumber();
  
  // ===== 5. CREATE ORDER IN DATABASE =====
  const order = await Order.create({
    orderNumber,
    user: req.user.id,
    items: orderItems,
    subtotal,
    shippingCost,
    taxAmount,
    discountAmount,
    totalAmount,
    shippingAddress,
    paymentMethod,
    customerNotes: notes,
    placedAt: new Date(),
    ipAddress: req.ip,                  // For fraud detection
    userAgent: req.get('user-agent')     // Browser/device info
  });
  
  // ===== 6. UPDATE PRODUCT STOCK (DEDUCT PURCHASED QUANTITIES) =====
  for (const item of cart.items) {
    await Product.findByIdAndUpdate(item.product._id, {
      $inc: { stock: -item.quantity }   // Decrease stock
    });
  }
  
  // ===== 7. CREATE PAYMENT RECORD =====
  await Payment.create({
    order: order._id,
    user: req.user.id,
    amount: totalAmount,
    method: paymentMethod,
    status: 'pending'                    // Payment pending until processed
  });
  
  // ===== 8. CLEAR USER'S CART =====
  await cart.clearCart();
  
  // ===== 9. SEND CONFIRMATION EMAIL =====
  try {
    await sendOrderConfirmationEmail(req.user, order);
  } catch (error) {
    // Log but don't fail the order if email fails
    console.error('Failed to send order confirmation email:', error);
  }
  
  // ===== 10. RETURN SUCCESS RESPONSE =====
  res.status(201).json({
    status: 'success',
    data: { order }
  });
});

// ========== GET MY ORDERS ==========
/**
 * Get logged-in user's order history with pagination
 * GET /api/orders/my-orders
 * Query params: ?page=1&limit=10&sort=-placedAt
 * (Protected route)
 */
exports.getMyOrders = catchAsync(async (req, res) => {
  const features = new APIFeatures(
    Order.find({ user: req.user.id }),  // Only user's orders
    req.query
  )
    .filter()
    .sort('-placedAt')                   // Newest first by default
    .limitFields()
    .paginate();
  
  const orders = await features.query;
  const total = await Order.countDocuments({ user: req.user.id });
  
  res.status(200).json({
    status: 'success',
    results: orders.length,
    total,
    data: { orders }
  });
});

// ========== GET MY ORDER BY ID ==========
/**
 * Get specific order details for logged-in user
 * GET /api/orders/my-orders/:id
 * (Protected route - user can only access their own orders)
 */
exports.getMyOrder = catchAsync(async (req, res, next) => {
  const order = await Order.findOne({
    _id: req.params.id,
    user: req.user.id                     // Ensure order belongs to user
  }).populate('items.product', 'name images');  // Include product details
  
  if (!order) {
    return next(new AppError('No order found with that ID', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: { order }
  });
});

// ========== CANCEL ORDER ==========
/**
 * Cancel an order (customer-initiated cancellation)
 * POST /api/orders/:id/cancel
 * (Protected route - user can only cancel their own orders)
 */
exports.cancelOrder = catchAsync(async (req, res, next) => {
  const order = await Order.findOne({
    _id: req.params.id,
    user: req.user.id
  });
  
  if (!order) {
    return next(new AppError('No order found with that ID', 404));
  }
  
  // Check if order can be cancelled (based on status)
  if (!order.isCancellable) {
    return next(new AppError('Order cannot be cancelled at this stage', 400));
  }
  
  // Update order status
  order.status = 'cancelled';
  order.statusHistory.push({
    status: 'cancelled',
    note: 'Cancelled by customer',
    changedAt: new Date()
  });
  await order.save();
  
  // Restore product stock (return items to inventory)
  for (const item of order.items) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: item.quantity }     // Increase stock back
    });
  }
  
  // Update payment record if exists
  const payment = await Payment.findOne({ order: order._id });
  if (payment) {
    payment.status = 'refunded';
    payment.refundedAt = new Date();
    await payment.save();
  }
  
  res.status(200).json({
    status: 'success',
    message: 'Order cancelled successfully',
    data: { order }
  });
});

// ========== TRACK ORDER ==========
/**
 * Track order status by order number (public - no auth required)
 * GET /api/orders/track/:orderNumber
 * Useful for customers who aren't logged in
 */
exports.trackOrder = catchAsync(async (req, res, next) => {
  const { orderNumber } = req.params;
  
  const order = await Order.findOne({ orderNumber })
    .select('orderNumber status shippingStatus trackingNumber estimatedDelivery statusHistory');
  // Only expose limited information
  
  if (!order) {
    return next(new AppError('No order found with that number', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: { order }
  });
});

// ========== ADMIN: GET ALL ORDERS ==========
/**
 * Get all orders (admin only) with filtering, sorting, pagination
 * GET /api/orders
 * Query params: ?status=pending&sort=-placedAt&page=1
 * (Admin only)
 */
exports.getAllOrders = catchAsync(async (req, res) => {
  const features = new APIFeatures(
    Order.find().populate('user', 'name email'),  // Include user details
    req.query
  )
    .filter()
    .sort('-placedAt')
    .limitFields()
    .paginate();
  
  const orders = await features.query;
  const total = await Order.countDocuments();
  
  res.status(200).json({
    status: 'success',
    results: orders.length,
    total,
    data: { orders }
  });
});

// ========== ADMIN: GET ORDER BY ID ==========
/**
 * Get detailed order information (admin only)
 * GET /api/orders/:id
 * (Admin only)
 */
exports.getOrder = catchAsync(async (req, res, next) => {
  const order = await Order.findById(req.params.id)
    .populate('user', 'name email phone')          // Full user details
    .populate('items.product', 'name sku');        // Product details with SKU
  
  if (!order) {
    return next(new AppError('No order found with that ID', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: { order }
  });
});

// ========== ADMIN: UPDATE ORDER STATUS ==========
/**
 * Update order status (admin only)
 * PATCH /api/orders/:id/status
 * Body: { status, note }
 * (Admin only)
 */
exports.updateOrderStatus = catchAsync(async (req, res, next) => {
  const { status, note } = req.body;
  
  const order = await Order.findById(req.params.id);
  
  if (!order) {
    return next(new AppError('No order found with that ID', 404));
  }
  
  // Update status
  order.status = status;
  order.statusHistory.push({
    status,
    note: note || `Status updated to ${status}`,
    changedBy: req.user.id,                // Track who made the change
    changedAt: new Date()
  });
  
  // Set specific timestamps based on status
  switch(status) {
    case 'confirmed':
      order.confirmedAt = new Date();
      break;
    case 'processing':
      order.processedAt = new Date();
      break;
    case 'shipped':
      order.shippedAt = new Date();
      break;
    case 'delivered':
      order.deliveredAt = new Date();
      break;
  }
  
  await order.save();
  
  // Send email notification to customer
  try {
    await sendShippingUpdateEmail(order);
  } catch (error) {
    console.error('Failed to send shipping update email:', error);
  }
  
  res.status(200).json({
    status: 'success',
    data: { order }
  });
});

// ========== ADMIN: UPDATE SHIPPING STATUS ==========
/**
 * Update shipping details (admin only)
 * PATCH /api/orders/:id/shipping
 * Body: { shippingStatus, trackingNumber, trackingUrl, estimatedDelivery }
 * (Admin only)
 */
exports.updateShippingStatus = catchAsync(async (req, res, next) => {
  const { shippingStatus, trackingNumber, trackingUrl, estimatedDelivery } = req.body;
  
  const order = await Order.findById(req.params.id);
  
  if (!order) {
    return next(new AppError('No order found with that ID', 404));
  }
  
  // Update shipping fields
  order.shippingStatus = shippingStatus;
  
  if (trackingNumber) order.trackingNumber = trackingNumber;
  if (trackingUrl) order.trackingUrl = trackingUrl;
  if (estimatedDelivery) order.estimatedDelivery = estimatedDelivery;
  
  // Set delivery timestamp if delivered
  if (shippingStatus === 'delivered') {
    order.deliveredAt = new Date();
  }
  
  await order.save();
  
  res.status(200).json({
    status: 'success',
    data: { order }
  });
});

// ========== ADMIN: GET ORDER STATS ==========
/**
 * Get order statistics for dashboard (admin only)
 * GET /api/orders/stats?startDate=2024-01-01&endDate=2024-03-31
 * Returns: status breakdown, daily stats, totals
 * (Admin only)
 */
exports.getOrderStats = catchAsync(async (req, res) => {
  const { startDate, endDate } = req.query;
  
  // Build date filter
  const match = {};
  if (startDate || endDate) {
    match.placedAt = {};
    if (startDate) match.placedAt.$gte = new Date(startDate);
    if (endDate) match.placedAt.$lte = new Date(endDate);
  }
  
  // Aggregation pipeline for order statistics
  const stats = await Order.aggregate([
    { $match: match },                                    // Filter by date
    {
      $group: {
        _id: '$status',                                    // Group by status
        count: { $sum: 1 },                                 // Number of orders
        totalRevenue: { $sum: '$totalAmount' },            // Revenue from this status
        avgOrderValue: { $avg: '$totalAmount' }            // Average order value
      }
    },
    {
      $group: {
        _id: null,                                          // Group all into one document
        statuses: {
          $push: {                                          // Array of status breakdowns
            status: '$_id',
            count: '$count',
            revenue: '$totalRevenue',
            avgValue: { $round: ['$avgOrderValue', 2] }
          }
        },
        totalOrders: { $sum: '$count' },                    // Total orders overall
        totalRevenue: { $sum: '$totalRevenue' },            // Total revenue overall
        overallAvgValue: { $avg: '$avgOrderValue' }         // Overall average
      }
    }
  ]);
  
  // Daily statistics (last 30 days)
  const dailyStats = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          year: { $year: '$placedAt' },
          month: { $month: '$placedAt' },
          day: { $dayOfMonth: '$placedAt' }
        },
        orders: { $sum: 1 },
        revenue: { $sum: '$totalAmount' }
      }
    },
    { $sort: { '_id.year': -1, '_id.month': -1, '_id.day': -1 } },
    { $limit: 30 }                                          // Last 30 days
  ]);
  
  res.status(200).json({
    status: 'success',
    data: {
      summary: stats[0] || { totalOrders: 0, totalRevenue: 0 },
      dailyStats
    }
  });
});

// ========== HELPER FUNCTIONS ==========
/**
 * Generate unique order number
 * Format: LW-YYMMDD-SEQUENCE (e.g., LW-240315-0001)
 * - LW: Legacy Wear prefix
 * - YYMMDD: Date (year, month, day)
 * - SEQUENCE: 4-digit sequential number for the day
 */
const generateOrderNumber = async () => {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  // Get count of orders placed today
  const startOfDay = new Date(date.setHours(0, 0, 0, 0));
  const endOfDay = new Date(date.setHours(23, 59, 59, 999));
  
  const count = await Order.countDocuments({
    placedAt: { $gte: startOfDay, $lte: endOfDay }
  });
  
  // Sequence number (incrementing for the day)
  const sequence = String(count + 1).padStart(4, '0');
  
  return `LW-${year}${month}${day}-${sequence}`;
};