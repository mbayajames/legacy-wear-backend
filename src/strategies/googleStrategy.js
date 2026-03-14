// strategies/googleStrategy.js
// Google OAuth 2.0 authentication strategy for Passport.js
// Handles user authentication via Google accounts with account linking and automatic profile synchronization

const { Strategy: GoogleStrategy } = require('passport-google-oauth20');  // Google OAuth strategy
const User = require('../models/User');  // User model for database operations
const { OAUTH, SERVER, FEATURES } = require('../config/key');  // Configuration for OAuth, environment, and features

/**
 * Google OAuth Strategy Configuration
 * This strategy enables users to authenticate using their Google accounts
 * Features: Account linking, profile synchronization, welcome emails, and graceful fallback
 * 
 * @param {Object} passport - Passport instance to register this strategy with
 */
module.exports = (passport) => {
  // ==================== CONFIGURATION CHECK ====================
  // Skip strategy initialization if Google OAuth credentials are missing
  // This allows the app to run in development without Google setup
  if (!OAUTH.GOOGLE.isConfigured()) {
    console.warn('⚠️ Google OAuth not configured - skipping initialization');
    return;  // Exit early, don't register the strategy
  }

  /**
   * Register Google OAuth strategy with Passport
   * Strategy name: 'google' (used in passport.authenticate('google'))
   */
  passport.use(
    'google',
    new GoogleStrategy(
      {
        // OAuth 2.0 credentials from Google Cloud Console
        clientID: OAUTH.GOOGLE.CLIENT_ID,           // Google App Client ID
        clientSecret: OAUTH.GOOGLE.CLIENT_SECRET,   // Google App Client Secret
        callbackURL: OAUTH.GOOGLE.CALLBACK_URL,     // Redirect URL after Google auth (must match Google Console)
        
        // OAuth permissions requested from user
        scope: OAUTH.GOOGLE.SCOPES,                  // ['profile', 'email'] - what data we can access
        
        // OAuth options
        prompt: OAUTH.GOOGLE.PROMPT,                  // 'select_account' - force account selection even if logged in
        passReqToCallback: true,                       // Pass request object to callback (for session handling)
        proxy: true                                    // Trust proxy for HTTPS redirects (needed behind load balancer)
      },
      /**
       * Verification callback - called after Google authenticates the user
       * This function creates or updates the user in our database
       * 
       * @param {Object} req - Express request object
       * @param {string} accessToken - Google access token (for calling Google APIs)
       * @param {string} refreshToken - Google refresh token (long-lived, for getting new access tokens)
       * @param {Object} profile - User profile data from Google
       * @param {Function} done - Passport done callback (error, user, info)
       */
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          // ==================== DEVELOPMENT DEBUGGING ====================
          // Log minimal profile info in development for debugging
          if (SERVER.IS_DEVELOPMENT) {
            console.log('Google Profile:', profile.id, profile.emails[0]?.value);
          }

          // ==================== 1️⃣ EXTRACT USER DATA ====================
          // Safely extract relevant information from Google profile
          // Using optional chaining (?.) to handle missing fields
          const googleId = profile.id;                          // Unique Google user ID (never changes)
          const email = profile.emails?.[0]?.value;            // Primary email address
          const name = profile.displayName;                      // User's full name
          const avatar = profile.photos?.[0]?.value;            // Profile picture URL
          const emailVerified = profile.emails?.[0]?.verified || true;  // Email verification status from Google

          // ==================== 2️⃣ EMAIL VALIDATION ====================
          // Email is required for our application (used for communication, identification)
          if (!email) {
            return done(null, false, { 
              message: 'Google account must have an email address' 
            });
          }

          // ==================== 3️⃣ FIND EXISTING USER ====================
          // Search for user by Google ID OR email (for account linking)
          // $or operator matches if either condition is true
          let user = await User.findOne({
            $or: [
              { googleId: googleId },                 // Existing Google user
              { email: email.toLowerCase() }           // Existing email/password user (for linking)
            ]
          });

          // ==================== 4️⃣ EXISTING USER HANDLING ====================
          if (user) {
            // ---------- CASE A: Account Linking ----------
            // User exists by email but doesn't have Google ID (email/password user)
            if (!user.googleId) {
              // Link Google account to existing user
              user.googleId = googleId;                          // Add Google ID (enables Google login)
              user.avatar = avatar || user.avatar;               // Update avatar if Google provided one
              user.isEmailVerified = user.isEmailVerified || emailVerified;  // Mark email as verified (Google says so)
              user.lastLogin = Date.now();                        // Update login timestamp
              await user.save();                                   // Save changes to database
              
              console.log(`✅ Google account linked to existing user: ${email}`);
            } 
            // ---------- CASE B: Regular Google Login ----------
            else {
              // Regular Google user logging in again
              user.lastLogin = Date.now();                        // Update login timestamp
              user.avatar = avatar || user.avatar;               // Update avatar if changed on Google
              await user.save({ validateBeforeSave: false });     // Save without full validation (skip password check)
            }

            // Check if account is active (not deactivated by admin)
            if (!user.active) {
              return done(null, false, { 
                message: 'Account deactivated. Please contact support' 
              });
            }

            // Return existing user (successful authentication)
            return done(null, user);
          }

          // ==================== 5️⃣ NEW USER CREATION ====================
          // No existing user found - create new account
          const newUser = await User.create({
            googleId: googleId,                                    // Store Google ID
            name: name,                                            // Display name from Google
            email: email.toLowerCase(),                            // Email (lowercase for consistency)
            avatar: avatar,                                        // Profile picture from Google
            isEmailVerified: emailVerified,                        // Email verified by Google (trust Google)
            password: undefined,                                   // No password for OAuth users
            passwordChangedAt: Date.now(),                         // Set password change time (for token invalidation)
            // Note: No password field - user can ONLY login via Google
            // This prevents email/password login attempts
          });

          console.log(`✅ New Google user created: ${email}`);

          // ==================== 6️⃣ WELCOME EMAIL ====================
          // Send welcome email if email service is configured
          if (FEATURES.ENABLED.EMAIL_SERVICE) {
            try {
              // Dynamic import to avoid circular dependencies
              const { sendWelcomeEmail } = require('../services/emailService');
              await sendWelcomeEmail(newUser);  // Send welcome email (non-blocking)
            } catch (emailError) {
              // Log error but don't fail authentication
              // Email failure shouldn't prevent user from logging in
              console.error('Failed to send welcome email:', emailError);
            }
          }

          // Return newly created user
          return done(null, newUser);

        } catch (error) {
          // ==================== ❌ ERROR HANDLING ====================
          console.error('Google Strategy Error:', error);
          
          // Handle MongoDB duplicate key errors (code 11000)
          // This can happen if email already exists but without Google ID
          // and another Google user tries to use same email
          if (error.code === 11000) {
            return done(null, false, { 
              message: 'Email already registered with another method' 
            });
          }

          // Generic error response (don't expose internal details)
          return done(error, false, { 
            message: 'Google authentication failed' 
          });
        }
      }
    )
  );

  // Log successful initialization
  console.log('✅ Google strategy initialized');
};