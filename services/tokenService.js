const jwt = require('jsonwebtoken');
const crypto = require('crypto');

class TokenService {
  // Generate JWT access token
  static generateAccessToken(userId, email, role) {
    return jwt.sign(
      { id: userId, email, role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE }
    );
  }

  // Generate JWT refresh token
  static generateRefreshToken(userId) {
    return jwt.sign(
      { id: userId },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRE }
    );
  }

  // Verify access token
  static verifyAccessToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  // Verify refresh token
  static verifyRefreshToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  // Generate random token (for password reset, email verification)
  static generateRandomToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Hash token
  static hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // Generate token with expiry
  static generateTokenWithExpiry(expiryMinutes = 10) {
    const token = this.generateRandomToken();
    const hashedToken = this.hashToken(token);
    const expiryDate = new Date(Date.now() + expiryMinutes * 60 * 1000);
    
    return {
      token,
      hashedToken,
      expiryDate,
    };
  }
}

module.exports = TokenService;