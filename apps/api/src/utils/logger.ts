import { Request, Response, NextFunction } from 'express';

/**
 * Structured Logger for Task Manager API
 * Winston-based JSON logger with timestamp, level, service name, and correlation IDs
 */

const winston = require('winston');
const { getConfig } = require('../config/configLoader');
const { getServiceConfig } = require('../config/serviceConfig');

// Get configuration
const config = getConfig();
const serviceConfig = getServiceConfig();
const loggingConfig = config.getLoggingConfig();

/**
 * Custom JSON formatter with consistent structure
 */
const jsonFormatter = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DDTHH:mm:ss.SSSZ'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, service, correlationId, userId, requestId, duration, statusCode, method, url, stack, ...meta }) => {
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      service: service || 'task-manager-api',
      message,
      ...(correlationId && { correlationId }),
      ...(userId && { userId }),
      ...(requestId && { requestId }),
      ...(duration !== undefined && { duration }),
      ...(statusCode && { statusCode }),
      ...(method && { method }),
      ...(url && { url }),
      ...(stack && { stack }),
      ...meta
    };
    return JSON.stringify(logEntry);
  })
);

/**
 * Console formatter for development
 */
const consoleFormatter = winston.format.combine(
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, service, correlationId, duration, statusCode, method, url, stack }) => {
    let logLine = `${timestamp} [${service || 'task-api'}] ${level}: ${message}`;
    
    if (method && url) {
      logLine += ` | ${method} ${url}`;
    }
    if (statusCode) {
      logLine += ` | ${statusCode}`;
    }
    if (duration) {
      logLine += ` | ${duration}ms`;
    }
    if (correlationId) {
      logLine += ` | ${correlationId}`;
    }
    if (stack) {
      logLine += `\n${stack}`;
    }
    
    return logLine;
  })
);

/**
 * Create Winston logger instance
 */
const logger = winston.createLogger({
  level: loggingConfig.level || 'info',
  format: jsonFormatter,
  defaultMeta: {
    service: 'task-manager-api',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    hostname: require('os').hostname(),
    pid: process.pid
  },
  transports: [],
  exitOnError: false
});

// Console transport
if (loggingConfig.console_logging?.enabled !== false) {
  const consoleTransport = new winston.transports.Console({
    format: serviceConfig.getEnvironmentInfo().isDevelopment ? consoleFormatter : jsonFormatter,
    handleExceptions: true,
    handleRejections: true
  });
  logger.add(consoleTransport);
}

// File transport (if enabled)
if (loggingConfig.file_logging?.enabled) {
  const fileTransport = new winston.transports.File({
    filename: loggingConfig.file_logging.filename || 'task-manager.log',
    format: jsonFormatter,
    maxsize: parseSize(loggingConfig.file_logging.max_size || '10m'),
    maxFiles: loggingConfig.file_logging.max_files || 5,
    tailable: true,
    handleExceptions: true,
    handleRejections: true
  });
  logger.add(fileTransport);
}

/**
 * Parse file size string (e.g., "10m", "1g")
 */
function parseSize(sizeStr) {
  const units = { k: 1024, m: 1024 * 1024, g: 1024 * 1024 * 1024 };
  const match = sizeStr.toString().toLowerCase().match(/^(\d+)([kmg]?)$/);
  if (!match) return 10 * 1024 * 1024; // Default 10MB
  
  const [, size, unit] = match;
  return parseInt(size) * (units[unit] || 1);
}

/**
 * Enhanced logging methods with context support
 */
class Logger {
  constructor(baseLogger = logger) {
    this.logger = baseLogger;
    this.context = {};
  }

  /**
   * Create child logger with additional context
   */
  child(context = {}) {
    const childLogger = new Logger(this.logger);
    childLogger.context = { ...this.context, ...context };
    return childLogger;
  }

  /**
   * Set correlation ID for request tracking
   */
  withCorrelationId(correlationId) {
    return this.child({ correlationId });
  }

  /**
   * Set user context for audit logging
   */
  withUser(userId, username = null) {
    return this.child({ 
      userId, 
      ...(username && { username }) 
    });
  }

  /**
   * Set request context for API logging
   */
  withRequest(req) {
    return this.child({
      requestId: req.id || req.headers['x-request-id'],
      method: req.method,
      url: req.originalUrl || req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      ...(req.user?.id && { userId: req.user.id })
    });
  }

  /**
   * Log levels
   */
  debug(message, meta = {}) {
    this.logger.debug(message, { ...this.context, ...meta });
  }

  info(message, meta = {}) {
    this.logger.info(message, { ...this.context, ...meta });
  }

  warn(message, meta = {}) {
    this.logger.warn(message, { ...this.context, ...meta });
  }

