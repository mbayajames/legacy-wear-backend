// utils/validators/productValidator.js
// Product validators using Joi - validates product data for creation and updates
// Ensures all product data meets business requirements before reaching the database

const Joi = require('joi');  // Joi validation library

// ========== CREATE PRODUCT VALIDATOR ==========
/**
 * Validates product creation data
 * Used in POST /api/products (admin only)
 * 
 * Validates all product fields with strict business rules
 */
const createProductValidator = Joi.object({
  // ----- BASIC PRODUCT INFO -----
  name: Joi.string()
    .min(3)                    // Minimum 3 characters (e.g., "T-Shirt")
    .max(100)                  // Maximum 100 characters
    .required()
    .messages({
      'string.empty': 'Product name is required',
      'string.min': 'Product name must be at least 3 characters',
      'string.max': 'Product name cannot exceed 100 characters'
    }),
  
  description: Joi.string()
    .min(10)                   // Minimum 10 characters for meaningful description
    .max(2000)                 // Maximum 2000 characters (database limit)
    .required()
    .messages({
      'string.empty': 'Description is required',
      'string.min': 'Description must be at least 10 characters'
    }),
  
  // ----- PRICING -----
  price: Joi.number()
    .positive()                // Must be > 0 (no free products)
    .required()
    .messages({
      'number.base': 'Price must be a number',
      'number.positive': 'Price must be greater than 0'
    }),
  
  compareAtPrice: Joi.number()
    .positive()                // Original price (for sales)
    .greater(Joi.ref('price')) // Must be higher than current price
    .optional()
    .messages({
      'number.greater': 'Compare at price must be greater than regular price'
    }),
  
  // ----- CATEGORY -----
  category: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)  // MongoDB ObjectId format (24 hex chars)
    .required()
    .messages({
      'string.empty': 'Category is required',
      'string.pattern.base': 'Invalid category ID'
    }),
  
  // ----- INVENTORY -----
  stock: Joi.number()
    .integer()                 // Whole numbers only
    .min(0)                    // Cannot be negative
    .default(0)                // Default to 0 if not provided
    .optional(),
  
  // ----- MEDIA -----
  images: Joi.array()
    .items(Joi.object({
      url: Joi.string().uri(),      // Valid URL for image
      alt: Joi.string().optional(),  // Alt text for accessibility/SEO
      isPrimary: Joi.boolean().default(false)  // Main product image
    }))
    .optional(),
  
  // ----- VARIANTS -----
  sizes: Joi.array()
    .items(Joi.string().valid('XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'))
    // Only allows standard clothing sizes
    .optional(),
  
  colors: Joi.array()
    .items(Joi.object({
      name: Joi.string(),            // Color name (e.g., "Red", "Blue")
      code: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/),  // Hex color code (e.g., "#FF0000")
      image: Joi.string().uri().optional()  // Optional variant image
    }))
    .optional(),
  
  // ----- TAXONOMY -----
  tags: Joi.array()
    .items(Joi.string())  // Array of tag strings (e.g., ["new", "sale", "summer"])
    .optional(),
  
  // ----- FEATURES -----
  isFeatured: Joi.boolean()
    .default(false),  // Whether to show in featured products section
  
  discountPercentage: Joi.number()
    .min(0)            // 0% = no discount
    .max(100)          // 100% = free (rarely used)
    .optional(),
  
  // ----- STATUS -----
  status: Joi.string()
    .valid('draft', 'active', 'archived')  // Product lifecycle states
    .default('draft')                       // New products start as draft
});

// ========== UPDATE PRODUCT VALIDATOR ==========
/**
 * Validates product update data
 * Used in PATCH /api/products/:id (admin only)
 * 
 * All fields are optional - only provided fields are validated
 * This allows partial updates
 */
const updateProductValidator = Joi.object({
  // All fields are optional for updates (partial updates allowed)
  name: Joi.string()
    .min(3)
    .max(100)
    .optional(),                // Not required for updates
  
  description: Joi.string()
    .min(10)
    .max(2000)
    .optional(),
  
  price: Joi.number()
    .positive()
    .optional(),
  
  compareAtPrice: Joi.number()
    .positive()
    .optional(),                // Note: No .greater() check for updates
                                // This allows admin to fix pricing issues
  
  category: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  
  stock: Joi.number()
    .integer()
    .min(0)
    .optional(),
  
  images: Joi.array()
    .items(Joi.object({
      url: Joi.string().uri(),
      alt: Joi.string().optional(),
      isPrimary: Joi.boolean().default(false)
    }))
    .optional(),
  
  sizes: Joi.array()
    .items(Joi.string().valid('XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'))
    .optional(),
  
  colors: Joi.array()
    .items(Joi.object({
      name: Joi.string(),
      code: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/),
      image: Joi.string().uri().optional()
    }))
    .optional(),
  
  tags: Joi.array()
    .items(Joi.string())
    .optional(),
  
  isFeatured: Joi.boolean().optional(),
  
  discountPercentage: Joi.number()
    .min(0)
    .max(100)
    .optional(),
  
  status: Joi.string()
    .valid('draft', 'active', 'archived')
    .optional()
});

module.exports = {
  createProductValidator,   // For product creation
  updateProductValidator     // For product updates
};