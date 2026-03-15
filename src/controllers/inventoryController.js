// controllers/inventoryController.js
// Inventory controller - manages all inventory operations including stock levels,
// adjustments, movements tracking, and low stock alerts

const Inventory = require('../models/Inventory');        // Inventory model for stock tracking
const Product = require('../models/Product');            // Product model for product validation
const AppError = require('../utils/AppError');           // Custom error class
const catchAsync = require('../utils/catchAsync');       // Async error wrapper
const APIFeatures = require('../utils/apiFeatures');     // Query builder for filtering, sorting, pagination

// ========== GET INVENTORY FOR PRODUCT ==========
/**
 * Get inventory record for a specific product (creates if not exists)
 * GET /api/inventory/product/:productId
 * (Admin only - or staff with inventory access)
 */
exports.getProductInventory = catchAsync(async (req, res, next) => {
  const { productId } = req.params;

  // Try to find existing inventory record
  let inventory = await Inventory.findOne({ product: productId })
    .populate('product', 'name sku price');  // Include product details

  // If no inventory record exists, create one automatically
  if (!inventory) {
    const product = await Product.findById(productId);
    if (!product) {
      return next(new AppError('Product not found', 404));
    }

    // Create inventory with initial values from product
    inventory = await Inventory.create({
      product: productId,
      sku: product.sku || `SKU-${Date.now()}`,  // Generate SKU if missing
      quantity: product.stock || 0                // Use product's current stock
    });
  }

  res.status(200).json({
    status: 'success',
    data: { inventory }
  });
});

// ========== GET ALL INVENTORY ==========
/**
 * Get all inventory records with filtering and pagination
 * GET /api/inventory?page=1&limit=20&sort=-quantity
 * (Admin only)
 */
exports.getAllInventory = catchAsync(async (req, res) => {
  const features = new APIFeatures(
    Inventory.find().populate('product', 'name price status'),  // Include product details
    req.query
  )
    .filter()      // Filter by query params (e.g., ?quantity[lt]=10)
    .sort()        // Sort results
    .limitFields() // Select specific fields
    .paginate();   // Paginate results

  const inventory = await features.query;

  res.status(200).json({
    status: 'success',
    results: inventory.length,
    data: { inventory }
  });
});

// ========== ADJUST STOCK ==========
/**
 * Adjust stock quantity for a product
 * PATCH /api/inventory/product/:productId/adjust
 * Body: { quantity, type, note }
 * Types: 'received', 'sold', 'returned', 'damaged', 'adjusted', 'transferred'
 * (Admin only)
 */
exports.adjustStock = catchAsync(async (req, res, next) => {
  const { productId } = req.params;
  const { quantity, type, note } = req.body;

  // Find inventory record
  let inventory = await Inventory.findOne({ product: productId });

  if (!inventory) {
    return next(new AppError('Inventory not found for this product', 404));
  }

  // Use the inventory model's adjustStock method
  // This handles quantity changes, movement tracking, and low stock alerts
  await inventory.adjustStock(
    quantity,                 // Change in quantity (positive or negative)
    type,                     // Type of adjustment
    req.params.orderId || null, // Optional order reference
    note,                     // Optional note about adjustment
    req.user.id               // Who performed the adjustment
  );

  // Keep product model in sync (denormalized stock field)
  await Product.findByIdAndUpdate(productId, {
    stock: inventory.quantity
  });

  res.status(200).json({
    status: 'success',
    data: { inventory }
  });
});

// ========== BULK ADJUST STOCK ==========
/**
 * Adjust multiple products' stock at once
 * POST /api/inventory/bulk-adjust
 * Body: { adjustments: [{ productId, quantity, type, note }, ...] }
 * (Admin only)
 */
exports.bulkAdjustStock = catchAsync(async (req, res, next) => {
  const { adjustments } = req.body;

  // Validate input
  if (!Array.isArray(adjustments) || adjustments.length === 0) {
    return next(new AppError('Please provide an array of adjustments', 400));
  }

  const results = [];

  // Process each adjustment sequentially (could be parallel with Promise.all)
  for (const adj of adjustments) {
    const inventory = await Inventory.findOne({ product: adj.productId });
    
    if (inventory) {
      // Apply adjustment
      await inventory.adjustStock(
        adj.quantity,
        adj.type,
        null,
        adj.note,
        req.user.id
      );
      
      // Update product stock
      await Product.findByIdAndUpdate(adj.productId, {
        stock: inventory.quantity
      });

      results.push({
        productId: adj.productId,
        success: true,
        newQuantity: inventory.quantity
      });
    } else {
      results.push({
        productId: adj.productId,
        success: false,
        error: 'Inventory not found'
      });
    }
  }

  res.status(200).json({
    status: 'success',
    data: { results }
  });
});

// ========== GET LOW STOCK ITEMS ==========
/**
 * Get all products with stock below reorder point
 * GET /api/inventory/low-stock
 * (Admin only)
 */
