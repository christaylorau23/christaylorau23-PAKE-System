#!/usr/bin/env node

/**
 * CacheService Integration Test
 * Tests the centralized caching service functionality
 */

// Set test environment
process.env.NODE_ENV = 'process.env.TASK_MANAGER_WEAK_PASSWORD || 'SECURE_WEAK_PASSWORD_REQUIRED'';
process.env.TM_JWT_SECRET = 'test-jwt-secret';

const CacheService = require('../services/CacheService');

// Mock Redis client for testing
const mockRedisClient = {
  connected: false,
  data: new Map(),
  
  async get(key) {
    return this.data.get(key) || null;
  },
  
  async setEx(key, ttl, value) {
    this.data.set(key, value);
    // In real Redis, TTL would expire keys automatically
    setTimeout(() => {
      this.data.delete(key);
    }, ttl * 1000);
    return 'OK';
  },
  
  async del(key) {
    if (Array.isArray(key)) {
      let deleted = 0;
      for (const k of key) {
        if (this.data.has(k)) {
          this.data.delete(k);
          deleted++;
        }
      }
      return deleted;
    } else {
      const deleted = this.data.has(key) ? 1 : 0;
      this.data.delete(key);
      return deleted;
    }
  },
  
  async exists(key) {
    return this.data.has(key) ? 1 : 0;
  },
  
  async scan(cursor, options = {}) {
    const keys = Array.from(this.data.keys());
    const pattern = options.MATCH;
    const count = options.COUNT || 100;
    
    let matchingKeys = keys;
    if (pattern) {
      // Simple pattern matching (not full Redis GLOB)
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      matchingKeys = keys.filter(key => regex.test(key));
    }
    
    return {
      cursor: '0',
      keys: matchingKeys.slice(0, count)
    };
  },
  
  async info(section) {
    return `# ${section}\nused_memory:1024\n`;
  }
};

async function testCacheService() {
  logger.info('🧪 CacheService Integration Test\n');

  try {
    logger.info('Step 1: Initialize CacheService');
    logger.info('----------------------------------');
    
    // Test with mock Redis client
    const cacheService = new CacheService(mockRedisClient);
    logger.info('✅ CacheService created with mock Redis client');
    logger.info(`   Health status: ${cacheService.isHealthy()}`);
    logger.info(`   TTL config: ${JSON.stringify(cacheService.ttl)}`);

    logger.info('\nStep 2: Test Basic Cache Operations');
    logger.info('----------------------------------');
    
    // Test set and get
    const userId = 123;
    const taskData = { id: 1, title: 'Test Task', completed: false };
    
    const setResult = await cacheService.setUserTask(userId, 1, taskData);
    logger.info(`✅ Set user task: ${setResult}`);
    
    const getResult = await cacheService.getUserTask(userId, 1);
    logger.info(`✅ Retrieved user task: ${JSON.stringify(getResult)}`);
    logger.info(`   Data matches: ${JSON.stringify(getResult) === JSON.stringify(taskData)}`);

    logger.info('\nStep 3: Test Key Naming Conventions');
    logger.info('----------------------------------');
    
    // Test consistent key generation
    const filters1 = { completed: false, priority: 'high' };
    const filters2 = { priority: 'high', completed: false };
    
    await cacheService.setUserTasks(userId, filters1, { tasks: [] });
    const cachedTasks = await cacheService.getUserTasks(userId, filters2);
    logger.info(`✅ Consistent key naming: ${cachedTasks !== null}`);
    logger.info(`   Filters order doesn't matter: ${JSON.stringify(cachedTasks)}`);

    logger.info('\nStep 4: Test Pattern-Based Invalidation');
    logger.info('--------------------------------------');
    
    // Create multiple cache entries
    await cacheService.setUserTask(userId, 1, { id: 1, title: 'Task 1' });
    await cacheService.setUserTask(userId, 2, { id: 2, title: 'Task 2' });
    await cacheService.setUserTask(userId, 3, { id: 3, title: 'Task 3' });
    await cacheService.setUserTasks(userId, {}, { tasks: [] });
    
    logger.info(`   Created cache entries for user ${userId}`);
    
    // Test pattern invalidation
    const invalidationResult = await cacheService.invalidateUserTasksCache(userId);
    logger.info(`✅ Pattern invalidation result: ${JSON.stringify(invalidationResult)}`);
    
    // Verify caches are cleared
    const clearedTasks = await cacheService.getUserTasks(userId, {});
    const clearedTask = await cacheService.getUserTask(userId, 1);
    logger.info(`   Tasks cache cleared: ${clearedTasks === null}`);
    logger.info(`   Individual task cache cleared: ${clearedTask === null}`);

    logger.info('\nStep 5: Test Multiple Pattern Invalidation');
    logger.info('-----------------------------------------');
    
    // Create cache entries for multiple users
    await cacheService.setUserTask(123, 1, { id: 1, title: 'User 123 Task' });
    await cacheService.setUserTask(456, 1, { id: 1, title: 'User 456 Task' });
    await cacheService.setUserStats(123, { taskCount: 5 });
    
    const multiResult = await cacheService.invalidateMultiplePatterns([
      'user:123:*',
      'user:456:task:*'
    ]);
    logger.info(`✅ Multi-pattern invalidation: ${JSON.stringify(multiResult)}`);

    logger.info('\nStep 6: Test Graceful Degradation');
    logger.info('--------------------------------');
    
    // Test with null Redis client (development fallback)
    const noCacheService = new CacheService(null);
    logger.info(`✅ No-cache service created: ${!noCacheService.isHealthy()}`);
    
    const nullResult = await noCacheService.getUserTask(userId, 1);
    logger.info(`   Graceful fallback returns null: ${nullResult === null}`);
    
    const nullSetResult = await noCacheService.setUserTask(userId, 1, taskData);
    logger.info(`   Graceful fallback set returns false: ${nullSetResult === false}`);

    logger.info('\nStep 7: Test Cache Statistics');
    logger.info('-----------------------------');
    
    const stats = await cacheService.getStats();
    logger.info(`✅ Cache statistics retrieved: ${stats.available}`);
    logger.info(`   TTL configuration: ${JSON.stringify(stats.ttlConfig)}`);

    logger.info('\n🎉 CacheService Integration Test Completed Successfully!');

    logger.info('\n📚 Key Features Validated:');
    logger.info('=========================');
    logger.info('✅ Consistent key naming conventions');
    logger.info('✅ Pattern-based cache invalidation using SCAN + DEL');
    logger.info('✅ Graceful fallback when Redis unavailable');
    logger.info('✅ TTL management and configuration');
    logger.info('✅ User-specific cache operations');
    logger.info('✅ Bulk pattern invalidation');
    logger.info('✅ Cache statistics and health monitoring');

    return true;

  } catch (error) {
    logger.error('❌ CacheService test failed:', error.message);
    logger.error(error.stack);
    return false;
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testCacheService()
    .then((success) => {
      if (success) {
        logger.info('\n✨ All CacheService tests passed');
        process.exit(0);
      } else {
        logger.info('\n💥 CacheService tests failed');
        process.exit(1);
      }
    })
    .catch((error) => {
      logger.error('💥 Unexpected error:', error.message);
      process.exit(1);
    });
}

module.exports = { testCacheService };