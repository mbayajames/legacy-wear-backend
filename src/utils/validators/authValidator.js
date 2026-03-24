// utils/validators/authValidator.js
// Authentication validators using Joi - validates user input for all auth-related endpoints
// Provides reusable validation schemas with custom error messages

const Joi = require('joi');  // Joi validation library - powerful schema validation for JavaScript

// ========== REGISTER VALIDATOR ==========
/**
 * Validates user registration data
 * Used in POST /api/auth/register
 * 
 * Validates:
 * - name: required, 2-50 characters
 * - email: required, valid email format
 * - password: required, min 8 chars, must contain uppercase, lowercase, and number
 * - passwordConfirm: must match password
 */
const registerValidator = Joi.object({
  // ----- NAME VALIDATION -----
  name: Joi.string()
    .min(2)           // Minimum 2 characters
    .max(50)          // Maximum 50 characters
    .required()       // Field is required
    .messages({
      'string.empty': 'Name is required',
      'string.min': 'Name must be at least 2 characters',
      'string.max': 'Name cannot exceed 50 characters'
    }),
  
  // ----- EMAIL VALIDATION -----
  email: Joi.string()
    .email()          // Valid email format (e.g., user@example.com)
    .required()
    .messages({
      'string.empty': 'Email is required',
      'string.email': 'Please provide a valid email'
    }),
  
  // ----- PASSWORD VALIDATION -----
  password: Joi.string()
    .min(8)           // Minimum 8 characters for security
    // Regex pattern: at least one lowercase, one uppercase, and one digit
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.empty': 'Password is required',
      'string.min': 'Password must be at least 8 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    }),
  
  // ----- PASSWORD CONFIRMATION VALIDATION -----
  passwordConfirm: Joi.string()
    .valid(Joi.ref('password'))  // Must equal the password field
    .required()
    .messages({
      'any.only': 'Passwords do not match'  // Shown when password and confirm don't match
    })
});

// ========== LOGIN VALIDATOR ==========
/**
 * Validates user login data
 * Used in POST /api/auth/login
 * 
 * Validates:
 * - email: required, valid email format
 * - password: required (no complexity check needed for login)
 */
const loginValidator = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.empty': 'Email is required',
      'string.email': 'Please provide a valid email'
    }),
  
  password: Joi.string()
    .required()  // Password is required, but we don't validate complexity at login
    .messages({
      'string.empty': 'Password is required'
    })
});

// ========== EMAIL VALIDATOR ==========
/**
 * Validates email only
 * Used for:
 * - Forgot password (POST /api/auth/forgot-password)
 * - Resend verification (POST /api/auth/resend-verification)
 * 
 * Validates:
 * - email: required, valid email format
 */
const emailValidator = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.empty': 'Email is required',
      'string.email': 'Please provide a valid email'
    })
});

// ========== PASSWORD VALIDATOR ==========
/**
 * Validates password change (when user knows current password)
 * Used in PATCH /api/auth/update-password
 * 
 * Validates:
 * - currentPassword: required (to verify identity)
 * - newPassword: required, min 8 chars, complexity required
 * - passwordConfirm: must match newPassword
 */
const passwordValidator = Joi.object({
  // Current password - must be provided to verify user identity
  currentPassword: Joi.string()
    .required()
    .messages({
      'string.empty': 'Current password is required'
    }),
  
  // New password - same complexity rules as registration
  newPassword: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.empty': 'New password is required',
      'string.min': 'Password must be at least 8 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    }),
  
  // Confirm new password - must match
  passwordConfirm: Joi.string()
    .valid(Joi.ref('newPassword'))
    .required()
    .messages({
      'any.only': 'Passwords do not match'
    })
});

// ========== RESET PASSWORD VALIDATOR ==========
/**
 * Validates password reset (via token)
 * Used in PATCH /api/auth/reset-password/:token
 * 
 * Validates:
 * - password: required, min 8 chars, complexity required
 * - passwordConfirm: must match password
 * 
 * Note: No currentPassword needed because token verifies identity
 */
const resetPasswordValidator = Joi.object({
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.empty': 'Password is required',
      'string.min': 'Password must be at least 8 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    }),
  
  passwordConfirm: Joi.string()
    .valid(Joi.ref('password'))
    .required()
    .messages({
      'any.only': 'Passwords do not match'
    })
});

// Export all validators for use in routes
module.exports = {
  registerValidator,      // For user registration
  loginValidator,         // For user login
  emailValidator,         // For email-only operations
  passwordValidator,      // For password change (logged in)
  resetPasswordValidator   // For password reset (via token)
};