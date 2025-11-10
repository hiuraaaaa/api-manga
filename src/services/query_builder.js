/**
 * Advanced Query Builder
 * Membangun query kompleks untuk filtering dan sorting
 */

/**
 * Query Builder Class
 */
class QueryBuilder {
  constructor() {
    this.filters = [];
    this.sorts = [];
    this.pagination = null;
    this.resultLimit = null;
    this.options = {};
  }

  /**
   * Add filter condition
   * @param {string} field - Field name
   * @param {string} operator - Operator (eq, ne, gt, gte, lt, lte, in, nin, contains, startsWith, endsWith)
   * @param {*} value - Filter value
   * @returns {QueryBuilder} Instance for chaining
   */
  where(field, operator, value) {
    this.filters.push({ field, operator, value });
    return this;
  }

  /**
   * Add equality filter
   * @param {string} field - Field name
   * @param {*} value - Filter value
   * @returns {QueryBuilder} Instance for chaining
   */
  whereEqual(field, value) {
    return this.where(field, 'eq', value);
  }

  /**
   * Add contains filter
   * @param {string} field - Field name
   * @param {*} value - Filter value
   * @returns {QueryBuilder} Instance for chaining
   */
  whereContains(field, value) {
    return this.where(field, 'contains', value);
  }

  /**
   * Add in filter
   * @param {string} field - Field name
   * @param {Array} values - Array of values
   * @returns {QueryBuilder} Instance for chaining
   */
  whereIn(field, values) {
    return this.where(field, 'in', values);
  }

  /**
   * Add range filter
   * @param {string} field - Field name
   * @param {*} min - Minimum value
   * @param {*} max - Maximum value
   * @returns {QueryBuilder} Instance for chaining
   */
  whereBetween(field, min, max) {
    this.filters.push({ field, operator: 'gte', value: min });
    this.filters.push({ field, operator: 'lte', value: max });
    return this;
  }

  /**
   * Add OR condition group
   * @param {Function} callback - Callback with nested query builder
   * @returns {QueryBuilder} Instance for chaining
   */
  orWhere(callback) {
    const nestedBuilder = new QueryBuilder();
    callback(nestedBuilder);
    this.filters.push({ type: 'or', filters: nestedBuilder.filters });
    return this;
  }

  /**
   * Add sort order
   * @param {string} field - Field name
   * @param {string} direction - Sort direction (asc/desc)
   * @returns {QueryBuilder} Instance for chaining
   */
  orderBy(field, direction = 'asc') {
    this.sorts.push({ field, direction: direction.toLowerCase() });
    return this;
  }

  /**
   * Add pagination
   * @param {number} page - Page number
   * @param {number} pageSize - Items per page
   * @returns {QueryBuilder} Instance for chaining
   */
  paginate(page, pageSize) {
    this.pagination = { page: parseInt(page) || 1, pageSize: parseInt(pageSize) || 10 };
    return this;
  }

  /**
   * Set result limit
   * @param {number} limitValue - Maximum number of results
   * @returns {QueryBuilder} Instance for chaining
   */
  limit(limitValue) {
    this.resultLimit = parseInt(limitValue);
    return this;
  }

  /**
   * Set options
   * @param {object} options - Query options
   * @returns {QueryBuilder} Instance for chaining
   */
  setOptions(options) {
    this.options = { ...this.options, ...options };
    return this;
  }

  /**
   * Execute query on data
   * @param {Array} data - Data to query
   * @returns {object} Query result
   */
  execute(data) {
    if (!Array.isArray(data)) {
      return { data: [], total: 0, page: 1, pageSize: 10, totalPages: 0 };
    }

    let results = [...data];

    // Apply filters
    results = this.applyFilters(results);

    // Apply sorting
    results = this.applySorts(results);

    // Get total before pagination
    const total = results.length;

    // Apply pagination
    if (this.pagination) {
      const { page, pageSize } = this.pagination;
      const start = (page - 1) * pageSize;
      const end = start + pageSize;
      results = results.slice(start, end);
    }

    // Apply limit
    if (this.resultLimit && this.resultLimit > 0) {
      results = results.slice(0, this.resultLimit);
    }

    return {
      data: results,
      total,
      page: this.pagination?.page || 1,
      pageSize: this.pagination?.pageSize || results.length,
      totalPages: this.pagination ? Math.ceil(total / this.pagination.pageSize) : 1,
      hasNext: this.pagination ? this.pagination.page * this.pagination.pageSize < total : false,
      hasPrev: this.pagination ? this.pagination.page > 1 : false
    };
  }

  /**
   * Apply filters to data
   * @param {Array} data - Data to filter
   * @returns {Array} Filtered data
   */
  applyFilters(data) {
    return data.filter(item => {
      return this.evaluateFilters(item, this.filters);
    });
  }

  /**
   * Evaluate filters for an item
   * @param {object} item - Item to evaluate
   * @param {Array} filters - Filters to apply
   * @returns {boolean} Whether item matches filters
   */
  evaluateFilters(item, filters) {
    // Handle OR groups
    const orGroups = filters.filter(f => f.type === 'or');
    const andFilters = filters.filter(f => f.type !== 'or');

    // Evaluate AND filters
    const andResult = andFilters.every(filter => this.evaluateFilter(item, filter));

    // Evaluate OR groups
    if (orGroups.length > 0) {
      const orResult = orGroups.some(group => {
        return group.filters.every(filter => this.evaluateFilter(item, filter));
      });
      return andResult && orResult;
    }

    return andResult;
  }

