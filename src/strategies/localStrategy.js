// strategies/localStrategy.js
// Local authentication strategy for Passport.js using email/password
// Implements comprehensive security features: brute force protection, account locking, email verification

const { Strategy: LocalStrategy } = require('passport-local');  // Passport's local strategy for username/password auth
const User = require('../models/User');  // User model for database operations
const { SECURITY, FEATURES } = require('../config/key');  // Security config (BCRYPT_ROUNDS, etc.) and feature flags

/**
 * Local Strategy Configuration
 * Handles traditional email/password authentication with enterprise-grade security features
 * 
 * @param {Object} passport - Passport instance to register this strategy with
 */
module.exports = (passport) => {
  passport.use(
    'local',  // Strategy name - used in passport.authenticate('local')
    new LocalStrategy(
      {
        // Configuration options for the strategy
        usernameField: 'email',      // Use 'email' field instead of default 'username'
        passwordField: 'password',    // Field name for password in request body
        passReqToCallback: false,     // Don't pass req object to callback (not needed)
        session: false                // Don't create session (using JWT instead of sessions)
      },
      /**
       * Verification callback - called when user attempts to log in
       * 
       * @param {string} email - User's email (from usernameField)
       * @param {string} password - User's password (from passwordField)
       * @param {Function} done - Passport done callback (error, user, info)
       */
      async (email, password, done) => {
        try {
          // ==================== 1️⃣ INPUT VALIDATION ====================
          // Basic validation - ensure both fields are provided
          if (!email || !password) {
            return done(null, false, { 
              message: 'Please provide email and password' 
            });
          }

          // ==================== 2️⃣ FIND USER BY EMAIL ====================
          // Query database for user with this email
          // .select('+field') includes fields that are normally excluded in schema
          const user = await User.findOne({ email: email.toLowerCase() })  // Normalize email to lowercase
            .select('+password +failedLoginAttempts +lockUntil');  // Explicitly include protected fields

          // ==================== 3️⃣ USER EXISTENCE CHECK ====================
          // If no user found with this email
          if (!user) {
            // Return generic error message (don't reveal that email doesn't exist)
            return done(null, false, { 
              message: 'Invalid email or password' 
            });
          }

          // ==================== 4️⃣ ACCOUNT LOCK CHECK ====================
          // Check if account is temporarily locked due to too many failed attempts
          if (user.lockUntil && user.lockUntil > Date.now()) {
            // Calculate remaining lock time in minutes for user-friendly message
            const remainingTime = Math.ceil((user.lockUntil - Date.now()) / 60000);
            return done(null, false, { 
              message: `Account locked. Try again in ${remainingTime} minutes` 
            });
          }

          // ==================== 5️⃣ ACCOUNT ACTIVE CHECK ====================
          // Check if admin has deactivated this account
          if (user.accountStatus && user.accountStatus !== 'active') {
            return done(null, false, { 
              message: 'Account deactivated. Please contact support' 
            });
          }

          // ==================== 6️⃣ PASSWORD VERIFICATION ====================
          // Compare provided password with stored hash using schema method
          const isPasswordValid = await user.matchPassword(password);
          
          if (!isPasswordValid) {
            // ---------- BRUTE FORCE PROTECTION ----------
            // Increment failed login attempts counter
            user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
            
            // Lock account after 5 failed attempts
            if (user.failedLoginAttempts >= 5) {
              user.lockUntil = Date.now() + 30 * 60 * 1000; // Lock for 30 minutes (in milliseconds)
              await user.save();  // Save locked status
              return done(null, false, { 
                message: 'Too many failed attempts. Account locked for 30 minutes' 
              });
            }
            
            // Save updated failed attempts count
            await user.save();
            
            // Return generic error message (don't specify "wrong password")
            return done(null, false, { 
              message: 'Invalid email or password' 
            });
          }

          // ==================== 7️⃣ OAUTH USER CHECK ====================
          // Check if this user was created via Google OAuth (no password set)
          if (!user.password) {
            return done(null, false, { 
              message: 'This account uses Google login. Please use "Login with Google"' 
            });
          }

          // ==================== 8️⃣ EMAIL VERIFICATION CHECK ====================
          // If email verification is enabled, check if user has verified their email
          if (!user.isVerified && FEATURES.ENABLED.EMAIL_SERVICE) {
            return done(null, false, { 
              message: 'Please verify your email before logging in',
              needsVerification: true,  // Flag for frontend to show verification UI
              email: user.email          // Send email to allow resending verification
            });
          }

          // ==================== 9️⃣ RESET FAILED ATTEMPTS ====================
          // On successful login, clear any failed login tracking
          if (user.failedLoginAttempts > 0 || user.lockUntil) {
            user.failedLoginAttempts = 0;      // Reset counter
            user.lockUntil = undefined;          // Remove lock
            await user.save();                   // Save changes
          }

          // ==================== 🔟 UPDATE LAST LOGIN ====================
          // Track when user last logged in (for security monitoring)
          user.lastLogin = Date.now();
          // Skip validation to avoid password requirement (password not needed for this update)
          await user.save({ validateBeforeSave: false });

          // ==================== ✅ SUCCESS ====================
          // Return authenticated user
          // Note: password is automatically removed by schema's toJSON transform
          return done(null, user);

        } catch (error) {
          // ==================== ❌ ERROR HANDLING ====================
          // Log error for debugging (without exposing to client)
          console.error('Local Strategy Error:', error);
          
          // Return generic error message (security best practice)
          return done(error, false, { 
            message: 'Authentication error. Please try again' 
          });
        }
      }
    )
  );

  // Log successful initialization for debugging
  console.log('✅ Local strategy initialized');
};