  error(message, error = null, meta = {}) {
    const errorMeta = error ? {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code
      }
    } : {};
    
    this.logger.error(message, { 
      ...this.context, 
      ...errorMeta, 
      ...meta 
    });
  }

  /**
   * Structured logging methods for specific use cases
   */
  
  /**
   * Log HTTP request/response
   */
  http(message, { method, url, statusCode, duration, userId, error } = {}) {
    const level = this.getHttpLogLevel(statusCode, error);
    const meta = {
      method,
      url,
      statusCode,
      duration,
      ...(userId && { userId }),
      ...(error && { 
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        }
      })
    };
    
    this.logger.log(level, message, { ...this.context, ...meta });
  }

  /**
   * Log database operations
   */
  database(message, { operation, table, duration, rowCount, error } = {}) {
    const level = error ? 'error' : 'debug';
    const meta = {
      database: {
        operation,
        table,
        duration,
        rowCount
      },
      ...(error && {
        error: {
          name: error.name,
          message: error.message,
          code: error.code
        }
      })
    };
    
    this.logger.log(level, message, { ...this.context, ...meta });
  }

  /**
   * Log security events
   */
  security(message, { event, userId, ip, userAgent, success, reason } = {}) {
    const level = success ? 'info' : 'warn';
    const meta = {
      security: {
        event,
        success,
        reason
      },
      ...(userId && { userId }),
      ...(ip && { ip }),
      ...(userAgent && { userAgent })
    };
    
    this.logger.log(level, message, { ...this.context, ...meta });
  }

  /**
   * Log business events
   */
  business(message, { event, userId, entityType, entityId, action, metadata } = {}) {
    const meta = {
      business: {
        event,
        entityType,
        entityId,
        action,
        metadata
      },
      ...(userId && { userId })
    };
    
    this.logger.info(message, { ...this.context, ...meta });
  }

  /**
   * Get appropriate log level for HTTP status codes
   */
  getHttpLogLevel(statusCode, error) {
    if (error) return 'error';
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    if (statusCode >= 300) return 'info';
    return 'info';
  }

  /**
   * Performance timing helper
   */
  time(label) {
    const startTime = Date.now();
    return {
      end: (message = `Timer ${label} completed`, meta = {}) => {
        const duration = Date.now() - startTime;
        this.info(message, { ...meta, duration, timer: label });
        return duration;
      }
    };
  }
}

/**
 * Create default logger instance
 */
const defaultLogger = new Logger();

/**
 * Express middleware for request logging
 */
function requestLogging(options = {}) {
  return (req, res, next) => {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] || 
                     req.headers['x-correlation-id'] || 
                     require('crypto').randomUUID();
    
    // Add request ID to headers
    req.id = requestId;
    res.set('X-Request-ID', requestId);
    
    // Create request logger
    req.logger = defaultLogger.withRequest(req);
    
    // Log request start
    if (options.logRequests !== false) {
      req.logger.http('HTTP Request', {
        method: req.method,
        url: req.originalUrl || req.url,
        userAgent: req.get('User-Agent'),
        contentLength: req.get('Content-Length')
      });
    }
    
    // Log response when finished
    const originalSend = res.send;
    res.send = function(data) {
      const duration = Date.now() - startTime;
      
      if (options.logResponses !== false) {
        req.logger.http('HTTP Response', {
          method: req.method,
          url: req.originalUrl || req.url,
          statusCode: res.statusCode,
          duration,
          contentLength: res.get('Content-Length')
        });
      }
      
      return originalSend.call(this, data);
    };
    
    next();
  };
}

/**
 * Global error handler integration
 */
function errorLogging(err, req, res, next) {
  const logger = req.logger || defaultLogger;
  
  logger.error('Unhandled Error', err, {
    method: req.method,
    url: req.originalUrl || req.url,
    statusCode: res.statusCode,
    userId: req.user?.id
  });
  
  next(err);
}

/**
 * Graceful shutdown logging
 */
function setupGracefulShutdown() {
  const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
  
  signals.forEach(signal => {
    process.on(signal, () => {
      defaultLogger.info('Received shutdown signal', { signal });
      
      // Close Winston transports gracefully
      logger.close(() => {
        process.exit(0);
      });
    });
  });
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    defaultLogger.error('Uncaught Exception', error);
    process.exit(1);
  });
  
  // Handle unhandled rejections
  process.on('unhandledRejection', (reason, promise) => {
    defaultLogger.error('Unhandled Rejection', reason, {
      promise: promise.toString()
    });
  });
}

module.exports = {
  Logger,
  logger: defaultLogger,
  requestLogging,
  errorLogging,
  setupGracefulShutdown
};