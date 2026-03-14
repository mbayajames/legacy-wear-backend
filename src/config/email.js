// config/email.js
// Email configuration and utility class for sending emails using Nodemailer
// Handles both production email (SMTP) and development testing (Ethereal)

const nodemailer = require('nodemailer');  // Email sending library
const { EMAIL } = require('./key');  // Import email configuration from key.js

/**
 * EmailConfig Class
 * Manages email transporter creation and email sending functionality
 * Supports both production SMTP servers and development/test ethereal.email
 */
class EmailConfig {
  /**
   * Constructor initializes email configuration state
   * Sets up transporter as null (lazy initialization)
   * Determines if email is properly configured based on credentials
   */
  constructor() {
    this.transporter = null;  // Will hold the nodemailer transporter instance
    // Check if email credentials exist (username AND password are present)
    this.isConfigured = !!(EMAIL.USERNAME && EMAIL.PASSWORD);
  }
  
  /**
   * Get or create email transporter
   * Implements lazy initialization - creates transporter only when needed
   * Verifies connection if using real email credentials
   * 
   * @returns {Object} Nodemailer transporter instance
   */
  getTransporter() {
    // Return existing transporter if already created (singleton pattern)
    if (this.transporter) return this.transporter;
    
    /**
     * Get transporter configuration from key.js
     * This will return either:
     * 1. Production SMTP config (if credentials exist)
     * 2. Ethereal test config (if no credentials)
     */
    const config = EMAIL.getTransporterConfig();
    
    // Create nodemailer transporter with the configuration
    this.transporter = nodemailer.createTransport(config);
    
    /**
     * Verify transporter connection (only for production email)
     * Tests if the SMTP connection works properly
     * Not critical for ethereal (test) emails
     */
    if (this.isConfigured) {
      this.transporter.verify((error, success) => {
        if (error) {
          console.error('❌ Email transporter verification failed:', error);
        } else {
          console.log('✅ Email transporter ready');
        }
      });
    }
    
    return this.transporter;
  }
  
  /**
   * Send an email using configured transporter
   * Handles both production and test emails
   * For test emails (ethereal), logs preview URL to view the email
   * 
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email address
   * @param {string} options.subject - Email subject line
   * @param {string} options.text - Plain text version of email
   * @param {string} options.html - HTML version of email
   * @param {Array} options.attachments - Optional file attachments
   * @returns {Promise<Object>} Nodemailer info object
   * @throws {Error} If email sending fails
   */
  async sendMail(options) {
    // Get or create transporter
    const transporter = this.getTransporter();
    
    /**
     * Prepare email options with defaults
     * FROM is set from configuration
     * Attachments default to empty array if not provided
     */
    const mailOptions = {
      from: EMAIL.FROM,                    // Sender address from config
      to: options.to,                       // Recipient address
      subject: options.subject,              // Email subject
      text: options.text,                    // Plain text version
      html: options.html,                    // HTML version
      attachments: options.attachments || []  // Optional attachments
    };
    
    try {
      // Attempt to send the email
      const info = await transporter.sendMail(mailOptions);
      
      /**
       * For ethereal.email (test accounts), generate preview URL
       * This allows developers to view sent emails in a browser
       * Only applies when using test email configuration
       */
      if (!this.isConfigured) {
        console.log('📧 Preview URL: %s', nodemailer.getTestMessageUrl(info));
      }
      
      return info;  // Return email info (includes messageId, preview URL, etc.)
    } catch (error) {
      // Log and rethrow any email sending errors
      console.error('❌ Failed to send email:', error);
      throw error;
    }
  }
}

/**
 * Export a singleton instance of EmailConfig
 * This ensures all parts of the app use the same email configuration
 * Pattern: Export instantiated object, not the class
 * 
 * Benefits:
 * 1. Single transporter instance (connection pooling)
 * 2. Consistent configuration across app
 * 3. Lazy initialization (transporter created on first use)
 */
module.exports = new EmailConfig();