  /**
   * Evaluate single filter
   * @param {object} item - Item to evaluate
   * @param {object} filter - Filter to apply
   * @returns {boolean} Whether item matches filter
   */
  evaluateFilter(item, filter) {
    const { field, operator, value } = filter;
    const itemValue = this.getNestedValue(item, field);

    switch (operator) {
      case 'eq':
        return this.equals(itemValue, value);
      case 'ne':
        return !this.equals(itemValue, value);
      case 'gt':
        return this.compare(itemValue, value) > 0;
      case 'gte':
        return this.compare(itemValue, value) >= 0;
      case 'lt':
        return this.compare(itemValue, value) < 0;
      case 'lte':
        return this.compare(itemValue, value) <= 0;
      case 'in':
        return Array.isArray(value) && value.includes(itemValue);
      case 'nin':
        return Array.isArray(value) && !value.includes(itemValue);
      case 'contains':
        return this.contains(itemValue, value);
      case 'startsWith':
        return this.startsWith(itemValue, value);
      case 'endsWith':
        return this.endsWith(itemValue, value);
      case 'exists':
        return itemValue !== undefined && itemValue !== null;
      case 'regex':
        return this.matchesRegex(itemValue, value);
      default:
        return true;
    }
  }

  /**
   * Get nested value from object
   * @param {object} obj - Object
   * @param {string} path - Path to value (e.g., 'metadata.qualityScore')
   * @returns {*} Value
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  /**
   * Compare two values
   * @param {*} a - First value
   * @param {*} b - Second value
   * @returns {number} Comparison result
   */
  compare(a, b) {
    if (a === b) return 0;
    if (a === null || a === undefined) return -1;
    if (b === null || b === undefined) return 1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b);
    if (a instanceof Date && b instanceof Date) return a - b;
    return String(a).localeCompare(String(b));
  }

  /**
   * Check if values are equal
   * @param {*} a - First value
   * @param {*} b - Second value
   * @returns {boolean} Whether values are equal
   */
  equals(a, b) {
    if (a === b) return true;
    if (typeof a === 'string' && typeof b === 'string') {
      return a.toLowerCase() === b.toLowerCase();
    }
    return false;
  }

  /**
   * Check if value contains substring
   * @param {*} haystack - Value to search in
   * @param {*} needle - Value to search for
   * @returns {boolean} Whether value contains substring
   */
  contains(haystack, needle) {
    if (!haystack) return false;
    return String(haystack).toLowerCase().includes(String(needle).toLowerCase());
  }

  /**
   * Check if value starts with substring
   * @param {*} value - Value to check
   * @param {*} prefix - Prefix to check
   * @returns {boolean} Whether value starts with prefix
   */
  startsWith(value, prefix) {
    if (!value) return false;
    return String(value).toLowerCase().startsWith(String(prefix).toLowerCase());
  }

  /**
   * Check if value ends with substring
   * @param {*} value - Value to check
   * @param {*} suffix - Suffix to check
   * @returns {boolean} Whether value ends with suffix
   */
  endsWith(value, suffix) {
    if (!value) return false;
    return String(value).toLowerCase().endsWith(String(suffix).toLowerCase());
  }

  /**
   * Check if value matches regex
   * @param {*} value - Value to check
   * @param {string|RegExp} pattern - Regex pattern
   * @returns {boolean} Whether value matches pattern
   */
  matchesRegex(value, pattern) {
    if (!value) return false;
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
    return regex.test(String(value));
  }

  /**
   * Apply sorts to data
   * @param {Array} data - Data to sort
   * @returns {Array} Sorted data
   */
  applySorts(data) {
    if (this.sorts.length === 0) return data;

    const sorted = [...data];
    sorted.sort((a, b) => {
      for (const sort of this.sorts) {
        const aVal = this.getNestedValue(a, sort.field);
        const bVal = this.getNestedValue(b, sort.field);
        const comparison = this.compare(aVal, bVal);

        if (comparison !== 0) {
          return sort.direction === 'desc' ? -comparison : comparison;
        }
      }
      return 0;
    });

    return sorted;
  }

  /**
   * Reset query builder
   * @returns {QueryBuilder} Instance for chaining
   */
  reset() {
    this.filters = [];
    this.sorts = [];
    this.pagination = null;
    this.resultLimit = null;
    this.options = {};
    return this;
  }

  /**
   * Create query builder from query parameters
   * @param {object} query - Query parameters
   * @returns {QueryBuilder} Query builder instance
   */
  static fromQuery(query) {
    const builder = new QueryBuilder();

    // Add filters from query
    if (query.genre) {
      builder.whereContains('genre', query.genre);
    }
    if (query.type) {
      builder.whereEqual('type', query.type);
    }
    if (query.status) {
      builder.whereEqual('status', query.status);
    }
    if (query.minRating) {
      builder.where('rating', 'gte', parseFloat(query.minRating));
    }
    if (query.maxRating) {
      builder.where('rating', 'lte', parseFloat(query.maxRating));
    }
    if (query.search) {
      builder.whereContains('searchable', query.search);
    }

    // Add sorting
    if (query.sortBy) {
      builder.orderBy(query.sortBy, query.sortOrder || 'asc');
    }

    // Add pagination
    if (query.page) {
      builder.paginate(query.page, query.pageSize || query.limit || 10);
    }

    // Add limit
    if (query.limit && !query.page) {
      builder.limit(parseInt(query.limit));
    }

    return builder;
  }
}

module.exports = QueryBuilder;

