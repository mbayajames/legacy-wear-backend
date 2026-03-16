// services/emailService.js
// Email service - handles all email sending operations using Nodemailer and Handlebars templates
// Provides various email templates for different scenarios (welcome, verification, orders, alerts)

const nodemailer = require('nodemailer');           // Email sending library
const handlebars = require('handlebars');           // Template engine for emails
const fs = require('fs').promises;                  // File system operations (promise version)
const path = require('path');                        // Path manipulation
const { EMAIL, SERVER } = require('../config/key'); // Email configuration
const AppError = require('../utils/AppError');      // Custom error class

// ========== EMAIL TRANSPORTER ==========
// Singleton pattern - only one transporter instance
let transporter = null;

/**
 * Get or create email transporter
 * Uses singleton pattern to reuse connection
 */
const getTransporter = () => {
  if (transporter) return transporter;
  
  // Create transporter using config from key.js
  transporter = nodemailer.createTransport(EMAIL.getTransporterConfig());
  
  // Verify connection if using real email credentials
  if (EMAIL.USERNAME && EMAIL.PASSWORD) {
    transporter.verify((error, success) => {
      if (error) {
        console.error('❌ Email transporter verification failed:', error);
      } else {
        console.log('✅ Email transporter ready');
      }
    });
  }
  
  return transporter;
};

// ========== LOAD AND COMPILE TEMPLATE ==========
/**
 * Load Handlebars template from file and compile with data
 * Falls back to basic HTML if template not found
 * 
 * @param {string} templateName - Name of template file (without .hbs)
 * @param {Object} data - Data to inject into template
 * @returns {Promise<string>} Rendered HTML
 */
const loadTemplate = async (templateName, data) => {
  try {
    // Construct path to template file
    const templatePath = path.join(__dirname, '../utils/emailTemplates', `${templateName}.hbs`);
    // Read template file
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    // Compile template with Handlebars
    const template = handlebars.compile(templateContent);
    // Render with data
    return template(data);
  } catch (error) {
    // Log error but don't crash - provide fallback
    console.error(`Failed to load email template ${templateName}:`, error);
    // Basic fallback HTML
    return `
      <h1>${data.title || 'Legacy Wear'}</h1>
      <p>${data.message || 'No message provided'}</p>
    `;
  }
};

// ========== BASE EMAIL SENDER ==========
/**
 * Core email sending function
 * All other email functions use this
 * 
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} options.text - Plain text content (optional)
 * @param {Array} options.attachments - File attachments (optional)
 * @returns {Promise<Object>} Nodemailer info object
 */
const sendEmail = async (options) => {
  try {
    const transporter = getTransporter();
    
    const mailOptions = {
      from: EMAIL.FROM,                 // Sender from config
      to: options.to,                    // Recipient
      subject: options.subject,           // Subject line
      text: options.text,                 // Plain text version
      html: options.html,                 // HTML version
      attachments: options.attachments || [] // Attachments
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    // If using ethereal.email (test), log preview URL
    if (!EMAIL.USERNAME || !EMAIL.PASSWORD) {
      console.log('📧 Email preview URL:', nodemailer.getTestMessageUrl(info));
    }
    
    return info;
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    throw new AppError('Failed to send email', 500);
  }
};

// ========== WELCOME EMAIL ==========
/**
 * Send welcome email to new users
 * @param {Object} user - User object
 */
const sendWelcomeEmail = async (user) => {
  const html = await loadTemplate('welcome', {
    name: user.name,
    email: user.email,
    loginUrl: `${SERVER.FRONTEND_URL}/login`,
    year: new Date().getFullYear()
  });
  
  return sendEmail({
    to: user.email,
    subject: 'Welcome to Legacy Wear!',
    html
  });
};

// ========== EMAIL VERIFICATION ==========
/**
 * Send email verification link
 * @param {Object} user - User object
 * @param {string} token - Verification token
 */
const sendEmailVerificationEmail = async (user, token) => {
  const verificationUrl = `${SERVER.FRONTEND_URL}/verify-email/${token}`;
  
  const html = await loadTemplate('emailVerification', {
    name: user.name,
    verificationUrl,
    expiryHours: 24,  // Token expires in 24 hours
    year: new Date().getFullYear()
  });
  
  return sendEmail({
    to: user.email,
    subject: 'Verify Your Email - Legacy Wear',
    html
  });
};

// ========== PASSWORD RESET EMAIL ==========
/**
 * Send password reset link
 * @param {Object} user - User object
 * @param {string} token - Reset token
 */
const sendPasswordResetEmail = async (user, token) => {
  const resetUrl = `${SERVER.FRONTEND_URL}/reset-password/${token}`;
  
  const html = await loadTemplate('passwordReset', {
    name: user.name,
    resetUrl,
    expiryMinutes: 10,  // Token expires in 10 minutes
    year: new Date().getFullYear()
  });
  
  return sendEmail({
    to: user.email,
    subject: 'Password Reset Request - Legacy Wear',
    html
  });
};

// ========== ORDER CONFIRMATION EMAIL ==========
/**
 * Send order confirmation with details
 * @param {Object} user - User object
 * @param {Object} order - Order object
 */
const sendOrderConfirmationEmail = async (user, order) => {
  const orderUrl = `${SERVER.FRONTEND_URL}/orders/${order._id}`;
  
  const html = await loadTemplate('orderConfirmation', {
    name: user.name,
    orderNumber: order.orderNumber,
    orderDate: new Date(order.createdAt).toLocaleDateString(),
    items: order.items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price.toLocaleString(),
      total: (item.price * item.quantity).toLocaleString()
    })),
    subtotal: order.subtotal.toLocaleString(),
    shipping: order.shippingCost.toLocaleString(),
    tax: order.taxAmount.toLocaleString(),
    discount: order.discountAmount.toLocaleString(),
    total: order.totalAmount.toLocaleString(),
    orderUrl,
    year: new Date().getFullYear()
  });
  
  return sendEmail({
    to: user.email,
    subject: `Order Confirmation #${order.orderNumber} - Legacy Wear`,
    html
  });
};

