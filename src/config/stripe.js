// config/stripe.js
// Stripe payment gateway configuration file
// Initializes Stripe SDK for processing card payments and handling payment operations

const Stripe = require('stripe');  // Import Stripe's official Node.js library
const { PAYMENT } = require('./key');  // Import payment configuration from key.js

/**
 * Initialize Stripe instance variable
 * Using 'let' allows it to be null if not configured, or the Stripe instance if configured
 * This pattern enables conditional payment processing
 */
let stripe = null;

/**
 * Check if Stripe is properly configured in environment variables
 * isConfigured() checks for presence of STRIPE_SECRET_KEY
 */
if (PAYMENT.STRIPE.isConfigured()) {
  /**
   * Create new Stripe instance with secret key
   * The secret key is used to authenticate API requests to Stripe
   * Never expose this key to the client-side!
   */
  stripe = new Stripe(PAYMENT.STRIPE.SECRET_KEY, {
    /**
     * apiVersion: Specify which version of Stripe API to use
     * '2023-10-16' is a specific API version
     * Pinning the version prevents unexpected breaking changes
     */
    apiVersion: '2023-10-16',
    
    /**
     * typescript: Disable TypeScript typings
     * Set to false since this project uses plain JavaScript
     */
    typescript: false,
    
    /**
     * Other possible options (not shown but available):
     * - maxNetworkRetries: Number of retries for failed requests
     * - timeout: Request timeout in milliseconds
     * - host: Custom API host (for testing)
     */
  });
  
  console.log('✅ Stripe configured successfully');
} else {
  /**
   * Stripe not configured - app will gracefully handle missing payment gateway
   * This allows the app to run in development without Stripe setup
   * Or to disable payments if Stripe is down/unavailable
   */
  console.warn('⚠️ Stripe not configured - card payments disabled');
}

/**
 * Export the Stripe instance
 * Pattern: Export may be null or configured Stripe object
 * 
 * IMPORTANT: Always check if stripe exists before using:
 * if (stripe) { 
 *   // Process payment
 * } else {
 *   // Show payment unavailable message
 * }
 */
module.exports = stripe;