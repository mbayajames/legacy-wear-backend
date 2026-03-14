// config/session.js
// Session configuration file for express-session middleware
// Manages user sessions with MongoDB storage for persistence across server restarts

const session = require('express-session');  // Express session middleware
const MongoStore = require('connect-mongo');  // MongoDB session store (sessions persist in database)
const { SESSION, DATABASE, SERVER } = require('./key');  // Import configuration values

/**
 * Session Configuration Object
 * Defines how sessions are created, stored, and managed
 */
const sessionConfig = {
  // ===== SESSION IDENTIFICATION =====
  /**
   * Secret used to sign the session ID cookie
   * Multiple secrets can be provided as an array for rotation
   * First secret is used for signing, others for verification
   */
  secret: SESSION.SECRET,
  
  /**
   * resave: Forces session to be saved back to store even if unmodified
   * Set to false to avoid unnecessary save operations
   */
  resave: false,
  
  /**
   * saveUninitialized: Forces saving of uninitialized sessions
   * Set to false to comply with GDPR and reduce storage usage
   * Only creates session when data is added
   */
  saveUninitialized: false,
  
  /**
   * name: Name of the session cookie
   * Default is 'connect.sid', changed for application branding
   */
  name: SESSION.NAME,  // 'legacywear.sid' from config
  
  // ===== SESSION STORAGE =====
  /**
   * MongoDB session store configuration
   * Stores sessions in database instead of memory
   * Benefits: Sessions persist across server restarts, shareable across multiple instances
   */
  store: MongoStore.create({
    // MongoDB connection string
    mongoUrl: DATABASE.getConnectionString(),
    
    // Session TTL (time to live) in seconds - matches cookie maxAge
    ttl: SESSION.TTL,  // 14 days from config
    
    /**
     * autoRemove: Automatic cleanup of expired sessions
     * 'native' uses MongoDB's TTL index feature for automatic deletion
     */
    autoRemove: 'native',
    
    // Collection name for sessions in MongoDB
    collectionName: 'sessions',
    
    /**
     * touchAfter: Updates session only once in this period (in seconds)
     * Reduces database writes for performance
     * Only updates if session data actually changes
     */
    touchAfter: 24 * 3600  // Only update once per day if no changes
  }),
  
  // ===== COOKIE CONFIGURATION =====
  /**
   * Cookie settings for the session cookie
   * These affect how the browser handles the cookie
   */
  cookie: {
    /**
     * secure: Only send cookie over HTTPS
     * Enabled in production for security, disabled in dev for HTTP testing
     */
    secure: SERVER.IS_PRODUCTION,
    
    /**
     * httpOnly: Prevents JavaScript access to cookie
     * Critical security feature - prevents XSS attacks from stealing session
     */
    httpOnly: true,
    
    /**
     * maxAge: Cookie expiration in milliseconds
     * Converted from SESSION.TTL (seconds) to milliseconds
     */
    maxAge: SESSION.TTL * 1000,  // 14 days in milliseconds
    
    /**
     * sameSite: CSRF protection
     * 'none' in production (allows cross-site requests)
     * 'lax' in development (more restrictive, better security)
     */
    sameSite: SERVER.IS_PRODUCTION ? 'none' : 'lax',
    
    /**
     * domain: Cookie domain
     * Set in production for cross-subdomain sessions
     * Undefined in dev (defaults to current domain only)
     */
    domain: SERVER.IS_PRODUCTION ? SERVER.DOMAIN : undefined,
    
    /**
     * path: Cookie path
     * '/' makes cookie available for entire site
     */
    path: '/'
  },
  
  // ===== SESSION BEHAVIOR =====
  /**
   * rolling: Reset cookie maxAge on each response
   * Keeps session alive as long as user is active
   * Prevents session expiration during active use
   */
  rolling: true,
  
  /**
   * unset: What to do when session is destroyed
   * 'destroy' ensures cookie is removed when session.clearCookie() is called
   */
  unset: 'destroy'
};

// ===== PRODUCTION-SPECIFIC ADJUSTMENTS =====
/**
 * Trust proxy in production environments
 * Required when running behind a reverse proxy/load balancer (e.g., Nginx, Heroku)
 * Ensures secure cookies work correctly when HTTPS terminates at proxy
 */
if (SERVER.IS_PRODUCTION) {
  sessionConfig.proxy = true;  // Trust the reverse proxy
  sessionConfig.cookie.secure = true;  // Explicitly require HTTPS
}

// Export the configuration for use in main app
module.exports = sessionConfig;