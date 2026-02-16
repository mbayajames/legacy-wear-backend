const Product = require('../models/Product');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get all products
// @route   GET /api/products
// @access  Public
exports.getProducts = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 12;
  const skip = (page - 1) * limit;

  // Build query
  let query = { status: 'active' };

  // Filter by category
  if (req.query.category) {
    query.category = req.query.category;
  }

  // Filter by subcategory
  if (req.query.subCategory) {
    query.subCategory = req.query.subCategory;
  }

  // Filter by brand
  if (req.query.brand) {
    query.brand = req.query.brand;
  }

  // Filter by price range
  if (req.query.minPrice || req.query.maxPrice) {
    query.price = {};
    if (req.query.minPrice) query.price.$gte = parseFloat(req.query.minPrice);
    if (req.query.maxPrice) query.price.$lte = parseFloat(req.query.maxPrice);
  }

  // Filter by rating
  if (req.query.minRating) {
    query.rating = { $gte: parseFloat(req.query.minRating) };
  }

  // Search
  if (req.query.search) {
    query.$text = { $search: req.query.search };
  }

  // Filter by tags
  if (req.query.tags) {
    const tags = req.query.tags.split(',');
    query.tags = { $in: tags };
  }

  // Sort
  let sortBy = '-createdAt';
  if (req.query.sort) {
    const sortFields = {
      newest: '-createdAt',
      oldest: 'createdAt',
      'price-asc': 'price',
      'price-desc': '-price',
      'rating': '-rating',
      popular: '-soldCount',
    };
    sortBy = sortFields[req.query.sort] || sortBy;
  }

  const products = await Product.find(query)
    .select('-reviews')
    .limit(limit)
    .skip(skip)
    .sort(sortBy);

  const total = await Product.countDocuments(query);

  res.status(200).json({
    success: true,
    count: products.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: products,
  });
});

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
exports.getProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id)
    .populate('reviews.user', 'name avatar');

  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  // Increment views
  product.views += 1;
  await product.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    data: product,
  });
});

// @desc    Get product by slug
// @route   GET /api/products/slug/:slug
// @access  Public
exports.getProductBySlug = asyncHandler(async (req, res, next) => {
  const product = await Product.findOne({ slug: req.params.slug })
    .populate('reviews.user', 'name avatar');

  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  // Increment views
  product.views += 1;
  await product.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    data: product,
  });
});

// @desc    Get featured products
// @route   GET /api/products/featured
// @access  Public
exports.getFeaturedProducts = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit, 10) || 8;

  const products = await Product.find({ isFeatured: true, status: 'active' })
    .select('-reviews')
    .limit(limit)
    .sort('-createdAt');

  res.status(200).json({
    success: true,
    count: products.length,
    data: products,
  });
});

// @desc    Get new arrivals
// @route   GET /api/products/new-arrivals
// @access  Public
exports.getNewArrivals = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit, 10) || 8;

  const products = await Product.find({ isNewArrival: true, status: 'active' })
    .select('-reviews')
    .limit(limit)
    .sort('-createdAt');

  res.status(200).json({
    success: true,
    count: products.length,
    data: products,
  });
});

// @desc    Get related products
// @route   GET /api/products/:id/related
// @access  Public
exports.getRelatedProducts = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  const relatedProducts = await Product.find({
    _id: { $ne: product._id },
    category: product.category,
    status: 'active',
  })
    .select('-reviews')
    .limit(4)
    .sort('-rating');

  res.status(200).json({
    success: true,
    count: relatedProducts.length,
    data: relatedProducts,
  });
});

// @desc    Create product review
// @route   POST /api/products/:id/reviews
// @access  Private
exports.createReview = asyncHandler(async (req, res, next) => {
  const { rating, comment } = req.body;

  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  // Check if user already reviewed
  const alreadyReviewed = product.reviews.find(
    (r) => r.user.toString() === req.user.id
  );

  if (alreadyReviewed) {
    return next(new ErrorResponse('You already reviewed this product', 400));
  }

  const review = {
    user: req.user.id,
    name: req.user.name,
    rating: Number(rating),
    comment,
  };

  product.reviews.push(review);
  product.calculateAverageRating();

  await product.save();

  res.status(201).json({
    success: true,
    message: 'Review added',
  });
});

// @desc    Update product review
// @route   PUT /api/products/:id/reviews/:reviewId
// @access  Private
exports.updateReview = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  const review = product.reviews.id(req.params.reviewId);

  if (!review) {
    return next(new ErrorResponse('Review not found', 404));
  }

  // Check ownership
  if (review.user.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to update this review', 403));
  }

  review.rating = req.body.rating || review.rating;
  review.comment = req.body.comment || review.comment;

  product.calculateAverageRating();
  await product.save();

  res.status(200).json({
    success: true,
    message: 'Review updated',
  });
});

// @desc    Delete product review
// @route   DELETE /api/products/:id/reviews/:reviewId
// @access  Private
exports.deleteReview = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  const review = product.reviews.id(req.params.reviewId);

  if (!review) {
    return next(new ErrorResponse('Review not found', 404));
  }

  // Check ownership or admin
  if (review.user.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to delete this review', 403));
  }

  product.reviews.pull(req.params.reviewId);
  product.calculateAverageRating();
  await product.save();

  res.status(200).json({
    success: true,
    message: 'Review deleted',
  });
});

// ADMIN ROUTES

// @desc    Create product
// @route   POST /api/products
// @access  Private/Admin
exports.createProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.create(req.body);

  res.status(201).json({
    success: true,
    data: product,
  });
});

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Admin
exports.updateProduct = asyncHandler(async (req, res, next) => {
  let product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  product = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    success: true,
    data: product,
  });
});

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private/Admin
exports.deleteProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new ErrorResponse('Product not found', 404));
  }

  await product.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Product deleted',
  });
});