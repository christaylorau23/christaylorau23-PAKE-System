import { Request, Response, NextFunction } from 'express';

const crypto = require('crypto');

// Use structured logger instead of console
let logger;
try {
  const { logger: structuredLogger } = require('../utils/logger');
  logger = structuredLogger;
} catch (error) {
  // Fallback to console if logger not available
  logger = {
    error: (msg, error, meta) => logger.error(msg, error, meta)
  };
}

/**
 * Secure Error Handler Middleware
 * Logs full error details internally but returns sanitized responses to clients
 */
const errorHandler = (err, req, res, next) => {
  // Generate unique error ID for tracking
  const errorId = crypto.randomUUID();
  
  // Use structured logging instead of console.error
  const errorLogger = req.logger || logger.withRequest(req);
  errorLogger.error('Application Error', err, {
    errorId,
    statusCode: err.statusCode,
    code: err.code,
    userId: req.user?.id,
    correlationId: req.id
  });

  // Determine safe response for client
  const safeError = sanitizeErrorForClient(err, errorId);
  
  res.status(safeError.statusCode).json(safeError.response);
};

/**
 * Sanitize error for client response - removes sensitive information
 */
function sanitizeErrorForClient(err, errorId) {
  let statusCode = 500;
  let clientMessage = 'An internal server error occurred';
  let errorCode = 'INTERNAL_ERROR';

  // PostgreSQL specific errors
  if (err.code === '23505') {
    statusCode = 409;
    clientMessage = 'A record with this information already exists';
    errorCode = 'DUPLICATE_RESOURCE';
  } else if (err.code === '23503') {
    statusCode = 404;
    clientMessage = 'Referenced resource not found';
    errorCode = 'RESOURCE_NOT_FOUND';
  } else if (err.code === '23502') {
    statusCode = 400;
    clientMessage = 'Required field is missing';
    errorCode = 'MISSING_REQUIRED_FIELD';
  } else if (err.code === '08006') {
    // Connection failure - don't reveal database details
    statusCode = 503;
    clientMessage = 'Service temporarily unavailable';
    errorCode = 'SERVICE_UNAVAILABLE';
  }

  // Authentication and Authorization errors
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    clientMessage = 'Invalid authentication token';
    errorCode = 'INVALID_TOKEN';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    clientMessage = 'Authentication token expired';
    errorCode = 'TOKEN_EXPIRED';
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    clientMessage = 'Authentication required';
    errorCode = 'AUTHENTICATION_REQUIRED';
  }

  // Validation errors
  else if (err.name === 'ValidationError') {
    statusCode = 400;
    clientMessage = 'Invalid input provided';
    errorCode = 'VALIDATION_ERROR';
    // Only include sanitized field names, not values
    if (err.errors) {
      const fields = Object.keys(err.errors).map(field => field.replace(/[^a-zA-Z0-9_]/g, ''));
      clientMessage = `Validation failed for fields: ${fields.join(', ')}`;
    }
  }

  // Rate limiting
  else if (err.name === 'TooManyRequestsError') {
    statusCode = 429;
    clientMessage = 'Too many requests, please try again later';
    errorCode = 'RATE_LIMIT_EXCEEDED';
  }

  // File system errors (avoid path disclosure)
  else if (err.code === 'ENOENT') {
    statusCode = 404;
    clientMessage = 'Requested resource not found';
    errorCode = 'RESOURCE_NOT_FOUND';
  } else if (err.code === 'EACCES') {
    statusCode = 403;
    clientMessage = 'Access denied';
    errorCode = 'ACCESS_DENIED';
  }

  // Custom application errors
  else if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
    statusCode = err.statusCode;
    clientMessage = err.message || clientMessage;
    errorCode = err.code || errorCode;
  }

  // Production vs Development response
  const isProduction = process.env.NODE_ENV === 'production';
  
  const response = {
    success: false,
    error: {
      message: clientMessage,
      code: errorCode,
      errorId: errorId
    }
  };

  // Include sanitized debugging info in development only
  if (!isProduction) {
    // Sanitize sensitive information even in development
    let sanitizedMessage = err.message;
    let sanitizedStack = err.stack?.split('\n').slice(0, 5) || [];

    // Remove sensitive patterns from development output
    const sensitivePatterns = [
      /\/var\/run\/postgresql/g,
      /\.s\.PGSQL\.\d+/g,
      /\/etc\/[a-zA-Z]+/g,
      /\/root\/[^\s]*/g,
      /\/home\/[^\/\s]*\/[^\s]*/g,
      /\/sensitive\/path/g,
      /socket/g,
      /password[^a-zA-Z0-9]*[^\s]*/gi,
      /secret[^a-zA-Z0-9]*[^\s]*/gi,
      /token[^a-zA-Z0-9]*[^\s]*/gi,
      /key[^a-zA-Z0-9]*[^\s]*/gi
    ];

    sensitivePatterns.forEach(pattern => {
      sanitizedMessage = sanitizedMessage.replace(pattern, '[REDACTED]');
      sanitizedStack = sanitizedStack.map(line => line.replace(pattern, '[REDACTED]'));
    });

    response.development = {
      originalMessage: sanitizedMessage,
      stack: sanitizedStack
    };
  }
  
  return { statusCode, response };
}

/**
 * Not Found Handler - for unmatched routes
 */
const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route ${req.originalUrl} not found`);
  error.statusCode = 404;
  error.code = 'ROUTE_NOT_FOUND';
  next(error);
};

/**
 * Async error wrapper to catch async/await errors
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler
};