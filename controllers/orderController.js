const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
exports.createOrder = asyncHandler(async (req, res, next) => {
  const {
    orderItems,
    shippingAddress,
    paymentMethod,
    itemsPrice,
    taxPrice,
    shippingPrice,
    totalPrice,
  } = req.body;

  if (!orderItems || orderItems.length === 0) {
    return next(new ErrorResponse('No order items', 400));
  }

  // Validate stock for all items
  for (const item of orderItems) {
    const product = await Product.findById(item.product);
    if (!product) {
      return next(new ErrorResponse(`Product not found: ${item.name}`, 404));
    }
    if (product.totalStock < item.quantity) {
      return next(
        new ErrorResponse(`Not enough stock for ${product.name}`, 400)
      );
    }
  }

  const order = await Order.create({
    user: req.user.id,
    orderItems,
    shippingAddress,
    paymentMethod,
    itemsPrice,
    taxPrice,
    shippingPrice,
    totalPrice,
  });

  // Update product stock and sold count
  for (const item of orderItems) {
    const product = await Product.findById(item.product);
    product.totalStock -= item.quantity;
    product.soldCount += item.quantity;
    
    // Update size/color specific stock if applicable
    if (item.size) {
      const sizeIndex = product.sizes.findIndex((s) => s.size === item.size);
      if (sizeIndex > -1) {
        product.sizes[sizeIndex].stock -= item.quantity;
      }
    }
    
    await product.save({ validateBeforeSave: false });
  }

  // Clear user's cart
  await Cart.findOneAndUpdate(
    { user: req.user.id },
    { items: [], totalItems: 0, totalPrice: 0 }
  );

  res.status(201).json({
    success: true,
    data: order,
  });
});

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
exports.getOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id)
    .populate('user', 'name email')
    .populate('orderItems.product', 'name images');

  if (!order) {
    return next(new ErrorResponse('Order not found', 404));
  }

  // Make sure user is order owner or admin
  if (order.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to view this order', 403));
  }

  res.status(200).json({
    success: true,
    data: order,
  });
});

// @desc    Get logged in user orders
// @route   GET /api/orders/my-orders
// @access  Private
exports.getMyOrders = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const orders = await Order.find({ user: req.user.id })
    .populate('orderItems.product', 'name images')
    .limit(limit)
    .skip(skip)
    .sort('-createdAt');

  const total = await Order.countDocuments({ user: req.user.id });

  res.status(200).json({
    success: true,
    count: orders.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: orders,
  });
});

// @desc    Update order to paid
// @route   PUT /api/orders/:id/pay
// @access  Private
exports.updateOrderToPaid = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return next(new ErrorResponse('Order not found', 404));
  }

  order.isPaid = true;
  order.paidAt = Date.now();
  order.status = 'processing';
  order.paymentResult = {
    id: req.body.id,
    status: req.body.status,
    update_time: req.body.update_time,
    email_address: req.body.email_address,
  };

  const updatedOrder = await order.save();

  res.status(200).json({
    success: true,
    data: updatedOrder,
  });
});

// @desc    Create payment intent
// @route   POST /api/orders/:id/payment-intent
// @access  Private
exports.createPaymentIntent = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return next(new ErrorResponse('Order not found', 404));
  }

  // Make sure user is order owner
  if (order.user.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized', 403));
  }

  const paymentIntent = await getStripe().paymentIntents.create({
    amount: Math.round(order.totalPrice * 100), // Convert to cents
    currency: 'kes',
    metadata: {
      orderId: order._id.toString(),
      userId: req.user.id,
    },
  });

  res.status(200).json({
    success: true,
    clientSecret: paymentIntent.client_secret,
  });
});

// ADMIN ROUTES

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private/Admin
exports.getOrders = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  let query = {};

  // Filter by status
  if (req.query.status) {
    query.status = req.query.status;
  }

  // Filter by payment status
  if (req.query.isPaid !== undefined) {
    query.isPaid = req.query.isPaid === 'true';
  }

  const orders = await Order.find(query)
    .populate('user', 'name email')
    .populate('orderItems.product', 'name')
    .limit(limit)
    .skip(skip)
    .sort('-createdAt');

  const total = await Order.countDocuments(query);

  res.status(200).json({
    success: true,
    count: orders.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: orders,
  });
});

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
exports.updateOrderStatus = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return next(new ErrorResponse('Order not found', 404));
  }

  order.status = req.body.status;

  if (req.body.status === 'delivered') {
    order.isDelivered = true;
    order.deliveredAt = Date.now();
  }

  if (req.body.trackingNumber) {
    order.trackingNumber = req.body.trackingNumber;
  }

  if (req.body.carrier) {
    order.carrier = req.body.carrier;
  }

  await order.save();

  res.status(200).json({
    success: true,
    data: order,
  });
});

// @desc    Cancel order
// @route   PUT /api/orders/:id/cancel
// @access  Private
exports.cancelOrder = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return next(new ErrorResponse('Order not found', 404));
  }

  // Check authorization
  if (order.user.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to cancel this order', 403));
  }

  // Can only cancel pending or processing orders
  if (!['pending', 'processing'].includes(order.status)) {
    return next(new ErrorResponse('Cannot cancel order at this stage', 400));
  }

  order.status = 'cancelled';
  order.cancelReason = req.body.reason;

  // Restore product stock
  for (const item of order.orderItems) {
    const product = await Product.findById(item.product);
    if (product) {
      product.totalStock += item.quantity;
      product.soldCount -= item.quantity;
      await product.save({ validateBeforeSave: false });
    }
  }

  await order.save();

  res.status(200).json({
    success: true,
    data: order,
  });
});

// @desc    Get order statistics (Admin)
// @route   GET /api/orders/stats
// @access  Private/Admin
exports.getOrderStats = asyncHandler(async (req, res, next) => {
  const totalOrders = await Order.countDocuments();
  const pendingOrders = await Order.countDocuments({ status: 'pending' });
  const processingOrders = await Order.countDocuments({ status: 'processing' });
  const deliveredOrders = await Order.countDocuments({ status: 'delivered' });
  
  const totalRevenue = await Order.aggregate([
    { $match: { isPaid: true } },
    { $group: { _id: null, total: { $sum: '$totalPrice' } } },
  ]);

  res.status(200).json({
    success: true,
    data: {
      totalOrders,
      pendingOrders,
      processingOrders,
      deliveredOrders,
      totalRevenue: totalRevenue[0]?.total || 0,
    },
  });
});