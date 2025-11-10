const axios = require('axios');
const { NetworkError, NotFoundError, retryWithBackoff } = require('./error_handler');

// User agents for rotation
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
];

let userAgentIndex = 0;

/**
 * Get next user agent in rotation
 * @returns {string} User agent string
 */
const getNextUserAgent = () => {
  const userAgent = userAgents[userAgentIndex];
  userAgentIndex = (userAgentIndex + 1) % userAgents.length;
  return userAgent;
};

// Create axios instance with default configuration
const axiosInstance = axios.create({
  timeout: 30000, // 30 seconds timeout
  headers: {
    'User-Agent': getNextUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'max-age=0'
  },
  maxRedirects: 5,
  validateStatus: (status) => status >= 200 && status < 500, // Don't throw on 4xx
  httpAgent: new (require('http').Agent)({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50,
    maxFreeSockets: 10
  }),
  httpsAgent: new (require('https').Agent)({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 50,
    maxFreeSockets: 10,
    rejectUnauthorized: true
  })
});

/**
 * Enhanced Axios Service with retry, timeout, and error handling
 * @param {string} url - URL to fetch
 * @param {object} options - Additional options
 * @param {number} options.timeout - Request timeout in milliseconds
 * @param {number} options.retries - Number of retries
 * @param {boolean} options.rotateUserAgent - Whether to rotate user agent
 * @returns {Promise} Axios response
 */
const AxiosService = async (url, options = {}) => {
  const {
    timeout = 30000,
    retries = 3,
    rotateUserAgent = true
  } = options;

  // Validate URL
  if (!url || typeof url !== 'string') {
    throw new NetworkError('Invalid URL provided');
  }

  // Encode URL
  const encodedUrl = encodeURI(url);

  // Create request config
  const config = {
    timeout,
    headers: {}
  };

  // Rotate user agent if enabled
  if (rotateUserAgent) {
    config.headers['User-Agent'] = getNextUserAgent();
  }

  // Merge with options config
  if (options.headers) {
    config.headers = { ...config.headers, ...options.headers };
  }

  try {
    // Retry with exponential backoff
    const response = await retryWithBackoff(
      async () => {
        const res = await axiosInstance.get(encodedUrl, config);
        
        // Check if response is successful
        if (res.status === 404) {
          throw new NotFoundError('Resource not found');
        } else if (res.status >= 400) {
          throw new NetworkError(`Request failed with status code ${res.status}`);
        }

        return res;
      },
      retries,
      1000 // Initial delay of 1 second
    );

    return response;
  } catch (error) {
    // Handle different error types
    if (error instanceof NetworkError) {
      throw error;
    }

    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const message = error.response.statusText || 'Request failed';
      
      if (status === 404) {
        throw new NotFoundError('Resource not found');
      } else if (status >= 500) {
        throw new NetworkError('Server error');
      } else {
        throw new NetworkError(message);
      }
    } else if (error.request) {
      // Request was made but no response received
      throw new NetworkError('No response received from server');
    } else if (error.code === 'ECONNABORTED') {
      // Timeout
      throw new NetworkError('Request timeout');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      // Connection errors
      throw new NetworkError('Connection failed');
    } else if (error instanceof NotFoundError) {
      // Preserve NotFoundError
      throw error;
    } else {
      // Other errors
      throw new NetworkError(error.message || 'Unknown error occurred');
    }
  }
};

/**
 * Batch request multiple URLs
 * @param {string[]} urls - Array of URLs to fetch
 * @param {object} options - Additional options
 * @param {number} options.concurrent - Number of concurrent requests
 * @returns {Promise<Array>} Array of responses
 */
const batchRequest = async (urls, options = {}) => {
  const { concurrent = 5 } = options;
  const results = [];
  
  for (let i = 0; i < urls.length; i += concurrent) {
    const batch = urls.slice(i, i + concurrent);
    const batchResults = await Promise.allSettled(
      batch.map(url => AxiosService(url, options))
    );
    
    results.push(...batchResults.map((result, index) => ({
      url: batch[index],
      success: result.status === 'fulfilled',
      data: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason : null
    })));
  }
  
  return results;
};

module.exports = {
  AxiosService,
  batchRequest,
  axiosInstance
};
