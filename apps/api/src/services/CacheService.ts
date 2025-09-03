const { getConfig } = require('../config/configLoader');

/**
 * Centralized Cache Service with pattern-based invalidation
 * 
 * Provides a consistent interface for Redis caching operations with:
 * - Standardized key naming conventions
 * - Pattern-based cache invalidation using SCAN + DEL
 * - Graceful fallback when Redis is unavailable
 * - TTL management and configuration integration
 */
class CacheService {
  constructor(redisClient) {
    this.redis = redisClient;
    this.config = getConfig();
    this.isAvailable = !!redisClient; // Only available if Redis client is provided
    
    // Cache key naming conventions
    this.keyPatterns = {
      userTasks: (userId, filters) => `user:${userId}:tasks:${this._hashFilters(filters)}`,
      userTasksAll: (userId) => `user:${userId}:tasks:all`,
      userTask: (userId, taskId) => `user:${userId}:task:${taskId}`,
      userStats: (userId) => `user:${userId}:stats`,
      userCategories: (userId) => `user:${userId}:categories`,
      userTasksByCategory: (userId, categoryId) => `user:${userId}:tasks:category:${categoryId}`
    };
    
    // TTL configurations
    this.ttl = {
      short: 300,    // 5 minutes - frequently changing data
      medium: 1800,  // 30 minutes - standard queries
      long: 7200,    // 2 hours - relatively static data
      default: this.config.getCacheTTL() || 1800
    };
  }

  /**
   * Generate a consistent hash for filter objects
   */
  _hashFilters(filters) {
    if (!filters || typeof filters !== 'object') {
      return 'default';
    }
    
    // Sort keys to ensure consistent hashing
    const sortedKeys = Object.keys(filters).sort();
    const hashParts = sortedKeys.map(key => `${key}:${filters[key]}`);
    return hashParts.join('|') || 'default';
  }

  /**
   * Handle Redis errors gracefully
   */
  _handleError(operation, error, key = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      context: `CacheService ${operation}`,
      message: error.message,
      code: error.code,
      key: key?.substring(0, 50)
    };
    logger.error('Cache Error:', JSON.stringify(logEntry, null, 2));
    
