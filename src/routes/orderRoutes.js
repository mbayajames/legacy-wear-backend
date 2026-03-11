const express = require('express');
const {
  createOrder,
  getOrder,
  getMyOrders,
  updateOrderToPaid,
  createPaymentIntent,
  getOrders,
  updateOrderStatus,
  cancelOrder,
  getOrderStats,
} = require('../controllers/orderController');
const { protect, authorize } = require('../middlewares/auth');

const router = express.Router();

// User routes
router.post('/', protect, createOrder);
router.get('/my-orders', protect, getMyOrders);
router.get('/:id', protect, getOrder);
router.put('/:id/pay', protect, updateOrderToPaid);
router.post('/:id/payment-intent', protect, createPaymentIntent);
router.put('/:id/cancel', protect, cancelOrder);

// Admin routes
router.get('/', protect, authorize('admin'), getOrders);
router.get('/stats', protect, authorize('admin'), getOrderStats);
router.put('/:id/status', protect, authorize('admin'), updateOrderStatus);

module.exports = router;