// ========== SHIPPING UPDATE EMAIL ==========
/**
 * Send shipping status update
 * @param {Object} order - Order object
 */
const sendShippingUpdateEmail = async (order) => {
  // Get user details
  const user = await require('../models/User').findById(order.user);
  
  // Create tracking URL (either provided or order tracking page)
  const trackingUrl = order.trackingUrl || `${SERVER.FRONTEND_URL}/orders/track/${order.orderNumber}`;
  
  // Status messages for different order states
  const statusMessages = {
    pending: 'Your order is being processed.',
    confirmed: 'Your order has been confirmed.',
    processing: 'Your order is being prepared for shipment.',
    shipped: 'Your order has been shipped!',
    delivered: 'Your order has been delivered!',
    cancelled: 'Your order has been cancelled.'
  };
  
  const html = await loadTemplate('shippingUpdate', {
    name: user.name,
    orderNumber: order.orderNumber,
    status: order.status,
    statusMessage: statusMessages[order.status] || 'Your order status has been updated.',
    trackingNumber: order.trackingNumber,
    trackingUrl,
    estimatedDelivery: order.estimatedDelivery ? new Date(order.estimatedDelivery).toLocaleDateString() : 'Not available',
    year: new Date().getFullYear()
  });
  
  return sendEmail({
    to: user.email,
    subject: `Order Update #${order.orderNumber} - Legacy Wear`,
    html
  });
};

// ========== LOW STOCK ALERT EMAIL ==========
/**
 * Send low stock alert to admins
 * @param {Object} product - Product object
 * @param {Object} inventory - Inventory object
 */
const sendLowStockAlertEmail = async (product, inventory) => {
  // Get admin emails from env or use default
  const adminEmails = process.env.ADMIN_EMAILS?.split(',') || ['admin@legacywear.com'];
  
  const html = await loadTemplate('lowStockAlert', {
    productName: product.name,
    sku: inventory.sku,
    currentStock: inventory.availableQuantity,
    reorderPoint: inventory.reorderPoint,
    location: inventory.location,
    productUrl: `${SERVER.FRONTEND_URL}/admin/products/${product._id}`,
    year: new Date().getFullYear()
  });
  
  return sendEmail({
    to: adminEmails,
    subject: `⚠️ Low Stock Alert: ${product.name}`,
    html
  });
};

// ========== CONTACT FORM EMAIL ==========
/**
 * Send contact form submission to admin
 * @param {Object} data - Form data { name, email, subject, message }
 */
const sendContactFormEmail = async (data) => {
  const { name, email, subject, message } = data;
  
  const html = await loadTemplate('contactForm', {
    name,
    email,
    subject,
    message,
    year: new Date().getFullYear()
  });
  
  return sendEmail({
    to: process.env.CONTACT_EMAIL || 'contact@legacywear.com',
    replyTo: email,  // So admin can reply directly to user
    subject: `Contact Form: ${subject}`,
    html
  });
};

// ========== NEWSLETTER CONFIRMATION EMAIL ==========
/**
 * Send newsletter subscription confirmation
 * @param {string} email - Subscriber email
 */
const sendNewsletterConfirmationEmail = async (email) => {
  const unsubscribeUrl = `${SERVER.FRONTEND_URL}/newsletter/unsubscribe?email=${encodeURIComponent(email)}`;
  
  const html = await loadTemplate('newsletterConfirmation', {
    email,
    unsubscribeUrl,
    year: new Date().getFullYear()
  });
  
  return sendEmail({
    to: email,
    subject: 'Newsletter Subscription Confirmed - Legacy Wear',
    html
  });
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  sendShippingUpdateEmail,
  sendLowStockAlertEmail,
  sendContactFormEmail,
  sendNewsletterConfirmationEmail
};