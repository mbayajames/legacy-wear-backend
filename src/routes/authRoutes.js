const express = require('express');
const passport = require('passport');
const {
  register,
  login,
  logout,
  getMe,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  refreshToken,
  googleCallback,
} = require('../controllers/authController');
const { protect } = require('../middlewares/auth');
const { validate, validationRules } = require('../middlewares/validate');

const router = express.Router();

router.post('/register', validationRules.register, validate, register);
router.post('/login', validationRules.login, validate, login);
router.get('/logout', logout);
router.get('/me', protect, getMe);
router.get('/verify-email/:token', verifyEmail);
router.post('/resend-verification', protect, resendVerification);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:token', validationRules.resetPassword, validate, resetPassword);
router.post('/refresh-token', refreshToken);

// Google OAuth routes
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  googleCallback
);

module.exports = router;