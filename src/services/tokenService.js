// services/tokenService.js
// Token service - comprehensive service for all token operations
// Handles JWT tokens, random tokens, password reset tokens, API keys, and more

const jwt = require('jsonwebtoken');           // JSON Web Token library
const crypto = require('crypto');               // Node.js crypto for secure random generation
const { JWT } = require('../config/key');       // JWT configuration

/**
 * Token Service Class
 * Provides a centralized service for all token-related operations
 * Handles generation, verification, and management of various token types
 */
class TokenService {
  // ========== JWT TOKENS ==========

  /**
   * Generate JWT access token
   * @param {string} id - User ID to encode in token
   * @returns {string} JWT token
   */
  generateToken(id) {
    return jwt.sign({ id }, JWT.SECRET, {
      expiresIn: JWT.EXPIRES_IN  // e.g., '90d'
    });
  }

  /**
   * Generate JWT refresh token (longer-lived)
   * @param {string} id - User ID to encode in token
   * @returns {string} Refresh token
   */
  generateRefreshToken(id) {
    return jwt.sign({ id }, JWT.REFRESH_SECRET, {
      expiresIn: JWT.REFRESH_EXPIRES_IN  // e.g., '180d'
    });
  }

  /**
   * Verify JWT token
   * @param {string} token - Token to verify
   * @param {boolean} isRefreshToken - Whether this is a refresh token (uses different secret)
   * @returns {Object|null} Decoded payload or null if invalid
   */
  verifyToken(token, isRefreshToken = false) {
    try {
      const secret = isRefreshToken ? JWT.REFRESH_SECRET : JWT.SECRET;
      return jwt.verify(token, secret);
    } catch (error) {
      return null;  // Token invalid or expired
    }
  }

  /**
   * Decode token without verification (for reading payload)
   * @param {string} token - Token to decode
   * @returns {Object|null} Decoded payload
   */
  decodeToken(token) {
    return jwt.decode(token);
  }

  // ========== RANDOM TOKENS ==========

  /**
   * Generate cryptographically secure random token
   * @param {number} bytes - Number of random bytes (default 32)
   * @returns {string} Hex string of random bytes
   */
  generateRandomToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
  }

  /**
   * Create password reset token with hash and expiry
   * @returns {Object} Token data
   */
  createPasswordResetToken() {
    const resetToken = this.generateRandomToken();  // Plain token to email user
    
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');  // Hash stored in database
    
    const expiresAt = Date.now() + 10 * 60 * 1000;  // 10 minutes from now
    
    return { resetToken, hashedToken, expiresAt };
  }

  /**
   * Create email verification token with hash and expiry
   * @returns {Object} Token data
   */
  createEmailVerificationToken() {
    const verificationToken = this.generateRandomToken();
    
    const hashedToken = crypto
      .createHash('sha256')
      .update(verificationToken)
      .digest('hex');
    
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;  // 24 hours from now
    
    return { verificationToken, hashedToken, expiresAt };
  }

  /**
   * Hash a token (for comparison)
   * @param {string} token - Plain token to hash
   * @returns {string} SHA256 hash
   */
  hashToken(token) {
    return crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
  }

  /**
   * Verify a plain token against a stored hash
   * @param {string} token - Plain token to verify
   * @param {string} hashedToken - Stored hash
   * @returns {boolean} True if token matches hash
   */
  verifyHashedToken(token, hashedToken) {
    const hash = this.hashToken(token);
    return hash === hashedToken;
  }

  // ========== SPECIALIZED TOKENS ==========

  /**
   * Generate API key for programmatic access
   * Format: lw_ + 32 random bytes as hex
   * @returns {string} API key
   */
  generateApiKey() {
    const prefix = 'lw_';
    const key = crypto.randomBytes(32).toString('hex');
    return `${prefix}${key}`;
  }

  /**
   * Generate CSRF token for form protection
   * @returns {string} CSRF token
   */
  generateCsrfToken() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Generate session token
   * @returns {string} Session token
   */
  generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate referral code from user ID
   * Format: LW + 8 chars (MD5 hash truncated)
   * @param {string} userId - User ID
   * @returns {string} Referral code
   */
  generateReferralCode(userId) {
    const hash = crypto
      .createHash('md5')
      .update(userId.toString() + Date.now().toString())
      .digest('hex')
      .substring(0, 8)
      .toUpperCase();
    
    return `LW${hash}`;
  }

  // ========== TOKEN EXTRACTION ==========

  /**
   * Extract token from Authorization header
   * @param {string} authHeader - Authorization header value
   * @returns {string|null} Token or null
   */
  extractTokenFromHeader(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    
    return authHeader.substring(7);  // Remove 'Bearer ' prefix
  }

  /**
   * Extract token from cookies
   * @param {Object} cookies - Cookie object from request
   * @param {string} cookieName - Name of the cookie (default 'jwt')
   * @returns {string|null} Token or null
   */
  extractTokenFromCookie(cookies, cookieName = 'jwt') {
    return cookies?.[cookieName] || null;
  }

  // ========== TOKEN VALIDATION ==========

  /**
   * Validate JWT token structure (3 parts separated by dots)
   * @param {string} token - Token to validate
   * @returns {boolean} True if structure is valid
   */
  validateTokenStructure(token) {
    if (!token || typeof token !== 'string') return false;
    
    // JWT format: header.payload.signature (3 parts)
    const parts = token.split('.');
    return parts.length === 3;
  }

  /**
   * Get token expiration date
   * @param {string} token - JWT token
   * @returns {Date|null} Expiration date or null
   */
  getTokenExpiration(token) {
    try {
      const decoded = jwt.decode(token);
      // exp is in seconds since epoch
      return decoded?.exp ? new Date(decoded.exp * 1000) : null;
    } catch {
      return null;
    }
  }

  /**
   * Check if token is expired
   * @param {string} token - JWT token
   * @returns {boolean} True if expired
   */
  isTokenExpired(token) {
    const exp = this.getTokenExpiration(token);
    return exp ? exp < new Date() : true;
  }

  // ========== TOKEN PAIR MANAGEMENT ==========

  /**
   * Generate both access and refresh tokens
   * @param {string} id - User ID
   * @returns {Object} Token pair with expiration info
   */
  generateTokenPair(id) {
    return {
      accessToken: this.generateToken(id),
      refreshToken: this.generateRefreshToken(id),
      expiresIn: JWT.EXPIRES_IN  // For frontend to know when to refresh
    };
  }

  /**
   * Get new access token using refresh token
   * @param {string} refreshToken - Valid refresh token
   * @returns {string|null} New access token or null if invalid
   */
  refreshAccessToken(refreshToken) {
    const decoded = this.verifyToken(refreshToken, true);
    
    if (!decoded || !decoded.id) {
      return null;
    }
    
    return this.generateToken(decoded.id);
  }
}

module.exports = new TokenService();