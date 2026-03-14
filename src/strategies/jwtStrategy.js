// strategies/jwtStrategy.js
// JWT (JSON Web Token) authentication strategy for Passport.js
// Handles token-based authentication for stateless API requests with multiple token sources and security features

const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');  // JWT strategy and token extraction utilities
const User = require('../models/User');  // User model for database operations
const { JWT, SERVER } = require('../config/key');  // JWT configuration (secrets, expiration, etc.)

/**
 * JWT Strategy Configuration
 * This strategy authenticates requests using JWT tokens from various sources
 * Features: Multi-source token extraction, password change invalidation, separate refresh token strategy
 * 
 * @param {Object} passport - Passport instance to register strategy with
 */
module.exports = (passport) => {
  /**
   * JWT Strategy Options
   * Configures how tokens are extracted and validated
   */
  const options = {
    /**
     * Token Extraction Methods (tried in order)
     * Attempts to find a valid JWT token from multiple locations
     */
    jwtFromRequest: ExtractJwt.fromExtractors([
      // 1️⃣ Authorization Header: "Bearer <token>"
      // Most common method for API requests
      ExtractJwt.fromAuthHeaderAsBearerToken(),
      
      // 2️⃣ Cookie: jwt=<token>
      // Used for web applications with httpOnly cookies
      ExtractJwt.fromCookie('jwt'),
      
      // 3️⃣ Query Parameter: ?token=<token>
      // Useful for email verification links or WebSocket connections
      (req) => req?.query?.token,
      
      // 4️⃣ Request Body: { token: "<token>" }
      // Alternative for clients that can't set headers
      (req) => req?.body?.token
    ]),
    
    secretOrKey: JWT.SECRET,           // Secret key to verify token signature
    algorithms: ['HS256'],              // Allowed algorithms (matches token signing)
    passReqToCallback: true,            // Pass request object to callback (for attaching user)
    ignoreExpiration: false              // Reject expired tokens (don't allow them)
  };

  /**
   * Main JWT Strategy (Access Tokens)
   * Used for authenticating API requests
   */
  passport.use(
    'jwt',  // Strategy name - used in passport.authenticate('jwt')
    new JwtStrategy(options, async (req, payload, done) => {
      try {
        // ==================== 1️⃣ TOKEN PAYLOAD VALIDATION ====================
        // Check if token contains required user ID
        if (!payload || !payload.id) {
          return done(null, false, { 
            message: 'Invalid token payload' 
          });
        }

        // ==================== 2️⃣ FIND USER BY ID ====================
        // Retrieve user from database using ID from token
        // Exclude internal fields not needed for authentication
        const user = await User.findById(payload.id)
          .select('-__v -passwordResetToken -passwordResetExpires')  // Omit internal fields
          .populate('cart');  // Populate cart for immediate use in routes

        // ==================== 3️⃣ USER EXISTENCE CHECK ====================
        // Verify user still exists in database
        if (!user) {
          return done(null, false, { 
            message: 'User no longer exists' 
          });
        }

        // ==================== 4️⃣ ACCOUNT STATUS CHECK ====================
        // Verify account is active (not deactivated by admin)
        if (!user.active) {
          return done(null, false, { 
            message: 'Account deactivated' 
          });
        }

        // ==================== 5️⃣ PASSWORD CHANGE VERIFICATION ====================
        /**
         * Security Feature: Token invalidation on password change
         * If user changed password after token was issued, token becomes invalid
         * This ensures any old tokens can't be used after password reset
         */
        if (user.passwordChangedAt) {
          // Convert password change timestamp to seconds (for comparison with iat)
          const changedTimestamp = parseInt(
            user.passwordChangedAt.getTime() / 1000,
            10
          );
          
          // iat (issued at) is in seconds - if token issued before password change
          if (payload.iat < changedTimestamp) {
            return done(null, false, { 
              message: 'Password recently changed. Please login again' 
            });
          }
        }

        // ==================== 6️⃣ ATTACH USER TO REQUEST ====================
        // Make user available to subsequent middleware/routes
        // This populates req.user for use in controllers
        req.user = user;
        
        // ==================== ✅ SUCCESS ====================
        // Return authenticated user
        return done(null, user);

      } catch (error) {
        // Log error for debugging (without exposing details to client)
        console.error('JWT Strategy Error:', error);
        return done(error, false, { 
          message: 'Authentication error' 
        });
      }
    })
  );

  /**
   * Refresh Token Strategy
   * Separate strategy for handling refresh tokens (long-lived tokens for obtaining new access tokens)
   * Uses different secret key and simplified validation
   */
  passport.use(
    'jwt-refresh',  // Different strategy name
    new JwtStrategy(
      {
        ...options,  // Spread base options (inherits extraction methods)
        secretOrKey: JWT.REFRESH_SECRET,  // Use refresh token secret (different from access token)
        passReqToCallback: true
      },
      async (req, payload, done) => {
        try {
          // Basic validation - check payload has user ID
          if (!payload || !payload.id) {
            return done(null, false, { 
              message: 'Invalid refresh token' 
            });
          }

          // Find user and check basic validity
          const user = await User.findById(payload.id);

          // Check user exists and is active
          if (!user || !user.active) {
            return done(null, false, { 
              message: 'Invalid refresh token' 
            });
          }

          // Flag for controller to know this is a refresh token request
          // Useful for generating new access tokens vs. normal authentication
          req.isRefreshToken = true;
          
          return done(null, user);
        } catch (error) {
          return done(error, false);
        }
      }
    )
  );

  // Log successful initialization for debugging
  console.log('✅ JWT strategy initialized');
};