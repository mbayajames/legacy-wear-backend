// services/cloudinaryService.js
// Cloudinary service - comprehensive service for all cloud image operations
// Handles uploads, deletions, transformations, and optimization for product images, avatars, etc.

const cloudinary = require('../config/cloudinary');           // Configured Cloudinary instance
const { CLOUDINARY } = require('../config/key');              // Cloudinary configuration
const AppError = require('../utils/AppError');                // Custom error class
const fs = require('fs').promises;                              // File system operations (promise version)

/**
 * Cloudinary Service Class
 * Provides a clean abstraction over Cloudinary's API
 * Handles all image operations with consistent error handling and specialized methods
 */
class CloudinaryService {
  constructor() {
    this.cloudinary = cloudinary;
    this.isAvailable = CLOUDINARY.isConfigured();  // Check if Cloudinary is configured
  }

  // ========== UPLOAD IMAGE ==========
  /**
   * Upload a single image to Cloudinary
   * 
   * @param {string} filePath - Path to local file
   * @param {Object} options - Upload options (folder, transformation, etc.)
   * @returns {Promise<Object>} Upload result with URL and metadata
   * @throws {AppError} If upload fails or Cloudinary not configured
   */
  async uploadImage(filePath, options = {}) {
    if (!this.isAvailable) {
      throw new AppError('Cloudinary not configured', 503);
    }

    try {
      const uploadOptions = {
        folder: options.folder || CLOUDINARY.UPLOAD_OPTIONS.folder,  // Default folder
        use_filename: true,        // Use original filename
        unique_filename: true,      // Ensure uniqueness
        overwrite: options.overwrite || false,  // Don't overwrite by default
        resource_type: 'auto',      // Auto-detect file type
        transformation: options.transformation  // Apply transformations if provided
      };

      // Upload to Cloudinary
      const result = await this.cloudinary.uploader.upload(filePath, uploadOptions);
      
      // Delete local file after successful upload (cleanup)
      await fs.unlink(filePath).catch(() => {});
      
      return {
        url: result.secure_url,      // HTTPS URL
        publicId: result.public_id,   // Cloudinary public ID (for deletion)
        width: result.width,          // Image width
        height: result.height,        // Image height
        format: result.format,        // File format (jpg, png, etc.)
        size: result.bytes            // File size in bytes
      };
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw new AppError('Failed to upload image', 500);
    }
  }

  // ========== UPLOAD MULTIPLE IMAGES ==========
  /**
   * Upload multiple images in parallel
   * 
   * @param {Array<string>} filePaths - Array of local file paths
   * @param {Object} options - Upload options (applied to all)
   * @returns {Promise<Array>} Array of upload results
   */
  async uploadMultipleImages(filePaths, options = {}) {
    if (!this.isAvailable) {
      throw new AppError('Cloudinary not configured', 503);
    }

    try {
      // Create upload promises for all files
      const uploadPromises = filePaths.map(filePath => this.uploadImage(filePath, options));
      return await Promise.all(uploadPromises);  // Upload in parallel
    } catch (error) {
      console.error('Cloudinary multiple upload error:', error);
      throw new AppError('Failed to upload images', 500);
    }
  }

  // ========== DELETE IMAGE ==========
  /**
   * Delete a single image by public ID
   * 
   * @param {string} publicId - Cloudinary public ID
   * @returns {Promise<boolean>} True if deleted successfully
   */
  async deleteImage(publicId) {
    if (!this.isAvailable) {
      throw new AppError('Cloudinary not configured', 503);
    }

    try {
      const result = await this.cloudinary.uploader.destroy(publicId);
      return result.result === 'ok';  // 'ok' means success
    } catch (error) {
      console.error('Cloudinary delete error:', error);
      throw new AppError('Failed to delete image', 500);
    }
  }

  // ========== DELETE MULTIPLE IMAGES ==========
  /**
   * Delete multiple images at once
   * 
   * @param {Array<string>} publicIds - Array of public IDs
   * @returns {Promise<Object>} Deletion results
   */
  async deleteMultipleImages(publicIds) {
    if (!this.isAvailable) {
      throw new AppError('Cloudinary not configured', 503);
    }

    try {
      const result = await this.cloudinary.api.delete_resources(publicIds);
      return result;
    } catch (error) {
      console.error('Cloudinary multiple delete error:', error);
      throw new AppError('Failed to delete images', 500);
    }
  }

