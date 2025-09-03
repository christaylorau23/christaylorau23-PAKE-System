const { pool, redis, connectDB, connectRedis } = require('../config/database');
const { logger } = require('../utils/logger');

/**
 * Central Data Access Layer (DAL)
 * Provides unified access to all data stores with consistent caching and error handling
 */
class DataAccessLayer {
  constructor() {
    this.pool = pool;
    this.redis = redis;
    this.logger = logger;
    this.repositories = new Map();
    this.isInitialized = false;
    this.cacheTTL = {
      short: 300,    // 5 minutes
      medium: 1800,  // 30 minutes
      long: 7200     // 2 hours
    };
  }

  /**
   * Initialize the Data Access Layer
   */
  async initialize() {
    try {
      this.logger.info('Initializing Data Access Layer');
      
      // Connect to databases
      await connectDB();
      await connectRedis();
      
      this.isInitialized = true;
      this.logger.info('Data Access Layer initialized successfully');
      
    } catch (error) {
      this.logger.error('Failed to initialize Data Access Layer', { error: error.message });
      throw error;
    }
  }

  /**
   * Register a repository with the DAL
   */
  registerRepository(name, repositoryInstance) {
    if (!repositoryInstance) {
      throw new Error(`Repository instance is required for ${name}`);
    }
    
    // Inject DAL dependencies into the repository
    repositoryInstance.setDAL(this);
    
    this.repositories.set(name, repositoryInstance);
    this.logger.info('Repository registered', { name, type: repositoryInstance.constructor.name });
    
    return repositoryInstance;
  }

  /**
   * Get a registered repository by name
   */
  getRepository(name) {
    const repository = this.repositories.get(name);
    if (!repository) {
      throw new Error(`Repository '${name}' not found. Available repositories: ${Array.from(this.repositories.keys()).join(', ')}`);
    }
    return repository;
  }

  /**
   * Execute a database transaction
   */
  async executeTransaction(callback) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      this.logger.debug('Transaction started');
      
      const result = await callback(client);
      
