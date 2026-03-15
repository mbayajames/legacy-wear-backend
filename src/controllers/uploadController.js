// controllers/uploadController.js
// Upload controller - handles all file upload operations with Cloudinary integration and local fallback
// Supports single/multiple uploads, product images, user avatars, and category images

const cloudinary = require('../config/cloudinary');           // Cloudinary SDK for cloud storage
const AppError = require('../utils/AppError');                // Custom error class
const catchAsync = require('../utils/catchAsync');            // Async error wrapper
const { UPLOAD, CLOUDINARY } = require('../config/key');      // Upload configuration
const fs = require('fs').promises;                            // File system operations (promise version)
const path = require('path');                                  // Path manipulation

// ========== UPLOAD SINGLE IMAGE ==========
/**
 * Upload a single image (general purpose)
 * POST /api/upload/image
 * Body: multipart/form-data with file field 'image'
 * (Protected route - users must be logged in)
 */
exports.uploadImage = catchAsync(async (req, res, next) => {
  // Check if file was provided in the request
  if (!req.file) {
    return next(new AppError('Please upload an image', 400));
  }

  let result;
  
  // ===== CLOUDINARY UPLOAD (if configured) =====
  if (CLOUDINARY.isConfigured()) {
    // Upload to Cloudinary with default options
    result = await cloudinary.uploader.upload(req.file.path, {
      folder: CLOUDINARY.UPLOAD_OPTIONS.folder,  // 'legacy-wear' folder
      use_filename: true,                          // Keep original filename
      unique_filename: true                         // Ensure uniqueness
    });

    // Delete temporary file after successful upload
    await fs.unlink(req.file.path);
  } else {
    // ===== LOCAL STORAGE FALLBACK =====
    // Create unique filename with timestamp
    const fileName = `${Date.now()}-${req.file.originalname}`;
    const filePath = path.join(UPLOAD.PATHS.PERMANENT, fileName);
    
    // Move file from temp to permanent storage
    await fs.rename(req.file.path, filePath);
    
    result = {
      url: `/uploads/${fileName}`,  // Local URL path
      publicId: null                  // No Cloudinary public ID
    };
  }

  // Return image information to client
  res.status(200).json({
    status: 'success',
    data: {
      image: {
        url: result.url || result.secure_url,  // Cloudinary returns secure_url
        publicId: result.public_id || null,
        filename: req.file.originalname,
        size: req.file.size
      }
    }
  });
});

// ========== UPLOAD MULTIPLE IMAGES ==========
/**
 * Upload multiple images at once
 * POST /api/upload/images
 * Body: multipart/form-data with files field 'images' (multiple)
 * (Protected route)
 */
exports.uploadMultipleImages = catchAsync(async (req, res, next) => {
  // Check if files were provided
  if (!req.files || req.files.length === 0) {
    return next(new AppError('Please upload images', 400));
  }

  // Create upload promises for all files
  const uploadPromises = req.files.map(async (file) => {
    if (CLOUDINARY.isConfigured()) {
      // Cloudinary upload
      const result = await cloudinary.uploader.upload(file.path, {
        folder: CLOUDINARY.UPLOAD_OPTIONS.folder,
        use_filename: true,
        unique_filename: true
      });
      
      // Clean up temp file
      await fs.unlink(file.path);
      
      return {
        url: result.secure_url,
        publicId: result.public_id,
        filename: file.originalname,
        size: file.size
      };
    } else {
      // Local storage
      const fileName = `${Date.now()}-${file.originalname}`;
      const filePath = path.join(UPLOAD.PATHS.PERMANENT, fileName);
      
      await fs.rename(file.path, filePath);
      
      return {
        url: `/uploads/${fileName}`,
        publicId: null,
        filename: file.originalname,
        size: file.size
      };
    }
  });

  // Wait for all uploads to complete
  const images = await Promise.all(uploadPromises);

  res.status(200).json({
    status: 'success',
    results: images.length,
    data: { images }
  });
});

// ========== DELETE IMAGE ==========
/**
 * Delete an image from Cloudinary using its public ID
 * DELETE /api/upload/image/:publicId
 * (Admin only - or user can delete their own)
 */
exports.deleteImage = catchAsync(async (req, res, next) => {
  const { publicId } = req.params;

  // Delete from Cloudinary if configured and publicId exists
  if (CLOUDINARY.isConfigured() && publicId !== 'null') {
    await cloudinary.uploader.destroy(publicId);
  }
  // Note: Local files are not automatically deleted
  // You would need additional cleanup logic for local storage

  res.status(200).json({
    status: 'success',
    message: 'Image deleted successfully'
  });
});

