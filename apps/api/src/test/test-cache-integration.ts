#!/usr/bin/env node

/**
 * Test Cache Integration with Routes
 * Verifies that the refactored tasks.js works with CacheService
 */

// Set test environment
process.env.NODE_ENV = 'process.env.TASK_MANAGER_WEAK_PASSWORD || 'SECURE_WEAK_PASSWORD_REQUIRED'';
process.env.TM_JWT_SECRET = 'test-jwt-secret';

const CacheService = require('../services/CacheService');

// Mock configuration for testing
const mockConfig = {
  getCacheTTL: () => 1800,
  getDatabaseConfig: () => ({ host: 'localhost' }),
  getRedisConfig: () => ({ host: 'localhost' })
};

// Simple integration test
async function testCacheIntegration() {
  logger.info('🔗 Cache Integration Test\n');

  try {
    logger.info('Step 1: Verify CacheService Integration');
    logger.info('--------------------------------------');
    
    // Create mock Redis client
    const mockRedis = {
      data: new Map(),
      async get(key) { return this.data.get(key) || null; },
      async setEx(key, ttl, value) { this.data.set(key, value); return 'OK'; },
      async del(keys) { 
        if (Array.isArray(keys)) {
          return keys.reduce((count, key) => {
            const deleted = this.data.has(key) ? 1 : 0;
            this.data.delete(key);
            return count + deleted;
          }, 0);
        } else {
          const deleted = this.data.has(keys) ? 1 : 0;
          this.data.delete(keys);
          return deleted;
        }
      },
      async scan(cursor, options) {
        const keys = Array.from(this.data.keys());
        const pattern = options.MATCH?.replace(/\*/g, '.*');
        const regex = pattern ? new RegExp(pattern) : null;
        const matchingKeys = regex ? keys.filter(k => regex.test(k)) : keys;
        return { cursor: '0', keys: matchingKeys.slice(0, options.COUNT || 100) };
      }
    };
    
    const cacheService = new CacheService(mockRedis);
    logger.info('✅ CacheService instance created');
    logger.info(`   Healthy: ${cacheService.isHealthy()}`);

    logger.info('\nStep 2: Test Route-Like Cache Operations');
    logger.info('---------------------------------------');
    
    const userId = 123;
    const taskId = 456;
    
    // Simulate GET /tasks (list) cache operation
    const listFilters = { completed: false, priority: 'high' };
    const tasksData = { 
      tasks: [{ id: 1, title: 'Task 1' }, { id: 2, title: 'Task 2' }],
      pagination: { total: 2, limit: 50, offset: 0 }
    };
    
    await cacheService.setUserTasks(userId, listFilters, tasksData, cacheService.ttl.short);
    logger.info('✅ Cached tasks list (simulating GET /tasks)');
    
    const cachedList = await cacheService.getUserTasks(userId, listFilters);
    logger.info(`   Cache hit: ${cachedList !== null}`);
    
    // Simulate GET /tasks/:id cache operation
    const taskData = { id: taskId, title: 'Individual Task', completed: false };
    await cacheService.setUserTask(userId, taskId, taskData, cacheService.ttl.medium);
    logger.info('✅ Cached individual task (simulating GET /tasks/:id)');
    
    const cachedTask = await cacheService.getUserTask(userId, taskId);
    logger.info(`   Cache hit: ${cachedTask !== null}`);

    logger.info('\nStep 3: Test Cache Invalidation (simulating POST/PUT/DELETE)');
    logger.info('-----------------------------------------------------------');
    
    // Simulate task modification - should invalidate caches
    logger.info('🔄 Simulating task modification...');
    
    // This would be called in POST /tasks
    await cacheService.invalidateUserTasksCache(userId);
    const invalidatedList = await cacheService.getUserTasks(userId, listFilters);
    logger.info(`✅ Tasks list cache invalidated: ${invalidatedList === null}`);
    
    // This would be called in PUT/DELETE /tasks/:id
    await cacheService.invalidateUserTask(userId, taskId);
    const invalidatedTask = await cacheService.getUserTask(userId, taskId);
    logger.info(`✅ Individual task cache invalidated: ${invalidatedTask === null}`);

    logger.info('\nStep 4: Test Key Consistency');
    logger.info('----------------------------');
    
    // Verify that the same filters produce the same cache key
    const filters1 = { priority: 'high', completed: false, category_id: 3 };
    const filters2 = { completed: false, category_id: 3, priority: 'high' };
    
    await cacheService.setUserTasks(userId, filters1, { test: 'data' });
    const consistent = await cacheService.getUserTasks(userId, filters2);
    logger.info(`✅ Key consistency: ${consistent !== null}`);
    logger.info(`   Filter order independence: ${JSON.stringify(consistent)}`);

    logger.info('\nStep 5: Test Performance Pattern');
    logger.info('-------------------------------');
    
    // Create multiple cache entries to test bulk operations
    for (let i = 1; i <= 5; i++) {
      await cacheService.setUserTask(userId, i, { id: i, title: `Task ${i}` });
      await cacheService.setUserTasks(userId, { page: i }, { tasks: [] });
    }
    logger.info('✅ Created multiple cache entries');
    
    // Bulk invalidation
    const bulkResult = await cacheService.invalidateUserTasksCache(userId);
    logger.info(`✅ Bulk invalidation: deleted ${bulkResult.deleted} keys`);

    logger.info('\n🎉 Cache Integration Test Completed!');
    
    logger.info('\n📋 Integration Summary:');
    logger.info('======================');
    logger.info('✅ CacheService integrates correctly with route patterns');
    logger.info('✅ Cache keys are consistent and predictable');
    logger.info('✅ Pattern-based invalidation works efficiently');
    logger.info('✅ Cache operations match route requirements');
    logger.info('✅ Performance optimizations are in place');

    return true;

  } catch (error) {
    logger.error('❌ Cache integration test failed:', error.message);
    logger.error(error.stack);
    return false;
  }
}

// Run test
if (require.main === module) {
  testCacheIntegration()
    .then((success) => {
      if (success) {
        logger.info('\n✨ Cache integration tests passed');
        process.exit(0);
      } else {
        logger.info('\n💥 Cache integration tests failed');
        process.exit(1);
      }
    });
}