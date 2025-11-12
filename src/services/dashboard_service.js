/**
 * Dashboard Service
 * Aggregates data for dashboard and provides analytics computation
 */

const { performanceMonitor } = require('../middleware/performance');
const cacheService = require('../helper/cache_service');
const { listProviders } = require('./provider_manager');

/**
 * Dashboard Service
 */
class DashboardService {
  /**
   * Get comprehensive dashboard statistics
   * @returns {object} Dashboard statistics
   */
  getStats() {
    const perfStats = performanceMonitor.getStats();
    const cacheStats = cacheService.getStats();
    const providers = listProviders();
    
    // Calculate provider health (simplified - can be enhanced)
    const providerHealth = providers.map(provider => ({
      id: provider.id,
      name: provider.name,
      enabled: provider.enabled,
      health: 'healthy' // Can be enhanced with actual health checks
    }));
    
    return {
      performance: perfStats,
      cache: cacheStats,
      providers: providerHealth,
      endpoints: perfStats.endpoints || {}
    };
  }
  
  /**
   * Get analytics data with time-series
   * @param {object} options - Query options
   * @param {string} options.period - Time period (1h, 24h, 7d, 30d)
   * @param {string} options.endpoint - Filter by endpoint
   * @returns {object} Analytics data
   */
  getAnalytics(options = {}) {
    const { period = '1h', endpoint } = options;
    
    // Calculate time range based on period
    const now = Date.now();
    let since = now;
    
    switch (period) {
      case '1h':
        since = now - (60 * 60 * 1000);
        break;
      case '24h':
        since = now - (24 * 60 * 60 * 1000);
        break;
      case '7d':
        since = now - (7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        since = now - (30 * 24 * 60 * 60 * 1000);
        break;
      default:
        since = now - (60 * 60 * 1000);
    }
    
    // Get time-series data
    const timeSeriesData = performanceMonitor.getTimeSeriesData({
      endpoint,
      since,
      limit: 500
    });
    
    // Aggregate data by time intervals
    const aggregated = this.aggregateByTime(timeSeriesData, period);
    
    // Calculate metrics
    const metrics = this.calculateMetrics(timeSeriesData);
    
    return {
      period,
      endpoint: endpoint || 'all',
      timeSeries: aggregated,
      metrics,
      dataPoints: timeSeriesData.length
    };
  }
  
  /**
   * Aggregate time-series data by time intervals
   * @param {Array} data - Time-series data
   * @param {string} period - Time period
   * @returns {Array} Aggregated data
   */
  aggregateByTime(data, period) {
    if (!data || data.length === 0) {
      return [];
    }
    
    // Determine interval based on period
    let intervalMs = 60000; // 1 minute default
    
    switch (period) {
      case '1h':
        intervalMs = 60000; // 1 minute
        break;
      case '24h':
        intervalMs = 15 * 60000; // 15 minutes
        break;
      case '7d':
        intervalMs = 60 * 60000; // 1 hour
        break;
      case '30d':
        intervalMs = 4 * 60 * 60000; // 4 hours
        break;
    }
    
    // Group data by time intervals
    const grouped = new Map();
    
    data.forEach(point => {
      const interval = Math.floor(point.timestamp / intervalMs) * intervalMs;
      
      if (!grouped.has(interval)) {
        grouped.set(interval, {
          timestamp: interval,
          responseTimes: [],
          requestCount: 0,
          cacheHits: 0,
          cacheMisses: 0,
          errors: 0
        });
      }
      
      const group = grouped.get(interval);
      group.responseTimes.push(point.responseTime);
      group.requestCount++;
      
      if (point.cached) {
        group.cacheHits++;
      } else {
        group.cacheMisses++;
      }
      
      if (point.error) {
        group.errors++;
      }
    });
    
    // Convert to array and calculate averages
    const aggregated = Array.from(grouped.values()).map(group => ({
      timestamp: group.timestamp,
      avgResponseTime: group.responseTimes.length > 0
        ? Math.round(group.responseTimes.reduce((a, b) => a + b, 0) / group.responseTimes.length)
        : 0,
      minResponseTime: group.responseTimes.length > 0 ? Math.min(...group.responseTimes) : 0,
      maxResponseTime: group.responseTimes.length > 0 ? Math.max(...group.responseTimes) : 0,
      requestCount: group.requestCount,
      cacheHitRate: (group.cacheHits + group.cacheMisses) > 0
        ? Math.round((group.cacheHits / (group.cacheHits + group.cacheMisses)) * 100 * 100) / 100
        : 0,
      errorRate: group.requestCount > 0
        ? Math.round((group.errors / group.requestCount) * 100 * 100) / 100
        : 0
    }));
    
    // Sort by timestamp
    aggregated.sort((a, b) => a.timestamp - b.timestamp);
    
    return aggregated;
  }
  
  /**
   * Calculate metrics from time-series data
   * @param {Array} data - Time-series data
   * @returns {object} Calculated metrics
   */
  calculateMetrics(data) {
    if (!data || data.length === 0) {
      return {
        avgResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        totalRequests: 0,
        cacheHitRate: 0,
        errorRate: 0
      };
    }
    
    const responseTimes = data.map(d => d.responseTime).sort((a, b) => a - b);
    const cacheHits = data.filter(d => d.cached).length;
    const cacheMisses = data.filter(d => !d.cached).length;
    const errors = data.filter(d => d.error).length;
    
    const avgResponseTime = Math.round(
      responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    );
    
    const p50 = responseTimes[Math.floor(responseTimes.length * 0.5)] || 0;
    const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)] || 0;
    const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)] || 0;
    
    const cacheHitRate = (cacheHits + cacheMisses) > 0
      ? Math.round((cacheHits / (cacheHits + cacheMisses)) * 100 * 100) / 100
      : 0;
    
    const errorRate = data.length > 0
      ? Math.round((errors / data.length) * 100 * 100) / 100
      : 0;
    
    return {
      avgResponseTime,
      minResponseTime: responseTimes[0] || 0,
      maxResponseTime: responseTimes[responseTimes.length - 1] || 0,
      p50,
      p95,
      p99,
      totalRequests: data.length,
      cacheHitRate,
      errorRate
    };
  }
  
  /**
   * Get real-time metrics snapshot
   * @returns {object} Real-time metrics
   */
  getRealtimeMetrics() {
    const perfStats = performanceMonitor.getStats();
    const cacheStats = cacheService.getStats();
    
    // Get recent time-series data (last 10 data points)
    const recentData = performanceMonitor.getTimeSeriesData({ limit: 10 });
    
    return {
      timestamp: Date.now(),
      performance: {
        totalRequests: perfStats.totalRequests,
        avgResponseTime: perfStats.avgResponseTime,
        cacheHitRate: perfStats.cacheHitRate,
        errorRate: perfStats.errorRate,
        recentResponseTime: recentData.length > 0
          ? Math.round(recentData.reduce((sum, d) => sum + d.responseTime, 0) / recentData.length)
          : 0
      },
      cache: {
        totalSize: cacheStats.total.size,
        active: cacheStats.total.active,
        hitRate: parseFloat(cacheStats.performance.hitRate) || 0
      },
      endpoints: Object.keys(perfStats.endpoints || {}).map(endpoint => ({
        endpoint,
        requestCount: perfStats.endpoints[endpoint].requestCount,
        avgResponseTime: perfStats.endpoints[endpoint].avgResponseTime,
        cacheHitRate: perfStats.endpoints[endpoint].cacheHitRate,
        errorRate: perfStats.endpoints[endpoint].errorRate
      }))
    };
  }
}

// Export singleton instance
const dashboardService = new DashboardService();

module.exports = dashboardService;