  // ========== GET IMAGE URL WITH TRANSFORMATIONS ==========
  /**
   * Get optimized image URL with transformations
   * 
   * @param {string} publicId - Cloudinary public ID
   * @param {string} transformation - Transformation name from config (product, avatar, thumbnail, etc.)
   * @returns {string|null} Optimized URL or null if not configured
   */
  getImageUrl(publicId, transformation = 'original') {
    if (!this.isAvailable) return null;

    // Get transformation from config
    const transform = CLOUDINARY.TRANSFORMATIONS[transformation] || '';
    
    if (transform) {
      // Apply transformation
      return this.cloudinary.url(publicId, {
        transformation: transform,
        secure: true  // HTTPS
      });
    }
    
    // Original image (no transformation)
    return this.cloudinary.url(publicId, { secure: true });
  }

  // ========== UPLOAD PRODUCT IMAGE ==========
  /**
   * Specialized upload for product main images
   * 
   * @param {string} filePath - Local file path
   * @param {string} productId - Product ID for organization
   * @returns {Promise<Object>} Upload result
   */
  async uploadProductImage(filePath, productId) {
    return this.uploadImage(filePath, {
      folder: `legacy-wear/products/${productId}`,  // Organized by product
      transformation: CLOUDINARY.TRANSFORMATIONS.product  // Product-optimized transformations
    });
  }

  // ========== UPLOAD PRODUCT GALLERY ==========
  /**
   * Upload multiple product gallery images
   * 
   * @param {Array<string>} filePaths - Local file paths
   * @param {string} productId - Product ID for organization
   * @returns {Promise<Array>} Upload results
   */
  async uploadProductGallery(filePaths, productId) {
    return this.uploadMultipleImages(filePaths, {
      folder: `legacy-wear/products/${productId}/gallery`,  // Gallery subfolder
      transformation: CLOUDINARY.TRANSFORMATIONS.thumbnail  // Thumbnail-optimized
    });
  }

  // ========== UPLOAD AVATAR ==========
  /**
   * Upload user avatar (replaces old one)
   * 
   * @param {string} filePath - Local file path
   * @param {string} userId - User ID for consistent naming
   * @returns {Promise<Object>} Upload result
   */
  async uploadAvatar(filePath, userId) {
    // Delete old avatar if exists (same public_id)
    try {
      await this.deleteImage(`legacy-wear/avatars/user-${userId}`);
    } catch (error) {
      // Ignore if no old avatar (first upload)
    }

    return this.uploadImage(filePath, {
      folder: 'legacy-wear/avatars',
      public_id: `user-${userId}`,  // Fixed ID per user (overwrites old)
      transformation: CLOUDINARY.TRANSFORMATIONS.avatar,  // Square crop for avatar
      overwrite: true  // Replace existing
    });
  }

  // ========== UPLOAD CATEGORY IMAGE ==========
  /**
   * Upload category image
   * 
   * @param {string} filePath - Local file path
   * @param {string} categoryId - Category ID for consistent naming
   * @returns {Promise<Object>} Upload result
   */
  async uploadCategoryImage(filePath, categoryId) {
    return this.uploadImage(filePath, {
      folder: 'legacy-wear/categories',
      public_id: categoryId,  // Fixed ID per category
      transformation: CLOUDINARY.TRANSFORMATIONS.thumbnail,  // Thumbnail size
      overwrite: true  // Replace existing
    });
  }

  // ========== OPTIMIZE IMAGE URL ==========
  /**
   * Optimize an existing Cloudinary URL with additional parameters
   * Useful for generating responsive images on-the-fly
   * 
   * @param {string} url - Original Cloudinary URL
   * @param {Object} options - Optimization options
   * @param {number} options.width - Desired width
   * @param {number} options.height - Desired height
   * @param {string} options.quality - Quality setting (auto, 80, etc.)
   * @param {string} options.format - Format (auto, webp, jpg, etc.)
   * @returns {string} Optimized URL
   */
  optimizeImageUrl(url, options = {}) {
    if (!url || !url.includes('cloudinary')) return url;

    const { width, height, quality = 'auto', format = 'auto' } = options;
    
    // Base URL without transformations
    let optimizedUrl = url.replace('/upload/', '/upload/');
    
    // Build transformation string
    const transformations = [];
    if (width) transformations.push(`w_${width}`);
    if (height) transformations.push(`h_${height}`);
    if (quality) transformations.push(`q_${quality}`);
    if (format) transformations.push(`f_${format}`);
    
    // Insert transformations into URL
    if (transformations.length > 0) {
      optimizedUrl = optimizedUrl.replace('/upload/', `/upload/${transformations.join(',')}/`);
    }
    
    return optimizedUrl;
  }
}

module.exports = new CloudinaryService();