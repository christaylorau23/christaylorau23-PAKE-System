const { Pool } = require('pg');
const { createClient } = require('redis');
const { getConfig } = require('./configLoader');
const CacheService = require('../services/CacheService');

// Load configuration
const config = getConfig();

// PostgreSQL connection using configuration
const dbConfig = config.getDatabaseConfig();
const pool = new Pool({
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.name,
  user: dbConfig.user,
  password: dbConfig.password,
  ssl: dbConfig.ssl,
  ...dbConfig.pool
});

// Redis connection using configuration
const redisConfig = config.getRedisConfig();
const redisClient = createClient({
  socket: {
    host: redisConfig.host,
    port: redisConfig.port,
  },
  password: redisConfig.password,
  db: redisConfig.db,
  maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
  retryDelayOnFailover: redisConfig.retryDelayOnFailover,
  enableOfflineQueue: redisConfig.enableOfflineQueue,
  connectTimeout: redisConfig.connectTimeout,
  lazyConnect: redisConfig.lazyConnect
});

/**
 * Structured logging helper
 */
function logError(context, error, metadata = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: 'ERROR',
    context,
    message: error.message,
    code: error.code,
    name: error.name,
    ...metadata
  };
  logger.error('Database Error:', JSON.stringify(logEntry, null, 2));
}

// Connect to PostgreSQL
async function connectDB() {
  try {
    await pool.connect();
    logger.info('✅ Connected to PostgreSQL');
  } catch (error) {
    // Log full error internally without exposing sensitive details
    logError('PostgreSQL Connection', error, {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME
    });
    
    // Create sanitized error for application layer
    const dbError = new Error('Database connection failed');
    dbError.name = 'DatabaseConnectionError';
    dbError.code = error.code || 'DB_CONNECTION_FAILED';
    dbError.statusCode = 503;
    throw dbError;
  }
}

// Connect to Redis with optional fallback
async function connectRedis(): boolean {
  try {
    await redisClient.connect();
    logger.info('✅ Connected to Redis');
    return true;
  } catch (error) {
    // Log full error internally
    logError('Redis Connection', error, {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT
    });
    
    // In development, allow graceful fallback
    if (process.env.NODE_ENV === 'development') {
      logger.warn('⚠️  Redis unavailable - running without cache in development mode');
      return false;
    }
    
    // Create sanitized error for production
    const redisError = new Error('Cache service connection failed');
    redisError.name = 'CacheConnectionError';
    redisError.code = 'REDIS_CONNECTION_FAILED';
    redisError.statusCode = 503;
    throw redisError;
  }
}

// Redis helper functions with specific error handling
const redis = {
  async get(key) {
    try {
      return await redisClient.get(key);
    } catch (error) {
      logError('Redis GET Operation', error, { key: key?.substring(0, 50) });
      
      // Determine specific error type
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        const redisError = new Error('Cache service unavailable');
        redisError.name = 'CacheUnavailableError';
        redisError.code = 'CACHE_UNAVAILABLE';
        redisError.statusCode = 503;
        throw redisError;
      }
      
      // For other Redis errors, return null (cache miss fallback)
      return null;
    }
  },

  async set(key, value, ttl = null) {
    try {
      if (typeof value === 'object') {
        value = JSON.stringify(value);
      }
      // Use configuration for TTL if not provided
      const cacheTtl = ttl || config.getCacheTTL();
      return await redisClient.setEx(key, cacheTtl, value);
    } catch (error) {
      logError('Redis SET Operation', error, { 
        key: key?.substring(0, 50),
        valueType: typeof value,
        ttl 
      });
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        const redisError = new Error('Cache service unavailable');
        redisError.name = 'CacheUnavailableError';
        redisError.code = 'CACHE_UNAVAILABLE';
        redisError.statusCode = 503;
        throw redisError;
      }
      
      // For other errors, return null (cache write failed gracefully)
      return null;
    }
  },

  async del(key) {
    try {
      return await redisClient.del(key);
    } catch (error) {
      logError('Redis DEL Operation', error, { key: key?.substring(0, 50) });
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        const redisError = new Error('Cache service unavailable');
        redisError.name = 'CacheUnavailableError';
        redisError.code = 'CACHE_UNAVAILABLE';
        redisError.statusCode = 503;
        throw redisError;
      }
      
      return null;
    }
  },

  async exists(key) {
    try {
      return await redisClient.exists(key);
    } catch (error) {
      logError('Redis EXISTS Operation', error, { key: key?.substring(0, 50) });
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        const redisError = new Error('Cache service unavailable');
        redisError.name = 'CacheUnavailableError';
        redisError.code = 'CACHE_UNAVAILABLE';
        redisError.statusCode = 503;
        throw redisError;
      }
      
      // Default to false for cache miss
      return false;
    }
  }
};

// Create CacheService instance - will handle Redis unavailability gracefully
let cacheService;
try {
  cacheService = new CacheService(redisClient);
} catch (error) {
  // Fallback to no-cache service in development
  logger.warn('⚠️  Creating CacheService without Redis client');
  cacheService = new CacheService(null);
}

module.exports = {
  pool,
  connectDB,
  connectRedis,
  redis,
  cacheService,
};