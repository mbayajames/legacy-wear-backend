// controllers/cartController.js
// Shopping cart controller - handles all cart operations for both authenticated and guest users
// Supports adding, updating, removing items, coupon application, and cart merging after login

const Cart = require('../models/Cart');           // Cart model for database operations
const Product = require('../models/Product');      // Product model for stock validation
const AppError = require('../utils/AppError');     // Custom error class
const catchAsync = require('../utils/catchAsync'); // Wrapper to catch async errors

// ========== GET CART ==========
/**
 * Get current user's cart (creates one if doesn't exist)
 * Supports both authenticated users (by user ID) and guests (by session ID)
 * GET /api/cart
 */
exports.getCart = catchAsync(async (req, res) => {
  let cart;
  
  if (req.user) {
    // ===== LOGGED IN USER =====
    // Find cart by user ID
    cart = await Cart.findOne({ user: req.user.id })
      .populate('items.product', 'name price images stock slug'); // Populate product details
    
    // Create cart if it doesn't exist
    if (!cart) {
      cart = await Cart.create({ user: req.user.id });
    }
  } else {
    // ===== GUEST USER =====
    // Use session ID from express-session
    const sessionId = req.session.id;
    cart = await Cart.findOne({ sessionId })
      .populate('items.product', 'name price images stock slug');
    
    // Create guest cart if it doesn't exist
    if (!cart) {
      cart = await Cart.create({ sessionId });
    }
  }
  
  // Return cart with calculated totals
  res.status(200).json({
    status: 'success',
    data: {
      cart,
      subtotal: cart.subtotal,      // Sum of (price × quantity)
      total: cart.total,             // Subtotal minus discounts
      itemCount: cart.itemCount       // Total number of items (sum of quantities)
    }
  });
});

// ========== ADD TO CART ==========
/**
 * Add item to cart (or increment quantity if already exists)
 * POST /api/cart/add
 * Body: { productId, quantity, variant: { size, color } }
 */
exports.addToCart = catchAsync(async (req, res, next) => {
  const { productId, quantity = 1, variant = {} } = req.body;
  
  // ===== VALIDATE PRODUCT =====
  const product = await Product.findById(productId);
  if (!product || product.status !== 'active') {
    return next(new AppError('Product not found or unavailable', 404));
  }
  
  // ===== CHECK STOCK AVAILABILITY =====
  if (product.stock < quantity) {
    return next(new AppError(`Only ${product.stock} items available`, 400));
  }
  
  // ===== FIND OR CREATE CART =====
  let cart;
  if (req.user) {
    // Authenticated user
    cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      cart = await Cart.create({ user: req.user.id });
    }
  } else {
    // Guest user
    const sessionId = req.session.id;
    cart = await Cart.findOne({ sessionId });
    if (!cart) {
      cart = await Cart.create({ sessionId });
    }
  }
  
  // ===== ADD ITEM TO CART =====
  // The addItem method handles checking for existing items
  await cart.addItem(productId, quantity, variant);
  
  // ===== POPULATE AND RETURN =====
  await cart.populate('items.product', 'name price images stock slug');
  
  res.status(200).json({
    status: 'success',
    data: {
      cart,
      subtotal: cart.subtotal,
      total: cart.total,
      itemCount: cart.itemCount
    }
  });
});

// ========== UPDATE CART ITEM ==========
/**
 * Update quantity of a specific cart item
 * PATCH /api/cart/item/:itemId
 * Body: { quantity }
 */
exports.updateCartItem = catchAsync(async (req, res, next) => {
  const { itemId } = req.params;
  const { quantity } = req.body;
  
  // ===== VALIDATE QUANTITY =====
  if (quantity < 1) {
    return next(new AppError('Quantity must be at least 1', 400));
  }
  
  // ===== FIND CART =====
  let cart;
  if (req.user) {
    cart = await Cart.findOne({ user: req.user.id });
  } else {
    cart = await Cart.findOne({ sessionId: req.session.id });
  }
  
  if (!cart) {
    return next(new AppError('Cart not found', 404));
  }
  
  // ===== FIND ITEM IN CART =====
  const item = cart.items.id(itemId);  // Mongoose method to find subdocument by _id
  if (!item) {
    return next(new AppError('Item not found in cart', 404));
  }
  
  // ===== CHECK STOCK FOR NEW QUANTITY =====
  const product = await Product.findById(item.product);
  if (product.stock < quantity) {
    return next(new AppError(`Only ${product.stock} items available`, 400));
  }
  
  // ===== UPDATE QUANTITY =====
  await cart.updateItemQuantity(itemId, quantity);
  
  // ===== POPULATE AND RETURN =====
  await cart.populate('items.product', 'name price images stock slug');
  
  res.status(200).json({
    status: 'success',
    data: {
      cart,
      subtotal: cart.subtotal,
      total: cart.total,
      itemCount: cart.itemCount
    }
  });
});

// ========== REMOVE FROM CART ==========
/**
 * Remove item from cart
 * DELETE /api/cart/item/:itemId
 */
exports.removeFromCart = catchAsync(async (req, res, next) => {
  const { itemId } = req.params;
  
  // ===== FIND CART =====
  let cart;
  if (req.user) {
    cart = await Cart.findOne({ user: req.user.id });
  } else {
    cart = await Cart.findOne({ sessionId: req.session.id });
  }
  
  if (!cart) {
    return next(new AppError('Cart not found', 404));
  }
  
  // ===== REMOVE ITEM =====
  await cart.removeItem(itemId);
  
  // ===== POPULATE AND RETURN =====
  await cart.populate('items.product', 'name price images stock slug');
  
  res.status(200).json({
    status: 'success',
    data: {
      cart,
      subtotal: cart.subtotal,
      total: cart.total,
      itemCount: cart.itemCount
    }
  });
});

