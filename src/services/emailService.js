const sendEmail = require('../utils/sendEmail');

class EmailService {
  // Welcome email
  static async sendWelcomeEmail(user, verificationUrl) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
          .content { background: #f9f9f9; padding: 30px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Legacy Wear!</h1>
          </div>
          <div class="content">
            <p>Hi ${user.name},</p>
            <p>Thank you for joining Legacy Wear - your destination for timeless fashion.</p>
            <p>To get started, please verify your email address by clicking the button below:</p>
            <p style="text-align: center;">
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #667eea;">${verificationUrl}</p>
            <p>This link will expire in 24 hours.</p>
            <p>If you didn't create an account with Legacy Wear, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Legacy Wear. All rights reserved.</p>
            <p>Need help? Contact us at support@legacywear.com</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmail({
      email: user.email,
      subject: 'Welcome to Legacy Wear - Verify Your Email',
      html,
    });
  }

  // Password reset email
  static async sendPasswordResetEmail(user, resetUrl) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
          .content { background: #f9f9f9; padding: 30px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <p>Hi ${user.name},</p>
            <p>We received a request to reset your password for your Legacy Wear account.</p>
            <p>Click the button below to reset your password:</p>
            <p style="text-align: center;">
              <a href="${resetUrl}" class="button">Reset Password</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #667eea;">${resetUrl}</p>
            <div class="warning">
              <strong>⚠️ Security Notice:</strong>
              <ul>
                <li>This link will expire in 10 minutes</li>
                <li>If you didn't request this, please ignore this email</li>
                <li>Your password won't change until you create a new one</li>
              </ul>
            </div>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Legacy Wear. All rights reserved.</p>
            <p>This is an automated email, please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmail({
      email: user.email,
      subject: 'Password Reset Request - Legacy Wear',
      html,
    });
  }

  // Order confirmation email
  static async sendOrderConfirmationEmail(user, order) {
    const itemsList = order.orderItems
      .map(
        (item) =>
          `<tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${item.name}</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity}</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: right;">KES ${item.price.toLocaleString()}</td>
          </tr>`
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
          .content { background: #f9f9f9; padding: 30px; }
          .order-details { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          .total { font-size: 18px; font-weight: bold; color: #667eea; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Order Confirmed!</h1>
            <p>Thank you for your purchase</p>
          </div>
          <div class="content">
            <p>Hi ${user.name},</p>
            <p>Your order has been confirmed and will be shipped soon.</p>
            
            <div class="order-details">
              <h2>Order #${order.orderNumber}</h2>
              <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
              
              <h3>Items Ordered:</h3>
              <table>
                <thead>
                  <tr style="background: #f5f5f5;">
                    <th style="padding: 10px; text-align: left;">Item</th>
                    <th style="padding: 10px; text-align: center;">Qty</th>
                    <th style="padding: 10px; text-align: right;">Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsList}
                </tbody>
              </table>
              
              <table style="margin-top: 20px;">
                <tr>
                  <td>Subtotal:</td>
                  <td style="text-align: right;">KES ${order.itemsPrice.toLocaleString()}</td>
                </tr>
                <tr>
                  <td>Tax:</td>
                  <td style="text-align: right;">KES ${order.taxPrice.toLocaleString()}</td>
                </tr>
                <tr>
                  <td>Shipping:</td>
                  <td style="text-align: right;">KES ${order.shippingPrice.toLocaleString()}</td>
                </tr>
                <tr class="total">
                  <td>Total:</td>
                  <td style="text-align: right;">KES ${order.totalPrice.toLocaleString()}</td>
                </tr>
              </table>

              <h3>Shipping Address:</h3>
              <p>
                ${order.shippingAddress.fullName}<br>
                ${order.shippingAddress.addressLine1}<br>
                ${order.shippingAddress.addressLine2 ? order.shippingAddress.addressLine2 + '<br>' : ''}
                ${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.postalCode}<br>
                ${order.shippingAddress.country}<br>
                Phone: ${order.shippingAddress.phoneNumber}
              </p>
            </div>

            <p>We'll send you a shipping confirmation email once your order is on its way.</p>
            <p>Track your order anytime by logging into your account.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Legacy Wear. All rights reserved.</p>
            <p>Questions? Contact us at support@legacywear.com</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmail({
      email: user.email,
      subject: `Order Confirmation - ${order.orderNumber}`,
      html,
    });
  }

  // Order shipped notification
  static async sendOrderShippedEmail(user, order) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
          .content { background: #f9f9f9; padding: 30px; }
          .tracking-box { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; text-align: center; }
          .tracking-number { font-size: 24px; font-weight: bold; color: #667eea; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Your Order is on the Way! 📦</h1>
          </div>
          <div class="content">
            <p>Hi ${user.name},</p>
            <p>Great news! Your order #${order.orderNumber} has been shipped.</p>
            
            <div class="tracking-box">
              <p><strong>Tracking Number:</strong></p>
              <div class="tracking-number">${order.trackingNumber}</div>
              <p><strong>Carrier:</strong> ${order.carrier}</p>
              ${order.estimatedDelivery ? `<p><strong>Estimated Delivery:</strong> ${new Date(order.estimatedDelivery).toLocaleDateString()}</p>` : ''}
            </div>

            <p>You can track your package using the tracking number above on the carrier's website.</p>
            <p>We'll notify you once your package is delivered.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Legacy Wear. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmail({
      email: user.email,
      subject: `Your Order Has Been Shipped - ${order.orderNumber}`,
      html,
    });
  }
}

module.exports = EmailService;