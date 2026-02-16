const { validationResult } = require('express-validator');

exports.validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const extractedErrors = [];
    errors.array().map((err) => extractedErrors.push({ [err.path]: err.msg }));

    return res.status(400).json({
      success: false,
      errors: extractedErrors,
    });
  }
  
  next();
};

exports.validationRules = {
  register: [
    require('express-validator').body('name')
      .trim()
      .notEmpty()
      .withMessage('Name is required')
      .isLength({ min: 2, max: 50 })
      .withMessage('Name must be between 2 and 50 characters'),
    
    require('express-validator').body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Please provide a valid email')
      .normalizeEmail(),
    
    require('express-validator').body('password')
      .notEmpty()
      .withMessage('Password is required')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
  ],

  login: [
    require('express-validator').body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Please provide a valid email')
      .normalizeEmail(),
    
    require('express-validator').body('password')
      .notEmpty()
      .withMessage('Password is required'),
  ],

  updateProfile: [
    require('express-validator').body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Name must be between 2 and 50 characters'),
    
    require('express-validator').body('email')
      .optional()
      .trim()
      .isEmail()
      .withMessage('Please provide a valid email')
      .normalizeEmail(),
    
    require('express-validator').body('phoneNumber')
      .optional()
      .trim()
      .isMobilePhone()
      .withMessage('Please provide a valid phone number'),
  ],

  changePassword: [
    require('express-validator').body('currentPassword')
      .notEmpty()
      .withMessage('Current password is required'),
    
    require('express-validator').body('newPassword')
      .notEmpty()
      .withMessage('New password is required')
      .isLength({ min: 6 })
      .withMessage('New password must be at least 6 characters'),
  ],

  resetPassword: [
    require('express-validator').body('password')
      .notEmpty()
      .withMessage('Password is required')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
  ],

  addAddress: [
    require('express-validator').body('fullName')
      .trim()
      .notEmpty()
      .withMessage('Full name is required'),
    
    require('express-validator').body('phoneNumber')
      .trim()
      .notEmpty()
      .withMessage('Phone number is required'),
    
    require('express-validator').body('addressLine1')
      .trim()
      .notEmpty()
      .withMessage('Address line 1 is required'),
    
    require('express-validator').body('city')
      .trim()
      .notEmpty()
      .withMessage('City is required'),
    
    require('express-validator').body('state')
      .trim()
      .notEmpty()
      .withMessage('State is required'),
    
    require('express-validator').body('postalCode')
      .trim()
      .notEmpty()
      .withMessage('Postal code is required'),
    
    require('express-validator').body('country')
      .trim()
      .notEmpty()
      .withMessage('Country is required'),
  ],
};