    // Mark service as unavailable for connection errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      this.isAvailable = false;
      const cacheError = new Error('Cache service unavailable');
      cacheError.name = 'CacheUnavailableError';
      cacheError.code = 'CACHE_UNAVAILABLE';
      cacheError.statusCode = 503;
      throw cacheError;
    }
    
    // For other errors, return null (graceful degradation)
    return null;
  }

  /**
   * Check if cache service is available
   */
  isHealthy() {
    return this.isAvailable && this.redis;
  }

  /**
   * Get value from cache
   */
  async get(key) {
    if (!this.isHealthy()) {
      return null;
    }
    
    try {
      const result = await this.redis.get(key);
      return result ? JSON.parse(result) : null;
    } catch (error) {
      return this._handleError('GET', error, key);
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set(key, value, ttl = null) {
    if (!this.isHealthy()) {
      return false;
    }
    
    try {
      const cacheValue = typeof value === 'string' ? value : JSON.stringify(value);
      const cacheTtl = ttl || this.ttl.default;
      await this.redis.setEx(key, cacheTtl, cacheValue);
      return true;
    } catch (error) {
      this._handleError('SET', error, key);
      return false;
    }
  }

  /**
   * Delete single key from cache
   */
  async del(key) {
    if (!this.isHealthy()) {
      return false;
    }
    
    try {
      const result = await this.redis.del(key);
      return result > 0;
    } catch (error) {
      this._handleError('DEL', error, key);
      return false;
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key) {
    if (!this.isHealthy()) {
      return false;
    }
    
    try {
      const result = await this.redis.exists(key);
      return result > 0;
    } catch (error) {
      this._handleError('EXISTS', error, key);
      return false;
    }
  }

  /**
   * Pattern-based cache invalidation using SCAN + DEL
   * This is the core method for efficient cache invalidation
   */
  async invalidateCachePattern(pattern) {
    if (!this.isHealthy()) {
      return { deleted: 0, error: 'Cache service unavailable' };
    }
    
    try {
      let cursor = '0';
      let deletedCount = 0;
      const batchSize = 100; // Process keys in batches
      
      do {
        // Use SCAN to find matching keys
        const scanResult = await this.redis.scan(cursor, {
          MATCH: pattern,
          COUNT: batchSize
        });
        
        cursor = scanResult.cursor;
        const keys = scanResult.keys;
        
        if (keys.length > 0) {
          // Delete keys in batch
          const deleteResult = await this.redis.del(keys);
          deletedCount += deleteResult;
        }
        
      } while (cursor !== '0');
      
      return { 
        deleted: deletedCount, 
        pattern: pattern,
        success: true 
      };
      
    } catch (error) {
      const errorResult = this._handleError('INVALIDATE_PATTERN', error, pattern);
      return { 
        deleted: 0, 
        pattern: pattern, 
        error: error.message,
        success: false 
      };
    }
  }

  /**
   * User-specific cache operations using consistent naming
   */
  
  // Get user tasks with filters
  async getUserTasks(userId, filters = {}) {
    const key = this.keyPatterns.userTasks(userId, filters);
    return await this.get(key);
  }

  // Set user tasks with filters
  async setUserTasks(userId, filters = {}, data, ttl = null) {
    const key = this.keyPatterns.userTasks(userId, filters);
    return await this.set(key, data, ttl || this.ttl.short);
  }

  // Get specific user task
  async getUserTask(userId, taskId) {
    const key = this.keyPatterns.userTask(userId, taskId);
    return await this.get(key);
  }

  // Set specific user task
  async setUserTask(userId, taskId, data, ttl = null) {
    const key = this.keyPatterns.userTask(userId, taskId);
    return await this.set(key, data, ttl || this.ttl.medium);
  }

  // Get user statistics
  async getUserStats(userId) {
    const key = this.keyPatterns.userStats(userId);
    return await this.get(key);
  }

  // Set user statistics
  async setUserStats(userId, stats, ttl = null) {
    const key = this.keyPatterns.userStats(userId);
    return await this.set(key, stats, ttl || this.ttl.long);
  }

  /**
   * Invalidate all user-related caches
   */
  async invalidateUserCache(userId) {
    const pattern = `user:${userId}:*`;
    return await this.invalidateCachePattern(pattern);
  }

  /**
   * Invalidate user task caches (for when tasks are modified)
   */
  async invalidateUserTasksCache(userId) {
    const pattern = `user:${userId}:tasks:*`;
    return await this.invalidateCachePattern(pattern);
  }

  /**
   * Invalidate specific task cache
   */
  async invalidateUserTask(userId, taskId) {
    const key = this.keyPatterns.userTask(userId, taskId);
    return await this.del(key);
  }

  /**
   * Bulk invalidation for multiple patterns
   */
  async invalidateMultiplePatterns(patterns) {
    if (!Array.isArray(patterns)) {
      patterns = [patterns];
    }
    
    const results = [];
    for (const pattern of patterns) {
      const result = await this.invalidateCachePattern(pattern);
      results.push(result);
    }
    
    return {
      patterns: patterns,
      results: results,
      totalDeleted: results.reduce((sum, result) => sum + (result.deleted || 0), 0)
    };
  }

  /**
   * Get cache statistics
   */
  async getStats() {
    if (!this.isHealthy()) {
      return { available: false, error: 'Cache service unavailable' };
    }
    
    try {
      const info = await this.redis.info('memory');
      const keyspaceInfo = await this.redis.info('keyspace');
      
      return {
        available: true,
        isHealthy: this.isAvailable,
        memory: info,
        keyspace: keyspaceInfo,
        ttlConfig: this.ttl
      };
    } catch (error) {
      return { available: false, error: error.message };
    }
  }
}

module.exports = CacheService;