// ========== UPLOAD PRODUCT IMAGES ==========
/**
 * Upload images specifically for products with optimization
 * POST /api/upload/product-images
 * Body: multipart/form-data with files and productId
 * (Admin only)
 */
exports.uploadProductImages = catchAsync(async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next(new AppError('Please upload product images', 400));
  }

  const { productId } = req.body;  // Optional - for organizing by product
  const uploadPromises = [];
  const images = [];

  // Process each file
  for (const file of req.files) {
    if (CLOUDINARY.isConfigured()) {
      // Cloudinary upload with product-specific transformations
      const promise = cloudinary.uploader.upload(file.path, {
        folder: `legacy-wear/products/${productId || 'new'}`,  // Organized by product
        transformation: CLOUDINARY.TRANSFORMATIONS.product      // Apply product optimizations
      }).then(async (result) => {
        // Clean up temp file
        await fs.unlink(file.path);
        images.push({
          url: result.secure_url,
          publicId: result.public_id,
          alt: file.originalname  // Default alt text
        });
      });
      uploadPromises.push(promise);
    } else {
      // Local storage with product organization
      const fileName = `product-${Date.now()}-${file.originalname}`;
      const filePath = path.join(UPLOAD.PATHS.PERMANENT, 'products', fileName);
      
      await fs.rename(file.path, filePath);
      images.push({
        url: `/uploads/products/${fileName}`,
        publicId: null,
        alt: file.originalname
      });
    }
  }

  // Wait for all uploads to complete
  await Promise.all(uploadPromises);

  res.status(200).json({
    status: 'success',
    data: { images }
  });
});

// ========== UPLOAD AVATAR ==========
/**
 * Upload user avatar with automatic replacement
 * POST /api/upload/avatar
 * Body: multipart/form-data with file field 'avatar'
 * (Protected route - user must be logged in)
 */
exports.uploadAvatar = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('Please upload an image', 400));
  }

  const userId = req.user.id;
  let result;

  if (CLOUDINARY.isConfigured()) {
    // ===== DELETE OLD AVATAR IF EXISTS =====
    // Check if user has an existing Cloudinary avatar
    if (req.user.avatar && req.user.avatar.includes('cloudinary')) {
      // Extract publicId from URL (simplified - might need better parsing)
      const publicId = req.user.avatar.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`legacy-wear/avatars/${publicId}`);
    }

    // ===== UPLOAD NEW AVATAR =====
    result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'legacy-wear/avatars',
      public_id: `user-${userId}`,        // Fixed ID per user (overwrites old)
      transformation: CLOUDINARY.TRANSFORMATIONS.avatar,  // Square crop for avatar
      overwrite: true                       // Replace existing
    });

    // Clean up temp file
    await fs.unlink(req.file.path);
  } else {
    // ===== LOCAL STORAGE =====
    const fileName = `avatar-${userId}${path.extname(req.file.originalname)}`;
    const filePath = path.join(UPLOAD.PATHS.PERMANENT, 'avatars', fileName);
    
    await fs.rename(req.file.path, filePath);
    
    result = {
      secure_url: `/uploads/avatars/${fileName}`
    };
  }

  // ===== UPDATE USER RECORD =====
  const User = require('../models/User');
  await User.findByIdAndUpdate(userId, { avatar: result.secure_url });

  res.status(200).json({
    status: 'success',
    data: {
      avatar: result.secure_url
    }
  });
});

// ========== UPLOAD CATEGORY IMAGE ==========
/**
 * Upload image for product category
 * POST /api/upload/category-image
 * Body: multipart/form-data with file and categoryId
 * (Admin only)
 */
exports.uploadCategoryImage = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('Please upload an image', 400));
  }

  const { categoryId } = req.body;  // Optional - for naming
  let result;

  if (CLOUDINARY.isConfigured()) {
    // Cloudinary upload with category-specific settings
    result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'legacy-wear/categories',
      public_id: categoryId || `category-${Date.now()}`,  // Use category ID if provided
      transformation: CLOUDINARY.TRANSFORMATIONS.thumbnail  // Thumbnail size
    });

    // Clean up temp file
    await fs.unlink(req.file.path);
  } else {
    // Local storage
    const fileName = `category-${categoryId || Date.now()}${path.extname(req.file.originalname)}`;
    const filePath = path.join(UPLOAD.PATHS.PERMANENT, 'categories', fileName);
    
    await fs.rename(req.file.path, filePath);
    
    result = {
      secure_url: `/uploads/categories/${fileName}`
    };
  }

  res.status(200).json({
    status: 'success',
    data: {
      image: result.secure_url
    }
  });
});