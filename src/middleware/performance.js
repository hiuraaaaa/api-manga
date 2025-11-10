/**
 * Performance monitoring middleware
 * Tracks response times, request counts, and cache performance
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      requestCount: 0,
      totalResponseTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      endpoints: new Map()
    };
    
    this.startTime = Date.now();
  }

  /**
   * Record request metrics
   * @param {string} endpoint - Endpoint path
   * @param {number} responseTime - Response time in milliseconds
   * @param {boolean} cached - Whether response was cached
   * @param {boolean} error - Whether request resulted in error
   */
  recordRequest(endpoint, responseTime, cached = false, error = false) {
    this.metrics.requestCount++;
    this.metrics.totalResponseTime += responseTime;
    
    if (cached) {
      this.metrics.cacheHits++;
    } else {
      this.metrics.cacheMisses++;
    }
    
    if (error) {
      this.metrics.errors++;
    }
    
    // Track per-endpoint metrics
    if (!this.metrics.endpoints.has(endpoint)) {
      this.metrics.endpoints.set(endpoint, {
        count: 0,
        totalTime: 0,
        cacheHits: 0,
        cacheMisses: 0,
        errors: 0,
        avgTime: 0
      });
    }
    
    const endpointMetrics = this.metrics.endpoints.get(endpoint);
    endpointMetrics.count++;
    endpointMetrics.totalTime += responseTime;
    
    if (cached) {
      endpointMetrics.cacheHits++;
    } else {
      endpointMetrics.cacheMisses++;
    }
    
    if (error) {
      endpointMetrics.errors++;
    }
    
    endpointMetrics.avgTime = endpointMetrics.totalTime / endpointMetrics.count;
  }

  /**
   * Get performance statistics
   * @returns {object} Performance statistics
   */
  getStats() {
    const uptime = Date.now() - this.startTime;
    const avgResponseTime = this.metrics.requestCount > 0
      ? this.metrics.totalResponseTime / this.metrics.requestCount
      : 0;
    
    const cacheHitRate = (this.metrics.cacheHits + this.metrics.cacheMisses) > 0
      ? (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)) * 100
      : 0;
    
    const errorRate = this.metrics.requestCount > 0
      ? (this.metrics.errors / this.metrics.requestCount) * 100
      : 0;
    
    const endpointStats = {};
    this.metrics.endpoints.forEach((stats, endpoint) => {
      endpointStats[endpoint] = {
        requestCount: stats.count,
        avgResponseTime: stats.avgTime,
        cacheHitRate: (stats.cacheHits + stats.cacheMisses) > 0
          ? (stats.cacheHits / (stats.cacheHits + stats.cacheMisses)) * 100
          : 0,
        errorRate: stats.count > 0
          ? (stats.errors / stats.count) * 100
          : 0
      };
    });
    
    return {
      uptime: Math.floor(uptime / 1000), // in seconds
      totalRequests: this.metrics.requestCount,
      avgResponseTime: Math.round(avgResponseTime),
      cacheHits: this.metrics.cacheHits,
      cacheMisses: this.metrics.cacheMisses,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      errors: this.metrics.errors,
      errorRate: Math.round(errorRate * 100) / 100,
      endpoints: endpointStats
    };
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
      requestCount: 0,
      totalResponseTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      endpoints: new Map()
    };
    this.startTime = Date.now();
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

/**
 * Performance monitoring middleware
 * @returns {function} Express middleware
 */
const performanceMiddleware = (req, res, next) => {
  const startTime = Date.now();
  const endpoint = req.path || req.originalUrl.split('?')[0];
  
  // Set request ID
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.set('X-Request-ID', requestId);
  
  // Store original methods if not already stored
  if (!res._performanceOriginalJson) {
    res._performanceOriginalJson = res.json.bind(res);
    res._performanceOriginalSend = res.send.bind(res);
    
    // Override json to measure time
    res.json = function(data) {
      const responseTime = Date.now() - startTime;
      res.set('X-Response-Time', `${responseTime}ms`);
      return res._performanceOriginalJson(data);
    };
    
    // Override send to measure time
    res.send = function(data) {
      const responseTime = Date.now() - startTime;
      res.set('X-Response-Time', `${responseTime}ms`);
      return res._performanceOriginalSend(data);
    };
  }
  
  // Record metrics on finish
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const cached = res.get('X-Cache') === 'HIT';
    const error = res.statusCode >= 400;
    
    performanceMonitor.recordRequest(endpoint, responseTime, cached, error);
  });
  
  next();
};

module.exports = {
  performanceMonitor,
  performanceMiddleware
};

