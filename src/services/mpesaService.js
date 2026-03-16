// services/mpesaService.js
// M-Pesa service - comprehensive service class for all M-Pesa API operations
// Handles authentication, STK Push, status queries, URL registration, and callback parsing

const axios = require('axios');                    // HTTP client for API calls
const { PAYMENT } = require('../config/key');      // Payment configuration
const AppError = require('../utils/AppError');     // Custom error class

/**
 * M-Pesa Service Class
 * Provides a clean abstraction over Safaricom's M-Pesa API
 * Handles authentication, token caching, and all payment operations
 */
class MpesaService {
  constructor() {
    // Initialize with configuration from key.js
    this.consumerKey = PAYMENT.MPESA.CONSUMER_KEY;        // App consumer key
    this.consumerSecret = PAYMENT.MPESA.CONSUMER_SECRET;  // App consumer secret
    this.passkey = PAYMENT.MPESA.PASSKEY;                  // Lipa Na M-Pesa Online passkey
    this.shortCode = PAYMENT.MPESA.SHORTCODE;               // Business shortcode (e.g., 174379)
    this.environment = PAYMENT.MPESA.ENVIRONMENT;           // 'sandbox' or 'production'
    this.urls = PAYMENT.MPESA.getAPIUrls();                 // API endpoints based on environment
    
    // Token management
    this.accessToken = null;     // Cached access token
    this.tokenExpiry = null;      // Token expiration timestamp
  }

  // ========== GET ACCESS TOKEN ==========
  /**
   * Get OAuth access token for M-Pesa API
   * Implements token caching to minimize API calls
   * 
   * @returns {Promise<string>} Valid access token
   * @throws {AppError} If service unavailable
   */
  async getAccessToken() {
    // Return cached token if still valid (with 1-minute buffer)
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }

