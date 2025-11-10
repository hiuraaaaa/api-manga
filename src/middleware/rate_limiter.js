/**
 * Rate limiting middleware for Express
 * Simple in-memory rate limiter with IP-based tracking
 */

class RateLimiter {
  constructor() {
    this.requests = new Map();
    this.cleanupInterval = 60 * 1000; // Cleanup every minute
    
    // Start cleanup
    this.startCleanup();
  }

  /**
   * Get client identifier from request
   * @param {object} req - Express request object
   * @returns {string} Client identifier (IP address)
   */
  getClientId(req) {
    return req.ip || 
           req.connection.remoteAddress || 
           req.headers['x-forwarded-for']?.split(',')[0] || 
           'unknown';
  }

  /**
   * Check if request should be rate limited
   * @param {string} clientId - Client identifier
   * @param {number} maxRequests - Maximum requests allowed
   * @param {number} windowMs - Time window in milliseconds
   * @returns {object} Rate limit result
   */
  checkLimit(clientId, maxRequests, windowMs) {
    const now = Date.now();
    const key = `${clientId}`;
    
    let clientData = this.requests.get(key);
    
    if (!clientData) {
      clientData = {
        requests: [],
        resetTime: now + windowMs
      };
      this.requests.set(key, clientData);
    }
    
    // Clean old requests outside the window
    clientData.requests = clientData.requests.filter(
      timestamp => now - timestamp < windowMs
    );
    
    // Check if limit exceeded
    if (clientData.requests.length >= maxRequests) {
      const resetTime = clientData.requests[0] + windowMs;
      return {
        allowed: false,
        remaining: 0,
        resetTime,
        retryAfter: Math.ceil((resetTime - now) / 1000)
      };
    }
    
    // Add current request
    clientData.requests.push(now);
    clientData.resetTime = now + windowMs;
    
    return {
      allowed: true,
      remaining: maxRequests - clientData.requests.length,
      resetTime: clientData.resetTime,
      retryAfter: 0
    };
  }

  /**
   * Cleanup old entries
   */
  cleanup() {
    const now = Date.now();
    const keysToDelete = [];
    
    this.requests.forEach((data, key) => {
      if (now > data.resetTime) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.requests.delete(key));
  }

  /**
   * Start automatic cleanup
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
   * Stop cleanup
   */
  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Create rate limit middleware
   * @param {object} options - Rate limit options
   * @param {number} options.max - Maximum requests
   * @param {number} options.windowMs - Time window in milliseconds
   * @param {string} options.message - Error message
   * @returns {function} Express middleware
   */
  createMiddleware(options = {}) {
    const {
      max = 100,
      windowMs = 15 * 60 * 1000, // 15 minutes
      message = 'Too many requests, please try again later'
    } = options;

    return (req, res, next) => {
      const clientId = this.getClientId(req);
      const result = this.checkLimit(clientId, max, windowMs);

      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': max,
        'X-RateLimit-Remaining': result.remaining,
        'X-RateLimit-Reset': new Date(result.resetTime).toISOString()
      });

      if (!result.allowed) {
        res.set('Retry-After', result.retryAfter);
        return res.status(429).json({
          status: 'error',
          code: 'RATE_LIMIT_EXCEEDED',
          message,
          data: [],
          retryAfter: result.retryAfter
        });
      }

      next();
    };
  }

  /**
   * Get rate limit stats
   * @returns {object} Statistics
   */
  getStats() {
    return {
      totalClients: this.requests.size,
      requests: Array.from(this.requests.entries()).map(([key, data]) => ({
        clientId: key,
        requestCount: data.requests.length,
        resetTime: data.resetTime
      }))
    };
  }
}

// Create singleton instance
const rateLimiter = new RateLimiter();

/**
 * Default rate limiter middleware (100 requests per 15 minutes)
 */
const defaultRateLimiter = rateLimiter.createMiddleware({
  max: 100,
  windowMs: 15 * 60 * 1000
});

/**
 * Strict rate limiter for search endpoints (50 requests per 15 minutes)
 */
const strictRateLimiter = rateLimiter.createMiddleware({
  max: 50,
  windowMs: 15 * 60 * 1000,
  message: 'Too many search requests, please try again later'
});

/**
 * Per-endpoint rate limiter factory
 * @param {number} max - Maximum requests
 * @param {number} windowMs - Time window in milliseconds
 * @returns {function} Rate limit middleware
 */
const createRateLimiter = (max, windowMs = 15 * 60 * 1000) => {
  return rateLimiter.createMiddleware({ max, windowMs });
};

module.exports = {
  rateLimiter,
  defaultRateLimiter,
  strictRateLimiter,
  createRateLimiter
};

