/**
 * Response Optimizer Service
 * Optimize API responses dengan compression dan formatting
 */

/**
 * Response Optimizer
 */
class ResponseOptimizer {
  /**
   * Optimize response data
   * @param {object} data - Response data
   * @param {object} options - Optimization options
   * @returns {object} Optimized response
   */
  static optimize(data, options = {}) {
    const {
      compress = false,
      minify = false,
      removeNulls = false,
      removeEmpty = false,
      fields = null, // Specific fields to include
      excludeFields = null // Fields to exclude
    } = options;

    let optimized = data;

    // Remove null values
    if (removeNulls) {
      optimized = this.removeNulls(optimized);
    }

    // Remove empty values
    if (removeEmpty) {
      optimized = this.removeEmpty(optimized);
    }

    // Filter fields
    if (fields && Array.isArray(fields)) {
      optimized = this.filterFields(optimized, fields);
    }

    // Exclude fields
    if (excludeFields && Array.isArray(excludeFields)) {
      optimized = this.excludeFields(optimized, excludeFields);
    }

    // Minify (remove extra whitespace from strings)
    if (minify) {
      optimized = this.minify(optimized);
    }

    return optimized;
  }

  /**
   * Remove null values from object
   * @param {*} data - Data to process
   * @returns {*} Data without nulls
   */
  static removeNulls(data) {
    if (data === null || data === undefined) {
      return undefined;
    }

    if (Array.isArray(data)) {
      return data
        .map(item => this.removeNulls(item))
        .filter(item => item !== undefined);
    }

    if (typeof data === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(data)) {
        const cleaned = this.removeNulls(value);
        if (cleaned !== undefined) {
          result[key] = cleaned;
        }
      }
      return result;
    }

    return data;
  }

  /**
   * Remove empty values from object
   * @param {*} data - Data to process
   * @returns {*} Data without empty values
   */
  static removeEmpty(data) {
    if (data === null || data === undefined) {
      return undefined;
    }

    if (Array.isArray(data)) {
      return data
        .map(item => this.removeEmpty(item))
        .filter(item => {
          if (item === undefined || item === null) return false;
          if (typeof item === 'string' && item.trim() === '') return false;
          if (Array.isArray(item) && item.length === 0) return false;
          if (typeof item === 'object' && Object.keys(item).length === 0) return false;
          return true;
        });
    }

    if (typeof data === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(data)) {
        const cleaned = this.removeEmpty(value);
        if (cleaned !== undefined && cleaned !== null) {
          if (typeof cleaned === 'string' && cleaned.trim() !== '') {
            result[key] = cleaned;
          } else if (Array.isArray(cleaned) && cleaned.length > 0) {
            result[key] = cleaned;
          } else if (typeof cleaned === 'object' && Object.keys(cleaned).length > 0) {
            result[key] = cleaned;
          } else if (typeof cleaned !== 'string' && !Array.isArray(cleaned) && typeof cleaned !== 'object') {
            result[key] = cleaned;
          }
        }
      }
      return result;
    }

    return data;
  }

  /**
   * Filter fields from object
   * @param {*} data - Data to filter
   * @param {Array} fields - Fields to include
   * @returns {*} Filtered data
   */
  static filterFields(data, fields) {
    if (Array.isArray(data)) {
      return data.map(item => this.filterFields(item, fields));
    }

    if (typeof data === 'object' && data !== null) {
      const result = {};
      for (const field of fields) {
        if (data.hasOwnProperty(field)) {
          result[field] = data[field];
        }
      }
      return result;
    }

    return data;
  }

  /**
   * Exclude fields from object
   * @param {*} data - Data to filter
   * @param {Array} fields - Fields to exclude
   * @returns {*} Filtered data
   */
  static excludeFields(data, fields) {
    if (Array.isArray(data)) {
      return data.map(item => this.excludeFields(item, fields));
    }

    if (typeof data === 'object' && data !== null) {
      const result = {};
      for (const [key, value] of Object.entries(data)) {
        if (!fields.includes(key)) {
          result[key] = this.excludeFields(value, fields);
        }
      }
      return result;
    }

    return data;
  }

  /**
   * Minify data (remove extra whitespace)
   * @param {*} data - Data to minify
   * @returns {*} Minified data
   */
  static minify(data) {
    // For strings, remove extra whitespace
    if (typeof data === 'string') {
      return data.replace(/\s+/g, ' ').trim();
    }

    // For arrays and objects, recursively minify
    if (Array.isArray(data)) {
      return data.map(item => this.minify(item));
    }

    if (typeof data === 'object' && data !== null) {
      const result = {};
      for (const [key, value] of Object.entries(data)) {
        result[key] = this.minify(value);
      }
      return result;
    }

    return data;
  }

  /**
   * Format response with metadata
   * @param {*} data - Response data
   * @param {object} metadata - Additional metadata
   * @returns {object} Formatted response
   */
  static formatResponse(data, metadata = {}) {
    return {
      status: 'success',
      data,
      metadata: {
        timestamp: new Date().toISOString(),
        ...metadata
      }
    };
  }

  /**
   * Create paginated response
   * @param {Array} data - Data array
   * @param {number} page - Current page
   * @param {number} pageSize - Items per page
   * @param {object} additional - Additional metadata
   * @returns {object} Paginated response
   */
  static paginate(data, page, pageSize, additional = {}) {
    const total = data.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedData = data.slice(start, end);

    return {
      status: 'success',
      data: paginatedData,
      pagination: {
        current_page: page,
        page_size: pageSize,
        total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1
      },
      ...additional
    };
  }
}

module.exports = ResponseOptimizer;

