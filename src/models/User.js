// models/User.js
// User model for MongoDB - defines the structure and behavior of user data
// Includes authentication, authorization, security features, and OAuth support

const mongoose = require('mongoose');  // MongoDB ODM for schema definition
const bcrypt = require('bcryptjs');    // Password hashing library
const crypto = require('crypto');       // Node.js crypto for generating secure tokens
const { SECURITY, VALIDATION } = require('../config/key');  // Security and validation configs

/**
 * User Schema Definition
 * Defines the structure of user documents in MongoDB
 * Includes comprehensive fields for authentication, security, and user management
 */
const userSchema = new mongoose.Schema({
  // ========== BASIC INFO ==========
  // Core user information required for identification
  name: {
    type: String,
    required: [true, 'Please provide your name'],  // Custom error message
    trim: true,                                      // Remove whitespace from both ends
    maxlength: [50, 'Name cannot be more than 50 characters'],
    minlength: [2, 'Name must be at least 2 characters']
  },
  
  email: {
    type: String,
    required: [true, 'Please provide your email'],
    unique: true,                                    // Ensure no duplicate emails
    lowercase: true,                                  // Convert to lowercase for consistency
    trim: true,
    match: [VALIDATION.EMAIL_REGEX, 'Please provide a valid email'],  // Regex validation
    index: true                                       // Create index for faster queries
  },
  
  password: {
    type: String,
    // Conditional required: Password needed only if no OAuth provider
    required: function() {
      return !this.googleId;  // Password required only for non-OAuth users
    },
    minlength: [SECURITY.PASSWORD_MIN_LENGTH, 'Password must be at least 8 characters'],
    select: false,  // Don't include password in query results by default (security)
    validate: {
      validator: function(password) {
        if (!password) return true;  // Skip validation if no password
        return VALIDATION.PASSWORD_REGEX.test(password);  // Check password complexity
      },
      message: 'Password must contain at least 1 uppercase, 1 lowercase, and 1 number'
    }
  },

  // ========== OAUTH FIELDS ==========
  // Fields for users authenticating via OAuth providers
  googleId: {
    type: String,
    unique: true,      // Each Google ID should be unique
    sparse: true,      // Allows multiple null values (for non-Google users)
    index: true        // Index for faster lookups
  },
  
  avatar: {
    type: String,
    default: '',       // Default empty string if no avatar
    validate: {
      validator: function(url) {
        // Validate that avatar is either HTTP URL or local path
        return !url || url.startsWith('http') || url.startsWith('/');
      },
      message: 'Avatar must be a valid URL'
    }
  },

  // ========== ACCOUNT STATUS ==========
  // Fields for managing user permissions and account state
  role: {
    type: String,
    enum: ['user', 'admin', 'super-admin'],  // Allowed roles
    default: 'user'                            // Default role for new users
  },
  
  isEmailVerified: {
    type: Boolean,
    default: false      // New users start with unverified email
  },
  
  active: {
    type: Boolean,
    default: true,       // Users are active by default
    select: false        // Don't include in queries by default (use with caution)
  },
  
  // ========== SECURITY FIELDS ==========
  // Fields for various security features
  passwordChangedAt: Date,           // Track when password was last changed
  passwordResetToken: String,         // Token for password reset
  passwordResetExpires: Date,         // Expiry for reset token
  
  // Email verification
  emailVerificationToken: String,     // Token for email verification
  emailVerificationExpires: Date,      // Expiry for verification token
  
  // Brute force protection
  failedLoginAttempts: {
    type: Number,
    default: 0,
    select: false                      // Hide from normal queries
  },
  lockUntil: {
    type: Date,
    select: false                      // Hide from normal queries
  },
  
  // ========== TIMESTAMPS ==========
  // Activity tracking
  lastLogin: Date,                     // When user last logged in
  lastActive: Date                      // When user was last active
  
}, {
  // Schema options
  timestamps: true,                    // Automatically add createdAt and updatedAt
  toJSON: { virtuals: true },           // Include virtuals when converting to JSON
  toObject: { virtuals: true }           // Include virtuals when converting to object
});

// ========== VIRTUAL PROPERTIES ==========
// Virtuals are computed properties that don't persist to MongoDB

// Check if account is currently locked
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Determine authentication method used
userSchema.virtual('authMethod').get(function() {
  if (this.googleId) return 'google';
  return 'local';
});