    try {
      // Create Basic Auth header (Base64 encoded consumerKey:consumerSecret)
      const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
      
      // Request new token from M-Pesa
      const response = await axios.get(this.urls.oauth, {
        headers: {
          Authorization: `Basic ${auth}`
        }
      });
      
      // Cache token with expiry (subtract 1 minute buffer)
      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;
      
      return this.accessToken;
    } catch (error) {
      console.error('Failed to get M-Pesa access token:', error.response?.data || error.message);
      throw new AppError('M-Pesa service unavailable', 503);
    }
  }

  // ========== GENERATE TIMESTAMP ==========
  /**
   * Generate timestamp in M-Pesa required format
   * Format: YYYYMMDDHHmmss (e.g., 20240315143000)
   * 
   * @returns {string} Formatted timestamp
   */
  getTimestamp() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  // ========== GENERATE PASSWORD ==========
  /**
   * Generate STK push password
   * Formula: base64(shortcode + passkey + timestamp)
   * 
   * @param {string} timestamp - Timestamp in YYYYMMDDHHmmss format
   * @returns {string} Base64 encoded password
   */
  generatePassword(timestamp) {
    const str = `${this.shortCode}${this.passkey}${timestamp}`;
    return Buffer.from(str).toString('base64');
  }

  // ========== INITIATE STK PUSH ==========
  /**
   * Initiate STK Push (payment request to customer's phone)
   * 
   * @param {string} phoneNumber - Customer's phone number (e.g., 0712345678)
   * @param {number} amount - Amount to charge
   * @param {string} accountReference - Your reference (shows on customer's phone)
   * @param {string} transactionDesc - Transaction description
   * @returns {Promise<Object>} M-Pesa API response
   * @throws {AppError} If initiation fails
   */
  async stkPush(phoneNumber, amount, accountReference, transactionDesc) {
    try {
      const token = await this.getAccessToken();
      const timestamp = this.getTimestamp();
      const password = this.generatePassword(timestamp);
      
      // Format phone number to international format (254XXXXXXXXX)
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      
      const data = {
        BusinessShortCode: this.shortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.round(amount),
        PartyA: formattedPhone,      // Customer's phone
        PartyB: this.shortCode,       // Business shortcode
        PhoneNumber: formattedPhone,  // Customer's phone (again)
        CallBackURL: `${process.env.API_URL}/api/payments/mpesa/callback`,
        AccountReference: accountReference,
        TransactionDesc: transactionDesc || 'Payment'
      };
      
      const response = await axios.post(this.urls.stkPush, data, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('STK Push failed:', error.response?.data || error.message);
      throw new AppError('Failed to initiate M-Pesa payment', 500);
    }
  }

  // ========== QUERY STK PUSH STATUS ==========
  /**
   * Query the status of an STK Push transaction
   * 
   * @param {string} checkoutRequestId - M-Pesa checkout request ID
   * @returns {Promise<Object>} Payment status
   * @throws {AppError} If query fails
   */
  async queryStatus(checkoutRequestId) {
    try {
      const token = await this.getAccessToken();
      const timestamp = this.getTimestamp();
      const password = this.generatePassword(timestamp);
      
      const data = {
        BusinessShortCode: this.shortCode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId
      };
      
      const response = await axios.post(this.urls.query, data, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Status query failed:', error.response?.data || error.message);
      throw new AppError('Failed to query payment status', 500);
    }
  }

  // ========== REGISTER C2B URLs ==========
  /**
   * Register C2B (Customer to Business) URLs
   * Required for receiving payment notifications
   * Should be called once when setting up the system
   * 
   * @returns {Promise<Object>} Registration response
   */
  async registerUrls() {
    try {
      const token = await this.getAccessToken();
      
      const data = {
        ShortCode: this.shortCode,
        ResponseType: 'Completed',  // Auto-respond to validation requests
        ConfirmationURL: `${process.env.API_URL}/api/payments/mpesa/confirmation`,
        ValidationURL: `${process.env.API_URL}/api/payments/mpesa/validation`
      };
      
      const response = await axios.post(this.urls.register, data, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('URL registration failed:', error.response?.data || error.message);
      throw new AppError('Failed to register M-Pesa URLs', 500);
    }
  }

  // ========== SIMULATE C2B TRANSACTION (for testing) ==========
  /**
   * Simulate a C2B transaction (sandbox only)
   * Used for testing in development environment
   * 
   * @param {string} phoneNumber - Customer's phone
   * @param {number} amount - Transaction amount
   * @param {string} billRefNumber - Bill reference
   * @returns {Promise<Object>} Simulation result
   */
  async simulateC2B(phoneNumber, amount, billRefNumber) {
    try {
      const token = await this.getAccessToken();
      
      const data = {
        ShortCode: this.shortCode,
        CommandID: 'CustomerPayBillOnline',
        Amount: amount,
        Msisdn: phoneNumber,
        BillRefNumber: billRefNumber
      };
      
      const response = await axios.post(
        `${this.urls.base}/mpesa/c2b/v1/simulate`,
        data,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('C2B simulation failed:', error.response?.data || error.message);
      throw new AppError('Failed to simulate C2B transaction', 500);
    }
  }

  // ========== FORMAT PHONE NUMBER ==========
  /**
   * Format phone number to M-Pesa standard (254XXXXXXXXX)
   * 
   * @param {string} phone - Raw phone number (e.g., 0712345678, +254712345678)
   * @returns {string} Formatted phone number
   * @throws {AppError} If format is invalid
   */
  formatPhoneNumber(phone) {
    // Remove any non-digit characters
    let cleaned = phone.replace(/\D/g, '');
    
    // If it starts with 0 (local format), replace with 254
    if (cleaned.startsWith('0')) {
      cleaned = '254' + cleaned.slice(1);
    }
    
    // If it doesn't start with 254, add it
    if (!cleaned.startsWith('254')) {
      cleaned = '254' + cleaned;
    }
    
    // Ensure it's exactly 12 digits (254 + 9 digits)
    if (cleaned.length !== 12) {
      throw new AppError('Invalid phone number format', 400);
    }
    
    return cleaned;
  }

  // ========== PARSE CALLBACK DATA ==========
  /**
   * Parse M-Pesa callback data into a usable format
   * 
   * @param {Object} callbackData - Raw callback from M-Pesa
   * @returns {Object} Parsed payment data
   */
  parseCallbackData(callbackData) {
    const { Body } = callbackData;
    
    if (Body.stkCallback.ResultCode === 0) {
      // Successful payment
      const { CheckoutRequestID, CallbackMetadata } = Body.stkCallback;
      
      // Extract metadata from array format
      const metadata = {};
      CallbackMetadata.Item.forEach(item => {
        metadata[item.Name] = item.Value;
      });
      
      return {
        success: true,
        checkoutRequestId: CheckoutRequestID,
        mpesaReceipt: metadata.MpesaReceiptNumber,  // M-Pesa receipt number
        amount: metadata.Amount,
        phoneNumber: metadata.PhoneNumber,
        transactionDate: metadata.TransactionDate,
        metadata  // Full metadata for debugging
      };
    } else {
      // Failed payment
      return {
        success: false,
        checkoutRequestId: Body.stkCallback.CheckoutRequestID,
        resultCode: Body.stkCallback.ResultCode,
        resultDesc: Body.stkCallback.ResultDesc
      };
    }
  }

  // ========== CHECK SERVICE AVAILABILITY ==========
  /**
   * Check if M-Pesa service is configured and available
   * 
   * @returns {boolean} True if all credentials are present
   */
  isAvailable() {
    return !!(this.consumerKey && this.consumerSecret && this.passkey);
  }
}

// Export singleton instance
module.exports = new MpesaService();