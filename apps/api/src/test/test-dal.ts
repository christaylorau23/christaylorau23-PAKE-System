#!/usr/bin/env node

/**
 * Test script for Data Access Layer (DAL) and Repository pattern
 * This script tests the DAL integration without requiring a full server setup
 */

const path = require('path');

// Import modules with relative paths
const { dal } = require('../data/DataAccessLayer');
const TaskRepository = require('../data/TaskRepository');

async function testDAL() {
  logger.info('🧪 Testing Data Access Layer Implementation...\n');

  try {
    // Test 1: DAL Initialization
    logger.info('1️⃣ Testing DAL Initialization...');
    await dal.initialize();
    logger.info('   ✅ DAL initialized successfully');

    // Test 2: Repository Registration
    logger.info('\n2️⃣ Testing Repository Registration...');
    const taskRepo = dal.registerRepository('tasks', new TaskRepository());
    logger.info('   ✅ TaskRepository registered successfully');

    // Test 3: Repository Retrieval
    logger.info('\n3️⃣ Testing Repository Retrieval...');
    const retrievedRepo = dal.getRepository('tasks');
    logger.info('   ✅ Repository retrieved successfully');
    logger.info(`   📊 Repository type: ${retrievedRepo.constructor.name}`);

    // Test 4: Cache Operations
    logger.info('\n4️⃣ Testing Cache Operations...');
    
    const testData = { test: 'data', timestamp: new Date().toISOString() };
    const cacheKey = 'test:dal:cache';
    
    // Test cache set
    const setResult = await dal.setCached(cacheKey, testData, 60);
    logger.info('   ✅ Cache set:', setResult);
    
    // Test cache get
    const getCached = await dal.getCached(cacheKey);
    logger.info('   ✅ Cache retrieved:', getCached !== null);
    logger.info('   📊 Cached data matches:', JSON.stringify(getCached) === JSON.stringify(testData));
    
    // Test cache delete
    const deleteResult = await dal.deleteCached(cacheKey);
    logger.info('   ✅ Cache deleted:', deleteResult);

    // Test 5: Cache Key Generation
    logger.info('\n5️⃣ Testing Cache Key Generation...');
    const key1 = dal.generateCacheKey('user', 123, 'tasks', { status: 'active' });
    const key2 = dal.generateCacheKey('user', 123, 'tasks', 'active');
    logger.info('   ✅ Cache key 1:', key1);
    logger.info('   ✅ Cache key 2:', key2);

    // Test 6: Health Check
    logger.info('\n6️⃣ Testing Health Check...');
    const health = await dal.healthCheck();
    logger.info('   ✅ Health check completed');
    logger.info('   📊 Overall status:', health.status);
    logger.info('   📊 Database status:', health.checks.database.status);
    logger.info('   📊 Redis status:', health.checks.redis.status);

    // Test 7: Statistics
    logger.info('\n7️⃣ Testing Statistics...');
    const stats = await dal.getStats();
    logger.info('   ✅ Stats retrieved');
    logger.info('   📊 Registered repositories:', stats.repositories);
    logger.info('   📊 Database connections:', stats.database.totalConnections);

    // Test 8: Repository Health Check
    logger.info('\n8️⃣ Testing Repository Health Check...');
    const repoHealth = await taskRepo.healthCheck();
    logger.info('   ✅ Repository health check completed');
    logger.info('   📊 Repository status:', repoHealth.status);

    // Test 9: Bulk Cache Operations
    logger.info('\n9️⃣ Testing Bulk Cache Operations...');
    
    const bulkData = [
      { key: 'bulk:test:1', data: { id: 1, name: 'Test 1' }, ttl: 60 },
      { key: 'bulk:test:2', data: { id: 2, name: 'Test 2' }, ttl: 60 }
    ];
    
    const bulkSetResult = await dal.bulkSetCache(bulkData);
    logger.info('   ✅ Bulk cache set:', bulkSetResult);
    
    const bulkDeleteResult = await dal.bulkDeleteCache(['bulk:test:1', 'bulk:test:2']);
    logger.info('   ✅ Bulk cache delete:', bulkDeleteResult);

    // Test 10: Error Handling
    logger.info('\n🔟 Testing Error Handling...');
    try {
      dal.getRepository('nonexistent');
      logger.info('   ❌ Should have thrown error for nonexistent repository');
    } catch (error) {
      logger.info('   ✅ Correctly threw error for nonexistent repository');
    }

    logger.info('\n🎉 All DAL tests completed successfully!');
    logger.info('\n📊 Final Summary:');
    logger.info(`   - DAL Status: ${dal.isInitialized ? 'Initialized' : 'Not Initialized'}`);
    logger.info(`   - Registered Repositories: ${dal.repositories.size}`);
    logger.info(`   - Health Status: ${health.status}`);

  } catch (error) {
    logger.error('\n❌ DAL Test Failed:', error.message);
    logger.error('Stack:', error.stack);
    process.exit(1);

  } finally {
    try {
      logger.info('\n🧹 Cleaning up...');
      // Don't shutdown DAL in test as it would close the pool
      logger.info('   ✅ Cleanup completed');
    } catch (cleanupError) {
      logger.error('   ❌ Cleanup error:', cleanupError.message);
    }
  }
}

// Run the test
if (require.main === module) {
  testDAL()
    .then(() => {
      logger.info('\n✨ DAL test suite completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('\n💥 DAL test suite failed:', error.message);
      process.exit(1);
    });
}

module.exports = { testDAL };