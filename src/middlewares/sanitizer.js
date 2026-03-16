// middlewares/sanitizer.js
// Input sanitization middleware - cleans user input to prevent XSS and NoSQL injection attacks
// Provides multiple layers of sanitization for different types of threats

const sanitizeHtml = require('sanitize-html');           // HTML sanitization library
const { VALIDATION } = require('../config/key');         // Validation configuration

// ========== SANITIZE HTML CONTENT ==========
/**
 * Sanitize a single string by removing dangerous HTML
 * Prevents XSS (Cross-Site Scripting) attacks
 * 
 * @param {string} content - Raw user input
 * @returns {string} Sanitized content
 */
const sanitizeContent = (content) => {
  // Only sanitize strings
  if (typeof content !== 'string') return content;
  
  // Use sanitize-html with configuration from key.js
  return sanitizeHtml(content, {
    // Allowed HTML tags (empty array = no tags allowed)
    allowedTags: VALIDATION.SANITIZE_OPTIONS.ALLOWED_TAGS,
    
    // Allowed attributes (empty array = no attributes allowed)
    allowedAttributes: VALIDATION.SANITIZE_OPTIONS.ALLOWED_ATTR,
    
    // Remove any tags that are not in allowedTags
    stripIgnoreTag: true,
    
    // Remove entire body of disallowed tags
    stripIgnoreTagBody: true,
    
    // Allowed URL schemes (prevents javascript: etc.)
    allowedSchemes: ['http', 'https'],
    
    // Don't allow any schemes on specific tags
    allowedSchemesByTag: {},
    
    // Prevent protocol-relative URLs (//example.com)
    allowProtocolRelative: false
  });
};

// ========== RECURSIVE SANITIZATION ==========
/**
 * Recursively sanitize all string values in an object
 * Handles nested objects and arrays
 * 
 * @param {Object|Array} obj - Object to sanitize
 * @returns {Object|Array} Sanitized object
 */
const sanitizeObject = (obj) => {
  // Return non-objects as-is
  if (!obj || typeof obj !== 'object') return obj;
  
  // Iterate through all keys
  Object.keys(obj).forEach(key => {
    if (typeof obj[key] === 'string') {
      // Sanitize string values
      obj[key] = sanitizeContent(obj[key]);
    } else if (Array.isArray(obj[key])) {
      // Recursively sanitize array items
      obj[key] = obj[key].map(item => 
        typeof item === 'string' ? sanitizeContent(item) : sanitizeObject(item)
      );
    } else if (obj[key] && typeof obj[key] === 'object') {
      // Recursively sanitize nested objects
      obj[key] = sanitizeObject(obj[key]);
    }
  });
  
  return obj;
};

// ========== SANITIZE REQUEST MIDDLEWARE ==========
/**
 * Express middleware to sanitize all incoming request data
 * Applies to body, query parameters, and URL parameters
 */
const sanitizeInput = (req, res, next) => {
  // Sanitize request body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  // Sanitize query string parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  
  // Sanitize URL parameters (e.g., /users/:id)
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  
  next();
};

// ========== STRIP SCRIPT TAGS ==========
/**
 * More aggressive sanitization to remove script tags and event handlers
 * Second layer of defense against XSS attacks
 */
const stripScripts = (req, res, next) => {
  /**
   * Strip dangerous content from a string
   */
  const strip = (value) => {
    if (typeof value === 'string') {
      // Remove <script> tags and their entire content
      // Regex explanation:
      // <script\b[^<]* - opening script tag
      // (?:(?!<\/script>)<[^<]*)* - any content not containing closing tag
      // <\/script> - closing tag
      value = value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      
      // Remove javascript: URLs (prevents javascript:alert(1) attacks)
      value = value.replace(/javascript:/gi, 'blocked:');
      
      // Remove inline event handlers (onclick, onload, etc.)
      // Matches: on{event}="..." or on{event}='...'
      value = value.replace(/\bon\w+\s*=\s*['"][^'"]*['"]/gi, '');
    }
    return value;
  };
  
  /**
   * Recursively process an object to strip scripts
   */
  const processObject = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    
    Object.keys(obj).forEach(key => {
      if (typeof obj[key] === 'string') {
        obj[key] = strip(obj[key]);
      } else if (Array.isArray(obj[key])) {
        obj[key] = obj[key].map(item => 
          typeof item === 'string' ? strip(item) : processObject(item)
        );
      } else if (obj[key] && typeof obj[key] === 'object') {
        processObject(obj[key]);
      }
    });
  };
  
  // Apply to all request sources
  processObject(req.body);
  processObject(req.query);
  processObject(req.params);
  
  next();
};

// ========== PREVENT NOSQL INJECTION ==========
/**
 * Remove MongoDB operator keys ($) to prevent NoSQL injection attacks
 * Stops attackers from using $ne, $gt, $in, etc. in queries
 */
const preventNoSQLInjection = (req, res, next) => {
  /**
   * Recursively check for and remove MongoDB operators
   */
  const checkForOperators = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    
    Object.keys(obj).forEach(key => {
      // MongoDB operators start with $ (e.g., $ne, $gt, $in)
      if (key.startsWith('$')) {
        // Remove the entire key-value pair
        delete obj[key];
      }
      
      // Recursively check nested objects
      if (typeof obj[key] === 'object') {
        checkForOperators(obj[key]);
      }
    });
  };
  
  // Apply to all request sources
  checkForOperators(req.body);
  checkForOperators(req.query);
  checkForOperators(req.params);
  
  next();
};

module.exports = {
  sanitizeInput,          // Main middleware - comprehensive sanitization
  stripScripts,           // Aggressive script removal
  preventNoSQLInjection,  // MongoDB operator protection
  sanitizeContent,        // Utility for sanitizing single strings
  sanitizeObject          // Utility for sanitizing objects
};