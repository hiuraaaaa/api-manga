/**
 * In-memory cache service with TTL support
 * Provides caching functionality for API responses
 */

class CacheService {
  constructor() {
    this.cache = new Map();
    this.defaultTTL = 5 * 60 * 1000; // 5 minutes in milliseconds
    this.cleanupInterval = 60 * 1000; // Cleanup every minute
    
    // Start cleanup interval
    this.startCleanup();
  }

  /**
   * Generate cache key from URL and query parameters
   * @param {string} url - The URL to cache
   * @param {object} params - Query parameters
   * @returns {string} Cache key
   */
  generateKey(url, params = {}) {
    const paramsString = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    return `${url}${paramsString ? `?${paramsString}` : ''}`;
  }

  /**
   * Get cached value
   * @param {string} key - Cache key
   * @returns {object|null} Cached value or null if not found/expired
   */
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }

    // Check if expired
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * Set cache value
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttl - Time to live in milliseconds (optional)
   */
  set(key, value, ttl = null) {
    const expiresAt = Date.now() + (ttl || this.defaultTTL);
    this.cache.set(key, {
      value,
      expiresAt,
      createdAt: Date.now()
    });
  }

  /**
   * Delete cache entry
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * @returns {object} Cache statistics
   */
  getStats() {
    const now = Date.now();
    let hits = 0;
    let misses = 0;
    let expired = 0;

    this.cache.forEach(item => {
      if (now > item.expiresAt) {
        expired++;
      }
    });

    return {
      size: this.cache.size,
      expired,
      active: this.cache.size - expired
    };
  }

  /**
   * Cleanup expired cache entries
   */
  cleanup() {
    const now = Date.now();
    const keysToDelete = [];

    this.cache.forEach((item, key) => {
      if (now > item.expiresAt) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Start automatic cleanup interval
   */
  startCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupInterval);
  }

  /**
   * Stop cleanup interval
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Cache middleware for Express
   * @param {number} ttl - Time to live in milliseconds
   * @returns {function} Express middleware
   */
  middleware(ttl = null) {
    const self = this;
    return (req, res, next) => {
      const key = self.generateKey(req.originalUrl, req.query);
      const cached = self.get(key);

      if (cached) {
        res.set('X-Cache', 'HIT');
        // Call res.json through the chain (respecting performance middleware if present)
        return res.json(cached);
      }

      // Store the current json method (might be overridden by performance middleware)
      const currentJson = res.json.bind(res);

      // Override json method to cache response
      res.json = function(data) {
        // Cache the response
        self.set(key, data, ttl);
        res.set('X-Cache', 'MISS');
        // Call the current json method (which may be performance middleware's override)
        return currentJson(data);
      };

      next();
    };
  }
}

// Export singleton instance
const cacheService = new CacheService();

module.exports = cacheService;