      await client.query('COMMIT');
      this.logger.debug('Transaction committed');
      
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Transaction rolled back', { error: error.message });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cache management methods
   */
  async getCached(key) {
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        this.logger.debug('Cache hit', { key: key.substring(0, 50) });
        return JSON.parse(cached);
      }
      this.logger.debug('Cache miss', { key: key.substring(0, 50) });
      return null;
    } catch (error) {
      this.logger.warn('Cache read error', { key: key.substring(0, 50), error: error.message });
      return null;
    }
  }

  async setCached(key, data, ttl = this.cacheTTL.medium) {
    try {
      await this.redis.set(key, JSON.stringify(data), ttl);
      this.logger.debug('Cache set', { key: key.substring(0, 50), ttl });
      return true;
    } catch (error) {
      this.logger.warn('Cache write error', { key: key.substring(0, 50), error: error.message });
      return false;
    }
  }

  async deleteCached(key) {
    try {
      await this.redis.del(key);
      this.logger.debug('Cache deleted', { key: key.substring(0, 50) });
      return true;
    } catch (error) {
      this.logger.warn('Cache delete error', { key: key.substring(0, 50), error: error.message });
      return false;
    }
  }

  /**
   * Cache invalidation patterns
   */
  async invalidateCache(patterns) {
    const invalidationPromises = [];
    
    for (const pattern of Array.isArray(patterns) ? patterns : [patterns]) {
      invalidationPromises.push(this.deleteCached(pattern));
    }
    
    try {
      await Promise.all(invalidationPromises);
      this.logger.info('Cache invalidated', { patterns });
    } catch (error) {
      this.logger.error('Cache invalidation error', { patterns, error: error.message });
    }
  }

  /**
   * Advanced cache invalidation with pattern matching
   * Note: Redis SCAN would be ideal for production, but for now we track keys
   */
  async invalidateCachePattern(pattern) {
    try {
      // This is a simplified version. In production, use Redis SCAN
      // For now, we'll implement a key tracking system
      this.logger.info('Cache pattern invalidation requested', { pattern });
      
      // If we had key tracking, we'd iterate through matching keys
      // For the current implementation, we'll just delete the specific pattern
      await this.deleteCached(pattern);
      
    } catch (error) {
      this.logger.error('Cache pattern invalidation error', { pattern, error: error.message });
    }
  }

  /**
   * Bulk cache operations
   */
  async bulkSetCache(entries) {
    const promises = entries.map(({ key, data, ttl }) => 
      this.setCached(key, data, ttl)
    );
    
    try {
      await Promise.all(promises);
      this.logger.info('Bulk cache set completed', { count: entries.length });
      return true;
    } catch (error) {
      this.logger.error('Bulk cache set error', { count: entries.length, error: error.message });
      return false;
    }
  }

  async bulkDeleteCache(keys) {
    const promises = keys.map(key => this.deleteCached(key));
    
    try {
      await Promise.all(promises);
      this.logger.info('Bulk cache delete completed', { count: keys.length });
      return true;
    } catch (error) {
      this.logger.error('Bulk cache delete error', { count: keys.length, error: error.message });
      return false;
    }
  }

  /**
   * Generate standardized cache keys
   */
  generateCacheKey(namespace, ...parts) {
    const sanitizedParts = parts
      .filter(part => part !== null && part !== undefined)
      .map(part => String(part).replace(/[^a-zA-Z0-9_-]/g, '_'));
    
    return `${namespace}:${sanitizedParts.join(':')}`;
  }

  /**
   * Execute database query with optional caching
   */
  async query(sql, params = [], options = {}) {
    const { cache = false, cacheKey, cacheTTL = this.cacheTTL.medium } = options;
    
    // Try cache first if enabled
    if (cache && cacheKey) {
      const cached = await this.getCached(cacheKey);
      if (cached) {
        return { rows: cached, fromCache: true };
      }
    }

    try {
      this.logger.debug('Executing query', { sql: sql.substring(0, 100) });
      
      const result = await this.pool.query(sql, params);
      
      // Cache result if requested
      if (cache && cacheKey && result.rows) {
        await this.setCached(cacheKey, result.rows, cacheTTL);
      }
      
      this.logger.debug('Query executed successfully', { rowCount: result.rowCount });
      
      return { rows: result.rows, rowCount: result.rowCount, fromCache: false };
      
    } catch (error) {
      this.logger.error('Database query error', { 
        sql: sql.substring(0, 100),
        params: params.length,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Health check for all data stores
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      checks: {
        database: { status: 'unknown' },
        redis: { status: 'unknown' }
      },
      timestamp: new Date().toISOString()
    };

    // Check PostgreSQL
    try {
      await this.pool.query('SELECT 1');
      health.checks.database.status = 'healthy';
    } catch (error) {
      health.checks.database.status = 'unhealthy';
      health.checks.database.error = error.message;
      health.status = 'degraded';
    }

    // Check Redis
    try {
      await this.redis.get('health_check');
      health.checks.redis.status = 'healthy';
    } catch (error) {
      health.checks.redis.status = 'unhealthy';
      health.checks.redis.error = error.message;
      health.status = 'degraded';
    }

    return health;
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    try {
      this.logger.info('Shutting down Data Access Layer');
      
      // Close all database connections
      await this.pool.end();
      
      // Note: Redis client should be closed by the application
      
      this.isInitialized = false;
      this.logger.info('Data Access Layer shutdown complete');
      
    } catch (error) {
      this.logger.error('Error during DAL shutdown', { error: error.message });
      throw error;
    }
  }

  /**
   * Get data store statistics
   */
  async getStats() {
    const stats = {
      database: {
        totalConnections: this.pool.totalCount,
        idleConnections: this.pool.idleCount,
        waitingClients: this.pool.waitingCount
      },
      repositories: Array.from(this.repositories.keys())
    };

    return stats;
  }
}

// Singleton instance
const dal = new DataAccessLayer();

module.exports = {
  DataAccessLayer,
  dal
};