// Check if user is OAuth user
userSchema.virtual('isOAuthUser').get(function() {
  return !!this.googleId;
});

// ========== INDEXES ==========
// Database indexes for query performance
userSchema.index({ email: 1 });           // Index for email lookups
userSchema.index({ googleId: 1 });         // Index for Google ID lookups
userSchema.index({ role: 1 });              // Index for role-based queries
userSchema.index({ createdAt: -1 });        // Index for sorting by creation date

// ========== PRE-SAVE MIDDLEWARE ==========
// Middleware that runs before saving a document

/**
 * Hash password before saving
 * Only runs if password field is modified
 */
userSchema.pre('save', async function(next) {
  // Only hash password if modified and exists
  if (!this.isModified('password') || !this.password) return next();
  
  try {
    // Hash password with bcrypt using configured salt rounds
    this.password = await bcrypt.hash(this.password, SECURITY.BCRYPT_ROUNDS);
    
    // Set passwordChangedAt for existing users (not new documents)
    if (!this.isNew) {
      // Subtract 1 second to ensure token is created after password change
      // This prevents tokens issued just before password change from being valid
      this.passwordChangedAt = Date.now() - 1000;
    }
    
    next();
  } catch (error) {
    next(error);  // Pass error to mongoose
  }
});

// ========== INSTANCE METHODS ==========
// Methods available on each user document

/**
 * Compare candidate password with stored hash
 * @param {string} candidatePassword - Plain text password to compare
 * @returns {Promise<boolean>} - True if passwords match
 */
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;  // No password (OAuth user)
  return await bcrypt.compare(candidatePassword, this.password);
};

/**
 * Create password reset token
 * Generates a secure random token and stores its hash
 * @returns {string} - Plain text reset token (to send to user)
 */
userSchema.methods.createPasswordResetToken = function() {
  // Generate 32 random bytes and convert to hex string
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  // Store SHA256 hash of token (never store plain token in DB)
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
    
  // Token expires in 10 minutes
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;
  
  // Return plain token (to email to user)
  return resetToken;
};

/**
 * Create email verification token
 * Similar to password reset but longer expiry
 * @returns {string} - Plain text verification token
 */
userSchema.methods.createEmailVerificationToken = function() {
  const verificationToken = crypto.randomBytes(32).toString('hex');
  
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
    
  // Token expires in 24 hours
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
  
  return verificationToken;
};

/**
 * Increment failed login attempts
 * Implements brute force protection
 * @returns {Promise} - Update operation promise
 */
userSchema.methods.incrementLoginAttempts = async function() {
  // Check if lock has expired and should be reset
  if (this.lockUntil && this.lockUntil < Date.now()) {
    // Reset: set attempts to 1, remove lock
    return this.updateOne({
      $set: { failedLoginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }
  
  // Increment failed attempts counter
  const updates = { $inc: { failedLoginAttempts: 1 } };
  
  // Lock account if max attempts reached (5)
  if (this.failedLoginAttempts + 1 >= 5) {
    updates.$set = { lockUntil: Date.now() + 30 * 60 * 1000 }; // Lock for 30 minutes
  }
  
  return this.updateOne(updates);
};

/**
 * Reset failed login attempts on successful login
 * @returns {Promise} - Update operation promise
 */
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $set: { failedLoginAttempts: 0 },
    $unset: { lockUntil: 1 }
  });
};

// ========== STATIC METHODS ==========
// Methods available on the User model itself

/**
 * Find user by email (case-insensitive)
 * @param {string} email - Email to search for
 * @returns {Promise} - User document or null
 */
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

/**
 * Find user by Google ID
 * @param {string} googleId - Google ID to search for
 * @returns {Promise} - User document or null
 */
userSchema.statics.findByGoogleId = function(googleId) {
  return this.findOne({ googleId });
};

/**
 * Find user by credentials (email + password)
 * Used in local authentication
 * @param {string} email - User email
 * @param {string} password - Plain text password
 * @returns {Promise} - User document if credentials valid, else null
 */
userSchema.statics.findByCredentials = async function(email, password) {
  // Find user by email and explicitly include password field
  const user = await this.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user) return null;
  
  // Compare provided password with stored hash
  const isMatch = await user.comparePassword(password);
  return isMatch ? user : null;
};

// Create and export the User model
module.exports = mongoose.model('User', userSchema);