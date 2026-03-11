const express = require('express');
const {
  updateProfile,
  changePassword,
  updateAvatar,
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  deleteAccount,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
} = require('../controllers/userController');
const { protect, authorize } = require('../middlewares/auth');
const { validate, validationRules } = require('../middlewares/validate');

const router = express.Router();

// User routes
router.put('/profile', protect, validationRules.updateProfile, validate, updateProfile);
router.put('/change-password', protect, validationRules.changePassword, validate, changePassword);
router.put('/avatar', protect, updateAvatar);

// Address routes
router.route('/addresses')
  .get(protect, getAddresses)
  .post(protect, validationRules.addAddress, validate, addAddress);

router.route('/addresses/:addressId')
  .put(protect, updateAddress)
  .delete(protect, deleteAddress);

// Wishlist routes
router.route('/wishlist')
  .get(protect, getWishlist);

router.route('/wishlist/:productId')
  .post(protect, addToWishlist)
  .delete(protect, removeFromWishlist);

// Delete account
router.delete('/account', protect, deleteAccount);

// Admin routes
router.route('/')
  .get(protect, authorize('admin'), getUsers);

router.route('/:id')
  .get(protect, authorize('admin'), getUser)
  .put(protect, authorize('admin'), updateUser)
  .delete(protect, authorize('admin'), deleteUser);

module.exports = router;