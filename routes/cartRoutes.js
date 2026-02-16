const express = require('express');
const {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
} = require('../controllers/cartController');
const { protect } = require('../middlewares/auth');

const router = express.Router();

router.route('/')
  .get(protect, getCart)
  .delete(protect, clearCart);

router.post('/items', protect, addToCart);

router.route('/items/:itemId')
  .put(protect, updateCartItem)
  .delete(protect, removeFromCart);

module.exports = router;