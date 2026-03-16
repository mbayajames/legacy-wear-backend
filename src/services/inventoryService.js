// services/inventoryService.js
// Inventory service - comprehensive service for all inventory management operations
// Handles stock checking, reservation, fulfillment, alerts, and valuation

const Inventory = require('../models/Inventory');           // Inventory model
const Product = require('../models/Product');               // Product model
const AppError = require('../utils/AppError');              // Custom error class
const { sendLowStockAlertEmail } = require('./emailService'); // Email notifications

/**
 * Inventory Service Class
 * Provides a clean abstraction over inventory operations
 * Handles all stock-related business logic with error handling
 */
class InventoryService {
  // ========== CHECK STOCK AVAILABILITY ==========
  /**
   * Check if a product has sufficient available stock
   * 
   * @param {string} productId - Product ID
   * @param {number} quantity - Requested quantity
   * @returns {Promise<boolean>} True if stock is sufficient
   * @throws {AppError} If inventory not found
   */
  async checkStock(productId, quantity) {
    const inventory = await Inventory.findOne({ product: productId });
    
    if (!inventory) {
      throw new AppError('Inventory not found for this product', 404);
    }
    
    return inventory.availableQuantity >= quantity;
  }

  // ========== RESERVE STOCK ==========
  /**
   * Reserve stock for an order
   * Prevents overselling by locking items
   * 
   * @param {string} productId - Product ID
   * @param {number} quantity - Quantity to reserve
   * @param {string} orderId - Order ID (for tracking)
   * @returns {Promise<Object>} Updated inventory
   * @throws {AppError} If insufficient stock or inventory not found
   */
  async reserveStock(productId, quantity, orderId) {
    const inventory = await Inventory.findOne({ product: productId });
    
    if (!inventory) {
      throw new AppError('Inventory not found', 404);
    }
    
    if (inventory.availableQuantity < quantity) {
      throw new AppError('Insufficient stock', 400);
    }
    
    await inventory.reserveStock(quantity, orderId);
    
    return inventory;
  }

  // ========== RELEASE STOCK ==========
  /**
   * Release reserved stock (e.g., order cancelled)
   * 
   * @param {string} productId - Product ID
   * @param {number} quantity - Quantity to release
   * @param {string} orderId - Order ID
   * @returns {Promise<Object>} Updated inventory
   */
  async releaseStock(productId, quantity, orderId) {
    const inventory = await Inventory.findOne({ product: productId });
    
    if (!inventory) {
      throw new AppError('Inventory not found', 404);
    }
    
    await inventory.releaseStock(quantity, orderId);
    
    return inventory;
  }

  // ========== FULFILL RESERVED STOCK ==========
  /**
   * Fulfill reserved stock (order shipped)
   * Deducts from actual inventory and updates product sold count
   * 
   * @param {string} productId - Product ID
   * @param {number} quantity - Quantity to fulfill
   * @param {string} orderId - Order ID
   * @returns {Promise<Object>} Updated inventory
   */
  async fulfillStock(productId, quantity, orderId) {
    const inventory = await Inventory.findOne({ product: productId });
    
    if (!inventory) {
      throw new AppError('Inventory not found', 404);
    }
    
    await inventory.fulfillReserved(quantity, orderId);
    
    // Update product document (denormalized stock field)
    await Product.findByIdAndUpdate(productId, {
      stock: inventory.quantity,           // Update current stock
      $inc: { soldCount: quantity }         // Increment sold count
    });
    
    // Check if stock is now below reorder point
    if (inventory.needsReorder) {
      await this.triggerLowStockAlert(productId, inventory);
    }
    
    return inventory;
  }

  // ========== ADJUST STOCK ==========
  /**
   * Manual stock adjustment (e.g., receiving new stock, damaged items)
   * 
   * @param {string} productId - Product ID
   * @param {number} quantity - Change in quantity (positive or negative)
   * @param {string} type - Adjustment type (received, damaged, adjusted)
   * @param {string} note - Optional note
   * @param {string} userId - User making adjustment
   * @returns {Promise<Object>} Updated inventory
   */
  async adjustStock(productId, quantity, type, note, userId) {
    const inventory = await Inventory.findOne({ product: productId });
    
    if (!inventory) {
      throw new AppError('Inventory not found', 404);
    }
    
    await inventory.adjustStock(quantity, type, null, note, userId);
    
    // Update product stock
    await Product.findByIdAndUpdate(productId, {
      stock: inventory.quantity
    });
    
    return inventory;
  }

