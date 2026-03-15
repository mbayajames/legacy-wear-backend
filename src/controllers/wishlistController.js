// controllers/wishlistController.js
// Wishlist controller - handles all wishlist operations for users
// Includes adding/removing items, alerts for price drops/restocks, and sharing functionality

const Wishlist = require('../models/Wishlist');       // Wishlist model for database operations
const Product = require('../models/Product');         // Product model for product validation
const AppError = require('../utils/AppError');        // Custom error class
const catchAsync = require('../utils/catchAsync');    // Async error wrapper

// ========== GET WISHLIST ==========
/**
 * Get user's wishlist (creates one if it doesn't exist)
 * GET /api/wishlist
 * (Protected route - user must be logged in)
 */
exports.getWishlist = catchAsync(async (req, res) => {
  // Find user's wishlist and populate product details
  let wishlist = await Wishlist.findOne({ user: req.user.id })
    .populate('items.product', 'name price images stock slug ratingsAverage');
  
  // Create wishlist if it doesn't exist
  if (!wishlist) {
    wishlist = await Wishlist.create({ 
      user: req.user.id,
      name: 'My Wishlist'  // Default name
    });
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      wishlist,
      itemCount: wishlist.itemCount  // Virtual property
    }
  });
});

// ========== ADD TO WISHLIST ==========
/**
 * Add a product to user's wishlist
 * POST /api/wishlist/add
 * Body: { productId, variant: { size, color } }
 * (Protected route)
 */
exports.addToWishlist = catchAsync(async (req, res, next) => {
  const { productId, variant = {} } = req.body;
  
  // ===== 1. VALIDATE PRODUCT EXISTS =====
  const product = await Product.findById(productId);
  if (!product) {
    return next(new AppError('Product not found', 404));
  }
  
  // ===== 2. GET OR CREATE WISHLIST =====
  let wishlist = await Wishlist.findOne({ user: req.user.id });
  
  if (!wishlist) {
    wishlist = await Wishlist.create({ user: req.user.id });
  }
  
  // ===== 3. CHECK FOR DUPLICATE =====
  // Prevent adding the same product+variant twice
  const existingItem = wishlist.items.find(item => 
    item.product.toString() === productId &&
    item.variant?.size === variant.size &&
    item.variant?.color === variant.color
  );
  
  if (existingItem) {
    return next(new AppError('Product already in wishlist', 400));
  }
  
  // ===== 4. ADD TO WISHLIST =====
  await wishlist.addItem(productId, variant);
  
  // Populate product details for response
  await wishlist.populate('items.product', 'name price images stock slug');
  
  res.status(200).json({
    status: 'success',
    data: {
      wishlist,
      itemCount: wishlist.itemCount
    }
  });
});

// ========== REMOVE FROM WISHLIST ==========
/**
 * Remove a product from user's wishlist
 * DELETE /api/wishlist/item/:productId
 * Body: { variant } (optional - to remove specific variant)
 * (Protected route)
 */
exports.removeFromWishlist = catchAsync(async (req, res, next) => {
  const { productId } = req.params;
  const { variant } = req.body;
  
  const wishlist = await Wishlist.findOne({ user: req.user.id });
  
  if (!wishlist) {
    return next(new AppError('Wishlist not found', 404));
  }
  
  // Remove the item
  await wishlist.removeItem(productId, variant);
  
  // Populate product details for response
  await wishlist.populate('items.product', 'name price images stock slug');
  
  res.status(200).json({
    status: 'success',
    data: {
      wishlist,
      itemCount: wishlist.itemCount
    }
  });
});

// ========== CLEAR WISHLIST ==========
/**
 * Remove all items from wishlist
 * DELETE /api/wishlist/clear
 * (Protected route)
 */
exports.clearWishlist = catchAsync(async (req, res, next) => {
  const wishlist = await Wishlist.findOne({ user: req.user.id });
  
  if (!wishlist) {
    return next(new AppError('Wishlist not found', 404));
  }
  
  await wishlist.clearWishlist();
  
  res.status(200).json({
    status: 'success',
    data: {
      wishlist,
      itemCount: 0
    }
  });
});

// ========== CHECK IF IN WISHLIST ==========
/**
 * Check if a specific product is in user's wishlist
 * GET /api/wishlist/check/:productId
 * Returns boolean and item ID if found
 * (Protected route)
 */
exports.checkInWishlist = catchAsync(async (req, res) => {
  const { productId } = req.params;
  
  const wishlist = await Wishlist.findOne({ user: req.user.id });
  
  let inWishlist = false;
  let wishlistItemId = null;
  
  if (wishlist) {
    const item = wishlist.items.find(item => 
      item.product.toString() === productId
    );
    
    if (item) {
      inWishlist = true;
      wishlistItemId = item._id;  // ID of the wishlist item (for removal)
    }
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      inWishlist,
      wishlistItemId
    }
  });
});