// ========== CLEAR CART ==========
/**
 * Remove all items from cart
 * DELETE /api/cart/clear
 */
exports.clearCart = catchAsync(async (req, res, next) => {
  // ===== FIND CART =====
  let cart;
  if (req.user) {
    cart = await Cart.findOne({ user: req.user.id });
  } else {
    cart = await Cart.findOne({ sessionId: req.session.id });
  }
  
  if (!cart) {
    return next(new AppError('Cart not found', 404));
  }
  
  // ===== CLEAR ALL ITEMS =====
  await cart.clearCart();
  
  res.status(200).json({
    status: 'success',
    data: {
      cart,
      subtotal: 0,
      total: 0,
      itemCount: 0
    }
  });
});

// ========== APPLY COUPON ==========
/**
 * Apply discount coupon to cart
 * POST /api/cart/apply-coupon
 * Body: { couponCode }
 */
exports.applyCoupon = catchAsync(async (req, res, next) => {
  const { couponCode } = req.body;
  
  // ===== FIND CART =====
  let cart;
  if (req.user) {
    cart = await Cart.findOne({ user: req.user.id });
  } else {
    cart = await Cart.findOne({ sessionId: req.session.id });
  }
  
  if (!cart) {
    return next(new AppError('Cart not found', 404));
  }
  
  // ===== VALIDATE COUPON =====
  // Call helper function to check if coupon is valid
  const coupon = await validateCoupon(couponCode, cart.subtotal);
  
  if (!coupon) {
    return next(new AppError('Invalid or expired coupon', 400));
  }
  
  // ===== APPLY COUPON TO CART =====
  await cart.applyCoupon(coupon);
  
  res.status(200).json({
    status: 'success',
    data: {
      cart,
      discountAmount: cart.discountAmount,
      subtotal: cart.subtotal,
      total: cart.total
    }
  });
});

// ========== REMOVE COUPON ==========
/**
 * Remove applied coupon from cart
 * DELETE /api/cart/remove-coupon
 */
exports.removeCoupon = catchAsync(async (req, res, next) => {
  // ===== FIND CART =====
  let cart;
  if (req.user) {
    cart = await Cart.findOne({ user: req.user.id });
  } else {
    cart = await Cart.findOne({ sessionId: req.session.id });
  }
  
  if (!cart) {
    return next(new AppError('Cart not found', 404));
  }
  
  // ===== REMOVE COUPON =====
  await cart.removeCoupon();
  
  res.status(200).json({
    status: 'success',
    data: {
      cart,
      subtotal: cart.subtotal,
      total: cart.total
    }
  });
});

// ========== MERGE CARTS (after login) ==========
/**
 * Merge guest cart with user cart after login
 * Called when a guest user logs in and has items in their cart
 * POST /api/cart/merge
 */
exports.mergeCarts = catchAsync(async (req, res, next) => {
  const sessionId = req.session.id;
  
  // ===== FIND GUEST CART =====
  const guestCart = await Cart.findOne({ sessionId });
  
  if (guestCart && guestCart.items.length > 0) {
    // Guest has items - merge with user cart
    
    // Find user's existing cart
    let userCart = await Cart.findOne({ user: req.user.id });
    
    if (!userCart) {
      // No user cart exists - transfer guest cart to user
      guestCart.user = req.user.id;
      guestCart.sessionId = undefined;  // Remove session ID (no longer a guest cart)
      await guestCart.save();
      userCart = guestCart;
    } else {
      // Both carts exist - merge items
      for (const guestItem of guestCart.items) {
        // Add each guest item to user cart (addItem handles duplicates)
        await userCart.addItem(
          guestItem.product,
          guestItem.quantity,
          guestItem.variant
        );
      }
      
      // Delete guest cart after merging
      await Cart.deleteOne({ _id: guestCart._id });
    }
    
    // Populate and return merged cart
    await userCart.populate('items.product', 'name price images stock slug');
    
    res.status(200).json({
      status: 'success',
      message: 'Carts merged successfully',
      data: { cart: userCart }
    });
  } else {
    // Guest cart empty - just return user cart
    const userCart = await Cart.findOne({ user: req.user.id })
      .populate('items.product', 'name price images stock slug');
    
    res.status(200).json({
      status: 'success',
      data: { cart: userCart }
    });
  }
});

// ========== HELPER FUNCTIONS ==========
/**
 * Validate coupon code
 * This is a placeholder - implement your actual coupon logic
 * 
 * @param {string} code - Coupon code entered by user
 * @param {number} subtotal - Cart subtotal for minimum purchase validation
 * @returns {Object|null} Coupon object or null if invalid
 */
const validateCoupon = async (code, subtotal) => {
  // TODO: Implement proper coupon validation:
  // - Check if coupon exists in database
  // - Check if not expired
  // - Check minimum purchase requirements
  // - Check usage limits
  // - Check if applicable to products in cart
  
  // Example placeholder logic
  if (code === 'SAVE10' && subtotal >= 1000) {
    return {
      code: 'SAVE10',
      type: 'percentage',  // 'percentage' or 'fixed'
      value: 10            // 10% off
    };
  }
  
  if (code === 'FLAT50' && subtotal >= 2000) {
    return {
      code: 'FLAT50',
      type: 'fixed',
      value: 50            // $50 off
    };
  }
  
  return null;  // Invalid coupon
};