// services/templateService.js
// Template service - handles loading, caching, and rendering of Handlebars templates
// Provides specialized methods for different email types with common data and helpers

const handlebars = require('handlebars');           // Template engine
const fs = require('fs').promises;                  // File system operations (promise version)
const path = require('path');                        // Path manipulation
const { SERVER } = require('../config/key');        // Server configuration

// ========== REGISTER HANDLEBARS HELPERS ==========
/**
 * Custom helpers for use in templates
 * These make templates more expressive and reduce logic in templates
 */

/**
 * Format currency amounts (KES)
 * Example: {{formatCurrency price}} → "KES 1,500"
 */
handlebars.registerHelper('formatCurrency', (amount) => {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0
  }).format(amount);
});

/**
 * Format dates in various formats
 * Example: {{formatDate createdAt}} → "Monday, March 15, 2024"
 * Example: {{formatDate createdAt 'short'}} → "3/15/2024"
 */
handlebars.registerHelper('formatDate', (date, format = 'long') => {
  const d = new Date(date);
  if (format === 'long') {
    return d.toLocaleDateString('en-KE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
  return d.toLocaleDateString('en-KE');
});

/**
 * Truncate text to a specified length
 * Example: {{truncate description 50}} → "This is a long description that gets cut off..."
 */
handlebars.registerHelper('truncate', (text, length) => {
  if (!text) return '';
  if (text.length <= length) return text;
  return text.substring(0, length) + '...';
});

// ========== COMPARISON HELPERS ==========
// These helpers allow conditional logic in templates
handlebars.registerHelper('eq', (a, b) => a === b);    // Equality check
handlebars.registerHelper('gt', (a, b) => a > b);      // Greater than
handlebars.registerHelper('lt', (a, b) => a < b);      // Less than
handlebars.registerHelper('and', (a, b) => a && b);    // Logical AND
handlebars.registerHelper('or', (a, b) => a || b);     // Logical OR

/**
 * Template Service Class
 * Manages email templates with caching for performance
 * Provides specialized rendering methods for each email type
 */
class TemplateService {
  constructor() {
    this.templates = new Map();  // Cache for compiled templates
    this.templateDir = path.join(__dirname, '../utils/emailTemplates');  // Template directory
  }

  // ========== LOAD TEMPLATE ==========
  /**
   * Load and compile a template, with caching
   * 
   * @param {string} name - Template name (without .hbs extension)
   * @returns {Promise<Function>} Compiled template function
   * @throws {Error} If template not found
   */
  async loadTemplate(name) {
    // Check cache first (performance optimization)
    if (this.templates.has(name)) {
      return this.templates.get(name);
    }

    try {
      // Read template file
      const templatePath = path.join(this.templateDir, `${name}.hbs`);
      const content = await fs.readFile(templatePath, 'utf-8');
      
      // Compile template with Handlebars
      const template = handlebars.compile(content);
      
      // Cache compiled template for future use
      this.templates.set(name, template);
      
      return template;
    } catch (error) {
      console.error(`Failed to load template ${name}:`, error);
      throw new Error(`Template ${name} not found`);
    }
  }

  // ========== RENDER TEMPLATE ==========
  /**
   * Render a template with data
   * Automatically adds common data to all templates
   * 
   * @param {string} name - Template name
   * @param {Object} data - Template-specific data
   * @returns {Promise<string>} Rendered HTML
   */
  async render(name, data = {}) {
    const template = await this.loadTemplate(name);
    
    // Add common data that all templates might need
    const commonData = {
      year: new Date().getFullYear(),
      appName: 'Legacy Wear',
      appUrl: SERVER.FRONTEND_URL,
      supportEmail: 'support@legacywear.com',
      ...data  // Template-specific data overrides common data
    };
    
    return template(commonData);
  }

  // ========== WELCOME TEMPLATE ==========
  /**
   * Render welcome email for new users
   * 
   * @param {Object} user - User object
   * @returns {Promise<string>} Rendered HTML
   */
  async renderWelcome(user) {
    return this.render('welcome', {
      name: user.name,
      email: user.email,
      loginUrl: `${SERVER.FRONTEND_URL}/login`
    });
  }

  // ========== EMAIL VERIFICATION TEMPLATE ==========
  /**
   * Render email verification email
   * 
   * @param {Object} user - User object
   * @param {string} token - Verification token
   * @returns {Promise<string>} Rendered HTML
   */
  async renderEmailVerification(user, token) {
    return this.render('emailVerification', {
      name: user.name,
      verificationUrl: `${SERVER.FRONTEND_URL}/verify-email/${token}`,
      expiryHours: 24  // Token expires in 24 hours
    });
  }

  // ========== PASSWORD RESET TEMPLATE ==========
  /**
   * Render password reset email
   * 
   * @param {Object} user - User object
   * @param {string} token - Reset token
   * @returns {Promise<string>} Rendered HTML
   */
  async renderPasswordReset(user, token) {
    return this.render('passwordReset', {
      name: user.name,
      resetUrl: `${SERVER.FRONTEND_URL}/reset-password/${token}`,
      expiryMinutes: 10  // Token expires in 10 minutes
    });
  }

  // ========== ORDER CONFIRMATION TEMPLATE ==========
  /**
   * Render order confirmation email with order details
   * 
   * @param {Object} user - User object
   * @param {Object} order - Order object
   * @returns {Promise<string>} Rendered HTML
   */
  async renderOrderConfirmation(user, order) {
    return this.render('orderConfirmation', {
      name: user.name,
      orderNumber: order.orderNumber,
      orderDate: new Date(order.createdAt).toLocaleDateString(),
      items: order.items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity
      })),
      subtotal: order.subtotal,
      shipping: order.shippingCost,
      tax: order.taxAmount,
      discount: order.discountAmount,
      total: order.totalAmount,
      orderUrl: `${SERVER.FRONTEND_URL}/orders/${order._id}`
    });
  }

  // ========== SHIPPING UPDATE TEMPLATE ==========
  /**
   * Render shipping status update email
   * 
   * @param {Object} user - User object
   * @param {Object} order - Order object
   * @returns {Promise<string>} Rendered HTML
   */
  async renderShippingUpdate(user, order) {
    // Status messages for different order states
    const statusMessages = {
      pending: 'Your order is being processed.',
      confirmed: 'Your order has been confirmed.',
      processing: 'Your order is being prepared for shipment.',
      shipped: 'Your order has been shipped!',
      delivered: 'Your order has been delivered!',
      cancelled: 'Your order has been cancelled.'
    };

    return this.render('shippingUpdate', {
      name: user.name,
      orderNumber: order.orderNumber,
      status: order.status,
      statusMessage: statusMessages[order.status] || 'Your order status has been updated.',
      trackingNumber: order.trackingNumber,
      trackingUrl: order.trackingUrl || `${SERVER.FRONTEND_URL}/orders/track/${order.orderNumber}`,
      estimatedDelivery: order.estimatedDelivery
    });
  }

  // ========== LOW STOCK ALERT TEMPLATE ==========
  /**
   * Render low stock alert for admins
   * 
   * @param {Object} product - Product object
   * @param {Object} inventory - Inventory object
   * @returns {Promise<string>} Rendered HTML
   */
  async renderLowStockAlert(product, inventory) {
    return this.render('lowStockAlert', {
      productName: product.name,
      sku: inventory.sku,
      currentStock: inventory.availableQuantity,
      reorderPoint: inventory.reorderPoint,
      location: inventory.location,
      productUrl: `${SERVER.FRONTEND_URL}/admin/products/${product._id}`
    });
  }

  // ========== CONTACT FORM TEMPLATE ==========
  /**
   * Render contact form submission email
   * 
   * @param {Object} data - Contact form data
   * @returns {Promise<string>} Rendered HTML
   */
  async renderContactForm(data) {
    return this.render('contactForm', {
      name: data.name,
      email: data.email,
      subject: data.subject,
      message: data.message
    });
  }

  // ========== NEWSLETTER CONFIRMATION TEMPLATE ==========
  /**
   * Render newsletter subscription confirmation
   * 
   * @param {string} email - Subscriber email
   * @returns {Promise<string>} Rendered HTML
   */
  async renderNewsletterConfirmation(email) {
    return this.render('newsletterConfirmation', {
      email,
      unsubscribeUrl: `${SERVER.FRONTEND_URL}/newsletter/unsubscribe?email=${encodeURIComponent(email)}`
    });
  }

  // ========== CLEAR TEMPLATE CACHE ==========
  /**
   * Clear all cached templates
   * Useful during development or after template changes
   */
  clearCache() {
    this.templates.clear();
  }

  // ========== RELOAD TEMPLATE ==========
  /**
   * Reload a specific template (clear cache and reload)
   * 
   * @param {string} name - Template name
   * @returns {Promise<Function>} Freshly compiled template
   */
  async reloadTemplate(name) {
    this.templates.delete(name);
    return this.loadTemplate(name);
  }
}

module.exports = new TemplateService();