exports.getLowStockItems = catchAsync(async (req, res) => {
  const lowStock = await Inventory.getLowStockItems();  // Static model method

  res.status(200).json({
    status: 'success',
    results: lowStock.length,
    data: { items: lowStock }
  });
});

// ========== GET OUT OF STOCK ITEMS ==========
/**
 * Get all products with zero available stock
 * GET /api/inventory/out-of-stock
 * (Admin only)
 */
exports.getOutOfStockItems = catchAsync(async (req, res) => {
  const outOfStock = await Inventory.getOutOfStockItems();  // Static model method

  res.status(200).json({
    status: 'success',
    results: outOfStock.length,
    data: { items: outOfStock }
  });
});

// ========== GET INVENTORY MOVEMENTS ==========
/**
 * Get movement history for a specific product
 * GET /api/inventory/product/:productId/movements?limit=50&type=received
 * (Admin only)
 */
exports.getInventoryMovements = catchAsync(async (req, res, next) => {
  const { productId } = req.params;
  const { limit = 50, type } = req.query;

  const inventory = await Inventory.findOne({ product: productId });

  if (!inventory) {
    return next(new AppError('Inventory not found', 404));
  }

  // Filter movements by type if specified
  let movements = inventory.movements;

  if (type) {
    movements = movements.filter(m => m.type === type);
  }

  // Sort by date (newest first) and limit results
  movements = movements
    .sort((a, b) => b.performedAt - a.performedAt)
    .slice(0, parseInt(limit));

  res.status(200).json({
    status: 'success',
    results: movements.length,
    data: { movements }
  });
});

// ========== INITIALIZE INVENTORY FOR PRODUCT ==========
/**
 * Create initial inventory record for a product
 * POST /api/inventory/product/:productId/initialize
 * Body: { quantity, location }
 * (Admin only)
 */
exports.initializeInventory = catchAsync(async (req, res, next) => {
  const { productId } = req.params;
  const { quantity, location } = req.body;

  // Verify product exists
  const product = await Product.findById(productId);
  if (!product) {
    return next(new AppError('Product not found', 404));
  }

  // Check if inventory already exists
  const existingInventory = await Inventory.findOne({ product: productId });
  if (existingInventory) {
    return next(new AppError('Inventory already exists for this product', 400));
  }

  // Create new inventory record
  const inventory = await Inventory.create({
    product: productId,
    sku: product.sku || `SKU-${Date.now()}`,
    quantity: quantity || 0,
    location: location || {}
  });

  // Add initial movement record for audit trail
  inventory.movements.push({
    type: 'received',
    quantity: quantity || 0,
    previousQuantity: 0,
    newQuantity: quantity || 0,
    note: 'Initial inventory setup',
    performedBy: req.user.id,
    performedAt: new Date()
  });

  await inventory.save();

  res.status(201).json({
    status: 'success',
    data: { inventory }
  });
});

// ========== UPDATE INVENTORY LOCATION ==========
/**
 * Update warehouse location for a product
 * PATCH /api/inventory/product/:productId/location
 * Body: { warehouse, aisle, shelf, bin }
 * (Admin only)
 */
exports.updateLocation = catchAsync(async (req, res, next) => {
  const { productId } = req.params;
  const { warehouse, aisle, shelf, bin } = req.body;

  const inventory = await Inventory.findOne({ product: productId });

  if (!inventory) {
    return next(new AppError('Inventory not found', 404));
  }

  // Update location fields
  inventory.location = { warehouse, aisle, shelf, bin };
  await inventory.save();

  res.status(200).json({
    status: 'success',
    data: { inventory }
  });
});

// ========== COUNT INVENTORY (Physical Count) ==========
/**
 * Perform physical inventory count and adjust if needed
 * POST /api/inventory/product/:productId/count
 * Body: { countedQuantity, note }
 * (Admin only)
 */
exports.countInventory = catchAsync(async (req, res, next) => {
  const { productId } = req.params;
  const { countedQuantity, note } = req.body;

  const inventory = await Inventory.findOne({ product: productId });

  if (!inventory) {
    return next(new AppError('Inventory not found', 404));
  }

  // Calculate difference between counted and system quantity
  const difference = countedQuantity - inventory.quantity;

  // Adjust stock if there's a discrepancy
  if (difference !== 0) {
    await inventory.adjustStock(
      difference,
      'adjusted',
      null,
      note || `Physical count adjustment. Counted: ${countedQuantity}`,
      req.user.id
    );
  }

  // Update count metadata
  inventory.lastCountedAt = new Date();
  inventory.countedBy = req.user.id;
  await inventory.save();

  res.status(200).json({
    status: 'success',
    data: {
      inventory,
      difference,
      previousQuantity: inventory.quantity - difference,
      newQuantity: inventory.quantity
    }
  });
});