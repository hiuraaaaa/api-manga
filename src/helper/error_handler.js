/**
 * Centralized error handling with error types and recovery strategies
 */

class AppError extends Error {
  constructor(message, statusCode, code, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

class NetworkError extends AppError {
  constructor(message = 'Network request failed', originalError = null) {
    super(message, 503, 'NETWORK_ERROR', true);
    this.originalError = originalError;
  }
}

class ParseError extends AppError {
  constructor(message = 'Failed to parse response', originalError = null) {
    super(message, 500, 'PARSE_ERROR', true);
    this.originalError = originalError;
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND', true);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed', errors = []) {
    super(message, 400, 'VALIDATION_ERROR', true);
    this.errors = errors;
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', true);
  }
}

/**
 * Error handler middleware for Express
 * @param {Error} err - Error object
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next function
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error for debugging
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    code: err.code,
    statusCode: err.statusCode,
    url: req.originalUrl,
    method: req.method
  });

  // Handle specific error types
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      code: err.code,
      message: err.message,
      data: err.errors || []
    });
  }

  // Handle axios errors
  if (err.response) {
    const statusCode = err.response.status;
    if (statusCode === 404) {
      error = new NotFoundError('Resource not found');
    } else if (statusCode >= 500) {
      error = new NetworkError('Server error', err);
    } else {
      error = new NetworkError(err.message || 'Request failed', err);
    }
    error.statusCode = statusCode;
  } else if (err.request) {
    error = new NetworkError('No response received from server', err);
  } else if (err.code === 'ECONNABORTED') {
    error = new NetworkError('Request timeout', err);
  } else if (err.message && err.message.includes('404')) {
    error = new NotFoundError('Resource not found');
  }

  // Default error
  if (!error.statusCode) {
    error.statusCode = 500;
    error.code = 'INTERNAL_ERROR';
  }

  res.status(error.statusCode).json({
    status: 'error',
    code: error.code || 'INTERNAL_ERROR',
    message: error.message || 'Internal server error',
    data: []
  });
};

/**
 * Async handler wrapper to catch errors in async routes
 * @param {function} fn - Async function
 * @returns {function} Wrapped function
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Retry strategy with exponential backoff
 * @param {function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delay - Initial delay in milliseconds
 * @returns {Promise} Promise that resolves or rejects
 */
const retryWithBackoff = async (fn, maxRetries = 3, delay = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error;
      }
      
      const backoffDelay = delay * Math.pow(2, i);
      console.log(`Retry attempt ${i + 1}/${maxRetries} after ${backoffDelay}ms`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }
};

module.exports = {
  AppError,
  NetworkError,
  ParseError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  errorHandler,
  asyncHandler,
  retryWithBackoff
};

