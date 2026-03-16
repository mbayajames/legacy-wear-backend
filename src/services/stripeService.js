// services/stripeService.js
// Stripe service - comprehensive service class for all Stripe payment operations
// Handles payment intents, refunds, customers, subscriptions, and webhooks

const Stripe = require('stripe');                         // Stripe Node.js library
const { PAYMENT } = require('../config/key');             // Payment configuration
const AppError = require('../utils/AppError');            // Custom error class

/**
 * Stripe Service Class
 * Provides a clean abstraction over Stripe's API
 * Handles all payment operations with consistent error handling
 */
class StripeService {
  constructor() {
    this.stripe = null;
    this.initialize();
  }

  /**
   * Initialize Stripe with API key from configuration
   * Only initializes if credentials are present
   */
  initialize() {
    if (PAYMENT.STRIPE.isConfigured()) {
      this.stripe = new Stripe(PAYMENT.STRIPE.SECRET_KEY, {
        apiVersion: '2023-10-16',      // Pin API version to prevent breaking changes
        typescript: false               // Disable TypeScript types (using plain JS)
      });
      console.log('✅ Stripe service initialized');
    } else {
      console.warn('⚠️ Stripe not configured - card payments disabled');
    }
  }

  // ========== CREATE PAYMENT INTENT ==========
  /**
   * Create a payment intent for collecting payment
   * 
   * @param {number} amount - Amount to charge (in base currency, e.g., 50.00 for KES 50)
   * @param {string} orderId - Order ID for metadata
   * @param {string} orderNumber - Order number for reference
   * @param {string} userId - User ID for metadata
   * @returns {Promise<Object>} Payment intent details (id, clientSecret, status)
   * @throws {AppError} If creation fails
   */
  async createPaymentIntent(amount, orderId, orderNumber, userId) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents (Stripe's smallest currency unit)
        currency: PAYMENT.STRIPE.CURRENCY,  // e.g., 'kes', 'usd'
        metadata: {
          orderId: orderId.toString(),
          orderNumber,
          userId: userId.toString()
        },
        automatic_payment_methods: {
          enabled: true  // Allow all payment methods (cards, etc.)
        }
      });
      
      return {
        id: paymentIntent.id,
        clientSecret: paymentIntent.client_secret, // For frontend to complete payment
        status: paymentIntent.status
      };
    } catch (error) {
      console.error('Stripe create payment intent error:', error);
      throw new AppError('Failed to create payment intent', 500);
    }
  }

  // ========== CONFIRM PAYMENT INTENT ==========
  /**
   * Confirm a payment intent with a payment method
   * 
   * @param {string} paymentIntentId - ID of payment intent to confirm
   * @param {string} paymentMethodId - Payment method ID from frontend
   * @returns {Promise<Object>} Confirmed payment intent
   */
  async confirmPaymentIntent(paymentIntentId, paymentMethodId) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: paymentMethodId
      });
      
      return {
        id: paymentIntent.id,
        status: paymentIntent.status,
        nextAction: paymentIntent.next_action  // For 3D Secure, etc.
      };
    } catch (error) {
      console.error('Stripe confirm payment error:', error);
      throw new AppError('Failed to confirm payment', 500);
    }
  }

  // ========== CANCEL PAYMENT INTENT ==========
  /**
   * Cancel a payment intent (e.g., order cancelled before payment)
   * 
   * @param {string} paymentIntentId - ID of payment intent to cancel
   * @returns {Promise<Object>} Cancelled payment intent
   */
  async cancelPaymentIntent(paymentIntentId) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.cancel(paymentIntentId);
      return {
        id: paymentIntent.id,
        status: paymentIntent.status
      };
    } catch (error) {
      console.error('Stripe cancel payment error:', error);
      throw new AppError('Failed to cancel payment', 500);
    }
  }

  // ========== CREATE REFUND ==========
  /**
   * Create a refund for a payment
   * 
   * @param {string} paymentIntentId - ID of payment intent to refund
   * @param {number} amount - Amount to refund (optional, full refund if omitted)
   * @param {string} reason - Reason for refund
   * @returns {Promise<Object>} Refund details
   */
  async createRefund(paymentIntentId, amount, reason) {
    try {
      const refundParams = {
        payment_intent: paymentIntentId,
        reason: reason || 'requested_by_customer'
      };
      
      if (amount) {
        refundParams.amount = Math.round(amount * 100); // Partial refund
      }
      
      const refund = await this.stripe.refunds.create(refundParams);
      
      return {
        id: refund.id,
        amount: refund.amount / 100,  // Convert back from cents
        status: refund.status,
        reason: refund.reason
      };
    } catch (error) {
      console.error('Stripe refund error:', error);
      throw new AppError('Failed to process refund', 500);
    }
  }

  // ========== CREATE CUSTOMER ==========
  /**
   * Create a customer in Stripe
   * 
   * @param {string} email - Customer email
   * @param {string} name - Customer name
   * @param {string} paymentMethodId - Optional payment method to attach
   * @returns {Promise<Object>} Stripe customer object
   */
  async createCustomer(email, name, paymentMethodId) {
    try {
      const customer = await this.stripe.customers.create({
        email,
        name,
        payment_method: paymentMethodId
      });
      
      return customer;
    } catch (error) {
      console.error('Stripe create customer error:', error);
      throw new AppError('Failed to create customer', 500);
    }
  }

  // ========== CREATE SUBSCRIPTION ==========
  /**
   * Create a subscription for recurring payments
   * 
   * @param {string} customerId - Stripe customer ID
   * @param {string} priceId - Stripe price ID for the subscription
   * @returns {Promise<Object>} Subscription object
   */
  async createSubscription(customerId, priceId) {
    try {
      const subscription = await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',  // Don't confirm payment immediately
        expand: ['latest_invoice.payment_intent'] // Include payment intent for frontend
      });
      
      return subscription;
    } catch (error) {
      console.error('Stripe create subscription error:', error);
      throw new AppError('Failed to create subscription', 500);
    }
  }

  // ========== VERIFY WEBHOOK ==========
  /**
   * Verify Stripe webhook signature for security
   * 
   * @param {Buffer} payload - Raw request body
   * @param {string} signature - Stripe signature header
   * @returns {Object|null} Verified event or null
   */
  verifyWebhookSignature(payload, signature) {
    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        PAYMENT.STRIPE.WEBHOOK_SECRET
      );
      return event;
    } catch (error) {
      console.error('Stripe webhook verification failed:', error);
      return null;
    }
  }

  // ========== GET PAYMENT INTENT ==========
  /**
   * Retrieve payment intent details
   * 
   * @param {string} paymentIntentId - ID of payment intent
   * @returns {Promise<Object>} Payment intent object
   */
  async getPaymentIntent(paymentIntentId) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
      return paymentIntent;
    } catch (error) {
      console.error('Stripe retrieve payment intent error:', error);
      throw new AppError('Failed to retrieve payment', 500);
    }
  }

  // ========== LIST PAYMENT METHODS ==========
  /**
   * List saved payment methods for a customer
   * 
   * @param {string} customerId - Stripe customer ID
   * @returns {Promise<Array>} List of payment methods
   */
  async listPaymentMethods(customerId) {
    try {
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card'
      });
      
      return paymentMethods.data;
    } catch (error) {
      console.error('Stripe list payment methods error:', error);
      throw new AppError('Failed to list payment methods', 500);
    }
  }

  // ========== ATTACH PAYMENT METHOD ==========
  /**
   * Attach a payment method to a customer
   * 
   * @param {string} paymentMethodId - Payment method to attach
   * @param {string} customerId - Customer to attach to
   * @returns {Promise<Object>} Attached payment method
   */
  async attachPaymentMethod(paymentMethodId, customerId) {
    try {
      const paymentMethod = await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId
      });
      
      return paymentMethod;
    } catch (error) {
      console.error('Stripe attach payment method error:', error);
      throw new AppError('Failed to attach payment method', 500);
    }
  }

  // ========== DETACH PAYMENT METHOD ==========
  /**
   * Detach a payment method from a customer
   * 
   * @param {string} paymentMethodId - Payment method to detach
   * @returns {Promise<Object>} Detached payment method
   */
  async detachPaymentMethod(paymentMethodId) {
    try {
      const paymentMethod = await this.stripe.paymentMethods.detach(paymentMethodId);
      return paymentMethod;
    } catch (error) {
      console.error('Stripe detach payment method error:', error);
      throw new AppError('Failed to detach payment method', 500);
    }
  }

  // ========== CHECK SERVICE AVAILABILITY ==========
  /**
   * Check if Stripe service is configured and available
   * 
   * @returns {boolean} True if initialized
   */
  isAvailable() {
    return !!this.stripe;
  }
}

// Export singleton instance
module.exports = new StripeService();