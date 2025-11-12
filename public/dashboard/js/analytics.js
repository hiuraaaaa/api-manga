/**
 * Analytics Computation Engine (Browser-Based)
 * Provides analytics computation functions for client-side processing
 */

const AnalyticsEngine = {
  /**
   * Calculate percentiles from data array
   * @param {Array<number>} data - Array of numeric values
   * @param {Array<number>} percentiles - Array of percentile values (e.g., [50, 95, 99])
   * @returns {object} Percentile values
   */
  calculatePercentiles(data, percentiles = [50, 95, 99]) {
    if (!Array.isArray(data) || data.length === 0) {
      return percentiles.reduce((acc, p) => {
        acc[`p${p}`] = 0;
        return acc;
      }, {});
    }

    const sorted = [...data].sort((a, b) => a - b);
    const result = {};

    percentiles.forEach(p => {
      const index = Math.ceil((p / 100) * sorted.length) - 1;
      result[`p${p}`] = sorted[Math.max(0, index)] || 0;
    });

    return result;
  },

  /**
   * Calculate moving average
   * @param {Array<number>} data - Array of numeric values
   * @param {number} window - Window size for moving average
   * @returns {Array<number>} Moving average values
   */
  calculateMovingAverage(data, window = 5) {
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    if (window >= data.length) {
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      return data.map(() => avg);
    }

    const result = [];
    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - Math.floor(window / 2));
      const end = Math.min(data.length, i + Math.ceil(window / 2));
      const slice = data.slice(start, end);
      const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
      result.push(avg);
    }

    return result;
  },

  /**
   * Detect anomalies in time-series data
   * Uses statistical methods (Z-score) to detect outliers
   * @param {Array<number>} data - Array of numeric values
   * @param {number} threshold - Z-score threshold (default: 2.5)
   * @returns {Array<object>} Array of anomalies with index and value
   */
  detectAnomalies(data, threshold = 2.5) {
    if (!Array.isArray(data) || data.length < 3) {
      return [];
    }

    // Calculate mean and standard deviation
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) {
      return [];
    }

    // Detect anomalies using Z-score
    const anomalies = [];
    data.forEach((value, index) => {
      const zScore = Math.abs((value - mean) / stdDev);
      if (zScore > threshold) {
        anomalies.push({
          index,
          value,
          zScore: zScore.toFixed(2),
          deviation: value > mean ? 'high' : 'low'
        });
      }
    });

    return anomalies;
  },

  /**
   * Aggregate data by time intervals
   * @param {Array<object>} data - Array of data points with timestamp
   * @param {string} interval - Time interval ('minute', 'hour', 'day')
   * @param {string} valueField - Field name to aggregate
   * @returns {Array<object>} Aggregated data
   */
  aggregateByTime(data, interval = 'minute', valueField = 'value') {
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    const intervalMs = {
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000
    }[interval] || 60 * 1000;

    const grouped = new Map();

    data.forEach(point => {
      const timestamp = point.timestamp || point.time || Date.now();
      const intervalKey = Math.floor(timestamp / intervalMs) * intervalMs;
      const value = point[valueField] || point.value || 0;

      if (!grouped.has(intervalKey)) {
        grouped.set(intervalKey, {
          timestamp: intervalKey,
          values: [],
          count: 0,
          sum: 0
        });
      }

      const group = grouped.get(intervalKey);
      group.values.push(value);
      group.count++;
      group.sum += value;
    });

    // Calculate aggregates
    return Array.from(grouped.values()).map(group => ({
      timestamp: group.timestamp,
      avg: group.sum / group.count,
      min: Math.min(...group.values),
      max: Math.max(...group.values),
      count: group.count,
      sum: group.sum
    })).sort((a, b) => a.timestamp - b.timestamp);
  },

  /**
   * Calculate trends (increasing, decreasing, stable)
   * @param {Array<number>} data - Array of numeric values
   * @returns {object} Trend analysis
   */
  calculateTrend(data) {
    if (!Array.isArray(data) || data.length < 2) {
      return { direction: 'stable', slope: 0, confidence: 0 };
    }

    // Simple linear regression
    const n = data.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = data;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared for confidence
    const yMean = sumY / n;
    const ssRes = y.reduce((sum, yi, i) => {
      const predicted = slope * x[i] + intercept;
      return sum + Math.pow(yi - predicted, 2);
    }, 0);
    const ssTot = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0);
    const rSquared = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;

    let direction = 'stable';
    if (Math.abs(slope) > 0.1) {
      direction = slope > 0 ? 'increasing' : 'decreasing';
    }

    return {
      direction,
      slope: slope.toFixed(4),
      intercept: intercept.toFixed(4),
      confidence: Math.max(0, Math.min(1, rSquared))
    };
  },

  /**
   * Calculate statistics summary
   * @param {Array<number>} data - Array of numeric values
   * @returns {object} Statistics summary
   */
  calculateStats(data) {
    if (!Array.isArray(data) || data.length === 0) {
      return {
        count: 0,
        sum: 0,
        mean: 0,
        median: 0,
        min: 0,
        max: 0,
        stdDev: 0,
        variance: 0
      };
    }

    const sorted = [...data].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / count;
    const median = count % 2 === 0
      ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
      : sorted[Math.floor(count / 2)];

    const variance = sorted.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / count;
    const stdDev = Math.sqrt(variance);

    return {
      count,
      sum,
      mean: mean.toFixed(2),
      median: median.toFixed(2),
      min: sorted[0],
      max: sorted[count - 1],
      stdDev: stdDev.toFixed(2),
      variance: variance.toFixed(2)
    };
  },

  /**
   * Format duration in milliseconds to human-readable string
   * @param {number} ms - Milliseconds
   * @returns {string} Formatted duration
   */
  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
    return `${(ms / 86400000).toFixed(1)}d`;
  },

  /**
   * Format timestamp to readable date
   * @param {number} timestamp - Unix timestamp
   * @returns {string} Formatted date
   */
  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString();
  }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AnalyticsEngine;
}

