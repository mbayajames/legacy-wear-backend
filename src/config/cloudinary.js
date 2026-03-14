// config/cloudinary.js
// Cloudinary configuration file for cloud-based image storage and manipulation
// Handles setup of Cloudinary SDK for uploading, transforming, and serving images

const cloudinary = require('cloudinary').v2;  // Import Cloudinary SDK version 2
const { CLOUDINARY } = require('./key');  // Import Cloudinary configuration from key.js

/**
 * Configure Cloudinary with API credentials
 * This function sets up the Cloudinary SDK for use throughout the application
 * 
 * @returns {Object|null} Configured cloudinary instance or null if not configured
 */
const configureCloudinary = () => {
  /**
   * Check if Cloudinary is properly configured in environment variables
   * isConfigured() checks for presence of:
   * - CLOUDINARY_CLOUD_NAME
   * - CLOUDINARY_API_KEY
   * - CLOUDINARY_API_SECRET
   */
  if (!CLOUDINARY.isConfigured()) {
    // Warn but don't crash - app can fall back to local storage
    console.warn('⚠️ Cloudinary not configured - file uploads will be stored locally');
    return null;  // Return null to indicate cloud storage unavailable
  }
  
  /**
   * Initialize Cloudinary with credentials
   * This configures the SDK globally for all subsequent operations
   */
  cloudinary.config({
    cloud_name: CLOUDINARY.CLOUD_NAME,  // Your Cloudinary cloud name
    api_key: CLOUDINARY.API_KEY,        // API key for authentication
    api_secret: CLOUDINARY.API_SECRET,   // API secret for authentication (keep secure!)
    secure: true  // Force HTTPS URLs for all images (recommended for production)
  });
  
  console.log('✅ Cloudinary configured successfully');
  return cloudinary;  // Return configured instance for use in app
};

/**
 * Export configured Cloudinary instance
 * The function is executed immediately when this module is imported
 * This ensures Cloudinary is configured before any upload operations
 * 
 * Pattern: Module exports the RESULT of configureCloudinary() call
 * This is a singleton pattern - same instance used throughout app
 */
module.exports = configureCloudinary();