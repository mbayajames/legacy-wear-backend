// config/mpesa.js
// M-Pesa payment gateway configuration and utility class
// Handles authentication, token management, and payment preparation for Safaricom's M-Pesa API

const axios = require('axios');  // HTTP client for making API requests
const { PAYMENT } = require('./key');  // Import payment configuration from key.js

/**
 * MpesaConfig Class
 * Manages all M-Pesa payment gateway configurations and operations
 * Implements token caching and utility methods for M-Pesa API integration
 */
class MpesaConfig {
  /**
   * Constructor initializes M-Pesa configuration from environment variables
   * Sets up initial state with null token and expiry
   */
  constructor() {
    // Core credentials from configuration
    this.consumerKey = PAYMENT.MPESA.CONSUMER_KEY;        // App consumer key for OAuth
    this.consumerSecret = PAYMENT.MPESA.CONSUMER_SECRET;  // App consumer secret
    this.passkey = PAYMENT.MPESA.PASSKEY;                 // Lipa Na M-Pesa Online passkey
    this.shortCode = PAYMENT.MPESA.SHORTCODE;             // Business shortcode (e.g., 174379)
    this.environment = PAYMENT.MPESA.ENVIRONMENT;         // 'sandbox' or 'production'
    
    // API endpoints based on environment
    this.urls = PAYMENT.MPESA.getAPIUrls();                // Get all M-Pesa API URLs
    
    // Token management
    this.accessToken = null;    // Current OAuth access token
    this.tokenExpiry = null;     // Timestamp when token expires
  }
  
  /**
   * Get OAuth access token for M-Pesa API authentication
   * Implements token caching to avoid unnecessary requests
   * Tokens typically expire after 1 hour (3600 seconds)
   * 
   * @returns {Promise<string>} Valid access token
   * @throws {Error} If token acquisition fails
   */
  async getAccessToken() {
    // Check if we have a valid token that hasn't expired
    // Token expiry includes a 1-minute buffer for safety
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > Date.now()) {
      return this.accessToken;  // Return cached token
    }
    
    try {
      /**
       * Generate Basic Auth header for OAuth token request
       * Format: Basic base64(consumerKey:consumerSecret)
       */
      const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
      
      /**
       * Request OAuth token from M-Pesa API
       * GET request to OAuth endpoint with Basic Authentication
       */
      const response = await axios.get(this.urls.oauth, {
        headers: {
          Authorization: `Basic ${auth}`
        }
      });
      
      /**
       * Store token with expiry
       * expires_in is typically 3600 seconds (1 hour)
       * Subtract 60 seconds buffer to ensure we don't use expired token
       */
      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // Subtract 1 minute buffer
      
      return this.accessToken;
    } catch (error) {
      // Log error and rethrow for handling by caller
      console.error('❌ Failed to get M-Pesa access token:', error.message);
      throw error;
    }
  }
  
  /**
   * Check if M-Pesa is properly configured
   * Delegates to the main PAYMENT configuration
   * 
   * @returns {boolean} True if M-Pesa credentials are present
   */
  isConfigured() {
    return PAYMENT.MPESA.isConfigured();
  }
  
  /**
   * Generate timestamp in M-Pesa required format
   * Format: YYYYMMDDHHmmss (e.g., 20240313143000 for March 13, 2024, 14:30:00)
   * Used in password generation and transaction requests
   * 
   * @returns {string} Formatted timestamp
   */
  getTimestamp() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');  // Months are 0-based
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }
  
  /**
   * Generate STK push password
   * Format: base64(shortcode + passkey + timestamp)
   * This is a security requirement for Lipa Na M-Pesa Online API
   * 
   * @param {string} timestamp - Timestamp in YYYYMMDDHHmmss format
   * @returns {string} Base64 encoded password
   */
  generatePassword(timestamp) {
    // Concatenate shortcode, passkey, and timestamp
    const str = `${this.shortCode}${this.passkey}${timestamp}`;
    // Encode to base64 as required by M-Pesa API
    return Buffer.from(str).toString('base64');
  }
}

/**
 * Export a singleton instance of MpesaConfig
 * This ensures all parts of the app use the same instance
 * Important for token caching to work effectively
 * 
 * Pattern: Export instantiated object, not the class
 */
module.exports = new MpesaConfig();