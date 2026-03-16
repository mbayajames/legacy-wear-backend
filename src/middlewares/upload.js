// middlewares/upload.js
// File upload middleware using Multer - handles file uploads with validation, storage, and cleanup
// Creates necessary directories, validates file types, and manages temporary files

const multer = require('multer');           // File upload middleware
const path = require('path');               // Path manipulation
const fs = require('fs');                   // File system operations
const { UPLOAD } = require('../config/key'); // Upload configuration
const AppError = require('../utils/AppError'); // Custom error class

// ========== ENSURE UPLOAD DIRECTORIES EXIST ==========
/**
 * Create all necessary upload directories if they don't exist
 * This prevents errors when trying to save files to non-existent paths
 */
const createUploadDirs = () => {
  // List of directories to create
  const dirs = [
    UPLOAD.PATHS.TEMP,                          // Temporary upload folder
    UPLOAD.PATHS.PERMANENT,                      // Permanent storage root
    path.join(UPLOAD.PATHS.PERMANENT, 'products'), // Product images
    path.join(UPLOAD.PATHS.PERMANENT, 'avatars'),  // User avatars
    path.join(UPLOAD.PATHS.PERMANENT, 'categories') // Category images
  ];
  
  // Create each directory if it doesn't exist
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true }); // recursive: true creates parent directories
    }
  });
};

// Run directory creation immediately
createUploadDirs();

// ========== STORAGE CONFIGURATION ==========
/**
 * Configure how and where files are stored
 * Uses disk storage to save files to the filesystem
 */
const storage = multer.diskStorage({
  /**
   * Determine destination folder based on request URL
   * Different upload types go to different subdirectories
   */
  destination: (req, file, cb) => {
    // Default to temp folder
    let dest = UPLOAD.PATHS.TEMP;
    
    // Check request URL to determine upload type
    if (req.baseUrl.includes('avatar')) {
      dest = path.join(UPLOAD.PATHS.TEMP, 'avatars');
    } else if (req.baseUrl.includes('product')) {
      dest = path.join(UPLOAD.PATHS.TEMP, 'products');
    } else if (req.baseUrl.includes('category')) {
      dest = path.join(UPLOAD.PATHS.TEMP, 'categories');
    }
    
    // Ensure destination directory exists
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    // Pass destination to multer
    cb(null, dest);
  },
  
  /**
   * Generate unique filename to prevent collisions
   * Format: fieldName-timestamp-random.extension
   */
  filename: (req, file, cb) => {
    // Generate unique identifier: timestamp + random number
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    // Get file extension
    const ext = path.extname(file.originalname);
    // Create unique filename
    const filename = `${file.fieldname}-${uniqueSuffix}${ext}`;
    cb(null, filename);
  }
});

// ========== FILE FILTER ==========
/**
 * Validate file types and extensions
 * Rejects unsupported file formats
 */
const fileFilter = (req, file, cb) => {
  // Check MIME type (e.g., image/jpeg, image/png)
  if (!UPLOAD.ALLOWED_TYPES.includes(file.mimetype)) {
    return cb(new AppError(
      `Invalid file type. Allowed types: ${UPLOAD.ALLOWED_TYPES.join(', ')}`,
      400
    ), false);
  }
  
  // Check file extension (e.g., .jpg, .png)
  const ext = path.extname(file.originalname).toLowerCase();
  if (!UPLOAD.ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(new AppError(
      `Invalid file extension. Allowed: ${UPLOAD.ALLOWED_EXTENSIONS.join(', ')}`,
      400
    ), false);
  }
  
  // File is valid
  cb(null, true);
};

// ========== MULTER CONFIGURATION ==========
/**
 * Create configured multer instance with:
 * - Custom storage
 * - File size limits
 * - File count limits
 * - File type filtering
 */
const upload = multer({
  storage: storage,                         // Where to save files
  limits: {
    fileSize: UPLOAD.MAX_SIZE,               // Max file size (e.g., 5MB)
    files: UPLOAD.MAX_FILES                    // Max number of files
  },
  fileFilter: fileFilter                       // File type validation
});

// ========== ERROR HANDLING WRAPPER ==========
/**
 * Handle multer-specific errors and convert to AppError
 * This integrates with the app's global error handler
 */
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Handle specific multer error codes
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(`File too large. Max size: ${UPLOAD.MAX_SIZE / 1024 / 1024}MB`, 400));
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return next(new AppError(`Too many files. Max: ${UPLOAD.MAX_FILES}`, 400));
    }
    // Generic multer error
    return next(new AppError(`Upload error: ${err.message}`, 400));
  }
  // Pass non-multer errors to next middleware
  next(err);
};

// ========== CLEANUP OLD TEMP FILES ==========
/**
 * Periodically clean up temporary files
 * Prevents disk space exhaustion from abandoned uploads
 */
const cleanupTempFiles = async () => {
  const tempDir = UPLOAD.PATHS.TEMP;
  
  try {
    // Read all files in temp directory
    const files = await fs.promises.readdir(tempDir);
    const now = Date.now();
    
    for (const file of files) {
      const filePath = path.join(tempDir, file);
      const stats = await fs.promises.stat(filePath);
      
      // Delete files older than 1 hour (3600000 ms)
      if (now - stats.mtimeMs > 60 * 60 * 1000) {
        await fs.promises.unlink(filePath).catch(() => {});
      }
    }
  } catch (error) {
    // Ignore errors during cleanup
    console.error('Temp file cleanup error:', error.message);
  }
};

// Run cleanup every hour
setInterval(cleanupTempFiles, 60 * 60 * 1000);

// ========== EXPORT CONFIGURED MULTER INSTANCE ==========
module.exports = {
  // Raw multer instance (for custom usage)
  upload,
  
  // Error handler
  handleUploadError,
  
  // Convenience helpers that combine upload middleware with error handling
  // These return arrays that can be spread in route definitions
  
  /**
   * Single file upload helper
   * @param {string} fieldName - Name of the file field
   * @returns {Array} [upload.single(fieldName), handleUploadError]
   */
  single: (fieldName) => [upload.single(fieldName), handleUploadError],
  
  /**
   * Multiple files upload helper (all with same field name)
   * @param {string} fieldName - Name of the file field
   * @param {number} maxCount - Maximum number of files
   * @returns {Array} [upload.array(fieldName, maxCount), handleUploadError]
   */
  array: (fieldName, maxCount) => [upload.array(fieldName, maxCount), handleUploadError],
  
  /**
   * Multiple files upload helper (different field names)
   * @param {Array} fields - Array of field configurations
   * @returns {Array} [upload.fields(fields), handleUploadError]
   */
  fields: (fields) => [upload.fields(fields), handleUploadError]
};