  // ========== TRIGGER LOW STOCK ALERT ==========
  /**
   * Send low stock alerts to admins
   * Prevents duplicate alerts for the same low stock condition
   * 
   * @param {string} productId - Product ID
   * @param {Object} inventory - Inventory object (optional)
   */
  async triggerLowStockAlert(productId, inventory = null) {
    if (!inventory) {
      inventory = await Inventory.findOne({ product: productId });
    }
    
    // Only send if stock is low and alert hasn't been sent
    if (!inventory || !inventory.needsReorder) return;
    
    // Mark alert as sent to prevent spam
    inventory.lowStockAlertSent = true;
    inventory.lastAlertSentAt = new Date();
    await inventory.save();
    
    // Get product details for email
    const product = await Product.findById(productId).select('name');
    
    // Send email alert
    try {
      await sendLowStockAlertEmail(product, inventory);
    } catch (error) {
      console.error('Failed to send low stock alert:', error);
    }
    
    // TODO: Also trigger other notifications (SMS, Slack, push notifications)
  }

  // ========== GET INVENTORY STATUS ==========
  /**
   * Get human-readable inventory status
   * 
   * @param {string} productId - Product ID
   * @returns {Promise<Object>} Status object
   */
  async getInventoryStatus(productId) {
    const inventory = await Inventory.findOne({ product: productId });
    
    if (!inventory) {
      return {
        exists: false,
        status: 'unknown'
      };
    }
    
    return {
      exists: true,
      quantity: inventory.quantity,
      reserved: inventory.reservedQuantity,
      available: inventory.availableQuantity,
      // Determine stock status
      status: inventory.availableQuantity <= 0 ? 'out_of_stock' :
              inventory.availableQuantity <= inventory.reorderPoint ? 'low_stock' : 'in_stock',
      reorderPoint: inventory.reorderPoint
    };
  }

  // ========== BULK CHECK STOCK ==========
  /**
   * Check stock for multiple products at once
   * Used during checkout to validate entire cart
   * 
   * @param {Array} items - Array of items with product IDs and quantities
   * @returns {Promise<Object>} Stock status for each product
   */
  async bulkCheckStock(items) {
    // Extract all product IDs
    const productIds = items.map(item => item.productId || item.product);
    
    // Get inventory for all products
    const inventories = await Inventory.find({ 
      product: { $in: productIds } 
    }).populate('product', 'name');
    
    // Build results object
    const results = {};
    inventories.forEach(inv => {
      const productId = inv.product._id.toString();
      const requestedItem = items.find(item => 
        (item.productId || item.product).toString() === productId
      );
      
      results[productId] = {
        product: inv.product,
        available: inv.availableQuantity,
        requested: requestedItem?.quantity || 0,
        sufficient: inv.availableQuantity >= (requestedItem?.quantity || 0),
        status: inv.availableQuantity <= 0 ? 'out_of_stock' :
                inv.availableQuantity <= inv.reorderPoint ? 'low_stock' : 'in_stock'
      };
    });
    
    return results;
  }

  // ========== GET LOW STOCK PRODUCTS ==========
  /**
   * Get all products with stock below threshold
   * 
   * @param {number} threshold - Custom threshold (uses reorderPoint if not provided)
   * @returns {Promise<Array>} Low stock products
   */
  async getLowStockProducts(threshold = null) {
    // Build query based on threshold
    const query = threshold 
      ? { $expr: { $lte: ['$availableQuantity', threshold] } }
      : { $expr: { $lte: ['$availableQuantity', '$reorderPoint'] } };
    
    return await Inventory.find(query)
      .populate('product', 'name price category')
      .sort('availableQuantity');  // Lowest stock first
  }

  // ========== GET OUT OF STOCK PRODUCTS ==========
  /**
   * Get all out of stock products
   * 
   * @returns {Promise<Array>} Out of stock products
   */
  async getOutOfStockProducts() {
    return await Inventory.find({ availableQuantity: { $lte: 0 } })
      .populate('product', 'name price category');
  }

  // ========== GET INVENTORY VALUATION ==========
  /**
   * Calculate total inventory value by category
   * Uses aggregation pipeline for efficient calculation
   * 
   * @returns {Promise<Object>} Inventory valuation by category
   */
  async getInventoryValuation() {
    // Aggregation pipeline to calculate inventory value by category
    const result = await Inventory.aggregate([
      {
        $lookup: {
          from: 'products',
          localField: 'product',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $group: {
          _id: '$product.category',  // Group by category
          totalProducts: { $sum: 1 },  // Number of products in category
          totalQuantity: { $sum: '$quantity' },  // Total units
          totalValue: { 
            $sum: { $multiply: ['$product.price', '$quantity'] }  // Value = price × quantity
          },
          products: { $push: '$$ROOT' }  // Keep product details
        }
      },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'category'
        }
      },
      { $unwind: '$category' }
    ]);
    
    // Calculate overall totals
    const totalValue = result.reduce((sum, cat) => sum + cat.totalValue, 0);
    
    return {
      categories: result,  // Breakdown by category
      totalValue,           // Total inventory value
      totalProducts: result.reduce((sum, cat) => sum + cat.totalProducts, 0),  // Total products
      totalQuantity: result.reduce((sum, cat) => sum + cat.totalQuantity, 0)  // Total units
    };
  }
}

module.exports = new InventoryService();