// ========== SET PRICE DROP ALERT ==========
/**
 * Enable/disable price drop notifications for a wishlist item
 * PATCH /api/wishlist/alert/price/:productId
 * Body: { enabled: boolean }
 * (Protected route)
 */
exports.setPriceDropAlert = catchAsync(async (req, res, next) => {
  const { productId } = req.params;
  const { enabled } = req.body;
  
  const wishlist = await Wishlist.findOne({ user: req.user.id });
  
  if (!wishlist) {
    return next(new AppError('Wishlist not found', 404));
  }
  
  // Find the specific item
  const item = wishlist.items.find(item => 
    item.product.toString() === productId
  );
  
  if (!item) {
    return next(new AppError('Product not in wishlist', 404));
  }
  
  // Update notification preference
  item.notifyOnPriceDrop = enabled;
  await wishlist.save();
  
  res.status(200).json({
    status: 'success',
    message: `Price drop alert ${enabled ? 'enabled' : 'disabled'}`
  });
});

// ========== SET RESTOCK ALERT ==========
/**
 * Enable/disable restock notifications for a wishlist item
 * PATCH /api/wishlist/alert/restock/:productId
 * Body: { enabled: boolean }
 * (Protected route)
 */
exports.setRestockAlert = catchAsync(async (req, res, next) => {
  const { productId } = req.params;
  const { enabled } = req.body;
  
  const wishlist = await Wishlist.findOne({ user: req.user.id });
  
  if (!wishlist) {
    return next(new AppError('Wishlist not found', 404));
  }
  
  const item = wishlist.items.find(item => 
    item.product.toString() === productId
  );
  
  if (!item) {
    return next(new AppError('Product not in wishlist', 404));
  }
  
  item.notifyOnRestock = enabled;
  await wishlist.save();
  
  res.status(200).json({
    status: 'success',
    message: `Restock alert ${enabled ? 'enabled' : 'disabled'}`
  });
});

// ========== GENERATE SHARE TOKEN ==========
/**
 * Generate a shareable token for public wishlist
 * POST /api/wishlist/share/generate
 * (Protected route)
 */
exports.generateShareToken = catchAsync(async (req, res, next) => {
  const wishlist = await Wishlist.findOne({ user: req.user.id });
  
  if (!wishlist) {
    return next(new AppError('Wishlist not found', 404));
  }
  
  // Generate random token and set wishlist to public
  const token = wishlist.generateShareToken();
  wishlist.isPublic = true;  // Make public when sharing
  await wishlist.save();
  
  // Create full shareable URL
  const shareUrl = `${process.env.FRONTEND_URL}/wishlist/shared/${token}`;
  
  res.status(200).json({
    status: 'success',
    data: {
      shareToken: token,
      shareUrl
    }
  });
});

// ========== GET SHARED WISHLIST ==========
/**
 * View a public wishlist by share token
 * GET /api/wishlist/shared/:token
 * (Public route - no auth required)
 */
exports.getSharedWishlist = catchAsync(async (req, res, next) => {
  const { token } = req.params;
  
  // Find public wishlist with this token
  const wishlist = await Wishlist.findOne({ 
    shareToken: token,
    isPublic: true  // Must be public
  }).populate('items.product', 'name price images stock slug ratingsAverage')
    .populate('user', 'name');  // Include owner's name
  
  if (!wishlist) {
    return next(new AppError('Wishlist not found or not public', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      wishlist: {
        user: wishlist.user.name,      // Wishlist owner's name
        items: wishlist.items,          // Products in wishlist
        itemCount: wishlist.itemCount,  // Number of items
        createdAt: wishlist.createdAt   // When wishlist was created
      }
    }
  });
});

// ========== TOGGLE PUBLIC STATUS ==========
/**
 * Make wishlist public or private
 * PATCH /api/wishlist/public
 * Body: { isPublic: boolean }
 * (Protected route)
 */
exports.togglePublicStatus = catchAsync(async (req, res, next) => {
  const { isPublic } = req.body;
  
  const wishlist = await Wishlist.findOne({ user: req.user.id });
  
  if (!wishlist) {
    return next(new AppError('Wishlist not found', 404));
  }
  
  wishlist.isPublic = isPublic;
  
  // Remove share token if making private
  if (!isPublic) {
    wishlist.shareToken = undefined;
  }
  
  await wishlist.save();
  
  res.status(200).json({
    status: 'success',
    data: { isPublic: wishlist.isPublic }
  });
});