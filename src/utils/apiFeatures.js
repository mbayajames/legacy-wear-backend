// utils/apiFeatures.js
// API Features utility class for building flexible, reusable query builders
// Handles filtering, searching, sorting, field limiting, and pagination with chainable methods

/**
 * APIFeatures Class
 * Provides a fluent interface for building MongoDB queries with common API features
 * Allows for easy implementation of filtering, searching, sorting, field selection, and pagination
 * 
 * @example
 * const features = new APIFeatures(Product.find(), req.query)
 *   .filter()
 *   .sort()
 *   .limitFields()
 *   .paginate();
 * const products = await features.query;
 */
class APIFeatures {
  /**
   * Create an APIFeatures instance
   * 
   * @param {Query} query - Mongoose query object (e.g., Product.find())
   * @param {Object} queryString - Request query parameters (req.query)
   */
  constructor(query, queryString) {
    this.query = query;           // The Mongoose query to be built
    this.queryString = queryString; // Query parameters from URL
    this.pagination = null;       // Will store pagination metadata
  }

  // ========== FILTERING ==========
  /**
   * Filter results based on query parameters
   * Supports:
   * - Simple equality: ?category=electronics
   * - Comparison operators: ?price[gt]=100&price[lte]=500
   * 
   * @returns {APIFeatures} - Returns this for method chaining
   */
  filter() {
    // Step 1: Create a copy of query parameters
    const queryObj = { ...this.queryString };
    
    // Step 2: Remove special parameters that are not for filtering
    // These fields are handled by other methods
    const excludedFields = ['page', 'sort', 'limit', 'fields', 'search'];
    excludedFields.forEach(el => delete queryObj[el]);

    // Step 3: Transform comparison operators for MongoDB
    // Convert MongoDB operators like gte, gt, lte, lt to MongoDB format ($gte, $gt, etc.)
    // Example: { price: { gte: 100 } } → { price: { $gte: 100 } }
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);
    
    // Step 4: Apply the filter to the query
    this.query = this.query.find(JSON.parse(queryStr));
    
    return this;  // Return this for method chaining
  }

  // ========== SEARCH ==========
  /**
   * Search results across specified fields
   * Uses case-insensitive regex search
   * 
   * @param {Array} fields - Array of field names to search in (e.g., ['name', 'description'])
   * @returns {APIFeatures} - Returns this for method chaining
   * 
   * @example
   * // Search products by name or description
   * new APIFeatures(Product.find(), req.query)
   *   .search(['name', 'description'])
   */
  search(fields = []) {
    // Only apply search if 'search' parameter is present
    if (this.queryString.search) {
      const searchTerm = this.queryString.search;
      
      // Create case-insensitive regex pattern
      const searchRegex = new RegExp(searchTerm, 'i');
      
      // Build OR conditions for each searchable field
      const searchConditions = fields.map(field => ({
        [field]: searchRegex
      }));
      
      // Add search conditions to the query
      this.query = this.query.find({ $or: searchConditions });
    }
    return this;
  }

  // ========== SORTING ==========
  /**
   * Sort results by specified fields
   * Supports sorting by multiple fields
   * 
   * @returns {APIFeatures} - Returns this for method chaining
   * 
   * @example
   * // Sort by price ascending
   * ?sort=price
   * 
   * // Sort by price descending, then name ascending
   * ?sort=-price,name
   */
  sort() {
    // Check if sort parameter exists in query
    if (this.queryString.sort) {
      // Convert comma-separated fields to space-separated
      // MongoDB format: '-price name' (negative for descending)
      const sortBy = this.queryString.sort.split(',').join(' ');
      this.query = this.query.sort(sortBy);
    } else {
      // Default sorting: newest first (createdAt descending)
      this.query = this.query.sort('-createdAt');
    }
    return this;
  }

  // ========== FIELD LIMITING ==========
  /**
   * Select only specific fields to return (projection)
   * Improves performance by reducing data transfer
   * 
   * @returns {APIFeatures} - Returns this for method chaining
   * 
   * @example
   * // Return only name and price
   * ?fields=name,price
   */
  limitFields() {
    // Check if fields parameter exists
    if (this.queryString.fields) {
      // Convert comma-separated fields to space-separated
      const fields = this.queryString.fields.split(',').join(' ');
      this.query = this.query.select(fields);
    } else {
      // Default: exclude the __v field (Mongoose version key)
      this.query = this.query.select('-__v');
    }
    return this;
  }

  // ========== PAGINATION ==========
  /**
   * Paginate results for large datasets
   * Uses skip and limit for pagination
   * 
   * @returns {APIFeatures} - Returns this for method chaining
   * 
   * @example
   * // Get page 2 with 10 items per page
   * ?page=2&limit=10
   */
  paginate() {
    // Get page number (default: 1)
    const page = parseInt(this.queryString.page, 10) || 1;
    
    // Get items per page (default: 100)
    const limit = parseInt(this.queryString.limit, 10) || 100;
    
    // Calculate number of documents to skip
    // Example: page=2, limit=10 → skip 10 documents
    const skip = (page - 1) * limit;

    // Apply pagination to query
    this.query = this.query.skip(skip).limit(limit);
    
    // Store pagination info for later use
    this.pagination = {
      page,
      limit,
      skip
    };
    
    return this;
  }

  // ========== GET PAGINATION METADATA ==========
  /**
   * Generate pagination metadata after query execution
   * Must be called after executing the query to get total count
   * 
   * @param {number} totalDocuments - Total number of documents matching the query
   * @returns {Object} - Pagination metadata object
   * 
   * @example
   * const products = await features.query;
   * const total = await Product.countDocuments();
   * const metadata = await features.getPaginationMetadata(total);
   */
  async getPaginationMetadata(totalDocuments) {
    // Get pagination values (or defaults)
    const { page = 1, limit = 100 } = this.pagination || {};
    
    // Calculate total pages
    const totalPages = Math.ceil(totalDocuments / limit);
    
    // Determine if there are next/previous pages
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    // Return comprehensive pagination metadata
    return {
      currentPage: page,           // Current page number
      limit,                        // Items per page
      totalDocuments,               // Total documents in collection
      totalPages,                   // Total pages available
      hasNext,                      // Boolean: has next page
      hasPrev,                      // Boolean: has previous page
      nextPage: hasNext ? page + 1 : null,  // Next page number or null
      prevPage: hasPrev ? page - 1 : null   // Previous page number or null
    };
  }
}

module.exports = APIFeatures;