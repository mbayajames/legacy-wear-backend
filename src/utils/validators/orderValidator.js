// utils/validators/orderValidator.js
// Order validators using Joi - validates order data for creation and updates
// Ensures orders have valid addresses, payment methods, and proper status transitions

const Joi = require('joi');  // Joi validation library

// ========== CREATE ORDER VALIDATOR ==========
/**
 * Validates order creation data
 * Used in POST /api/orders
 * 
 * Validates:
 * - Shipping address (complete Kenyan address)
 * - Payment method (from allowed options)
 * - Optional notes
 */
const createOrderValidator = Joi.object({
  // ----- SHIPPING ADDRESS VALIDATION -----
  shippingAddress: Joi.object({
    // Customer's full name
    fullName: Joi.string()
      .min(2)              // At least 2 characters (e.g., "Jo")
      .max(100)            // Max 100 characters
      .required()
      .messages({
        'string.empty': 'Full name is required',
        'string.min': 'Full name must be at least 2 characters',
        'string.max': 'Full name cannot exceed 100 characters'
      }),
    
    // Kenyan phone number format
    phoneNumber: Joi.string()
      .pattern(/^(\+254|0)[7][0-9]{8}$/)
      // Regex breakdown:
      // ^(\+254|0) - Starts with +254 or 0
      // [7] - Followed by 7
      // [0-9]{8} - Followed by 8 digits
      // Valid examples: 0712345678, +254712345678
      .required()
      .messages({
        'string.empty': 'Phone number is required',
        'string.pattern.base': 'Please provide a valid Kenyan phone number (e.g., 0712345678 or +254712345678)'
      }),
    
    // Street address line 1
    addressLine1: Joi.string()
      .min(5)              // At least 5 characters for meaningful address
      .max(200)
      .required()
      .messages({
        'string.empty': 'Address is required',
        'string.min': 'Address must be at least 5 characters'
      }),
    
    // Optional second address line (apartment, suite, etc.)
    addressLine2: Joi.string()
      .max(200)
      .optional(),
    
    // City/Town
    city: Joi.string()
      .min(2)
      .max(50)
      .required()
      .messages({
        'string.empty': 'City is required'
      }),
    
    // Kenyan county
    county: Joi.string()
      .min(2)
      .max(50)
      .required()
      .messages({
        'string.empty': 'County is required'
      }),
    
    // Optional postal code
    postalCode: Joi.string()
      .max(20)
      .optional(),
    
    // Country - defaults to Kenya
    country: Joi.string()
      .default('Kenya')
  }).required()
  .messages({
    'object.base': 'Shipping address is required'
  }),
  
  // ----- PAYMENT METHOD VALIDATION -----
  paymentMethod: Joi.string()
    .valid('mpesa', 'card', 'bank-transfer', 'cash-on-delivery')
    // Allowed payment methods:
    // - mpesa: Mobile money (Kenya)
    // - card: Credit/debit card via Stripe
    // - bank-transfer: Direct bank transfer
    // - cash-on-delivery: Pay when order arrives
    .required()
    .messages({
      'string.empty': 'Payment method is required',
      'any.only': 'Invalid payment method'
    }),
  
  // ----- OPTIONAL NOTES -----
  notes: Joi.string()
    .max(500)              // Limit notes to 500 characters
    .optional()
    .messages({
      'string.max': 'Notes cannot exceed 500 characters'
    })
});

// ========== UPDATE ORDER STATUS VALIDATOR ==========
/**
 * Validates order status updates (admin only)
 * Used in PATCH /api/orders/:id/status
 * 
 * Validates:
 * - New status (must be valid from allowed options)
 * - Optional note about status change
 */
const updateOrderStatusValidator = Joi.object({
  // Order status - full lifecycle states
  status: Joi.string()
    .valid('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')
    // Status flow:
    // pending → confirmed → processing → shipped → delivered
    //    ↓          ↓
    // cancelled  refunded
    .required()
    .messages({
      'string.empty': 'Status is required',
      'any.only': 'Invalid order status'
    }),
  
  // Optional note (e.g., "Delayed due to stock issue")
  note: Joi.string()
    .max(500)
    .optional()
});

// ========== UPDATE SHIPPING VALIDATOR ==========
/**
 * Validates shipping updates (admin only)
 * Used in PATCH /api/orders/:id/shipping
 * 
 * Validates:
 * - Shipping status
 * - Tracking number (optional)
 * - Tracking URL (optional, must be valid URL)
 * - Estimated delivery date (optional)
 */
const updateShippingValidator = Joi.object({
  // Shipping status (separate from order status)
  shippingStatus: Joi.string()
    .valid('pending', 'processing', 'shipped', 'delivered', 'returned')
    // Shipping flow:
    // pending → processing → shipped → delivered
    //    ↓
    // returned (after delivery)
    .required()
    .messages({
      'string.empty': 'Shipping status is required',
      'any.only': 'Invalid shipping status'
    }),
  
  // Courier tracking number
  trackingNumber: Joi.string()
    .max(100)              // Most tracking numbers are < 100 chars
    .optional(),
  
  // URL to track package on courier website
  trackingUrl: Joi.string()
    .uri()                 // Must be valid URL (http:// or https://)
    .optional()
    .messages({
      'string.uri': 'Please provide a valid tracking URL'
    }),
  
  // Expected delivery date
  estimatedDelivery: Joi.date()
    .optional()
    .messages({
      'date.base': 'Please provide a valid date'
    })
});

module.exports = {
  createOrderValidator,        // For new orders
  updateOrderStatusValidator,   // For status updates
  updateShippingValidator        // For shipping updates
};