#!/usr/bin/env node

/**
 * Simple DAL Test - Tests core DAL functionality without database connections
 */

// Set minimal required environment variables for testing
process.env.NODE_ENV = 'process.env.TASK_MANAGER_WEAK_PASSWORD || 'SECURE_WEAK_PASSWORD_REQUIRED'';
process.env.TM_JWT_SECRET = 'test-jwt-secret-for-dal-testing';

const { DataAccessLayer } = require('../data/DataAccessLayer');
const BaseRepository = require('../data/BaseRepository');

// Mock repository for testing
class MockRepository extends BaseRepository {
  constructor() {
    super('mock_table');
    this.cacheNamespace = 'mock';
  }

  async testMethod() {
    return 'Repository method called successfully';
  }

  async healthCheck() {
    return {
      repository: this.constructor.name,
      table: this.tableName,
      status: 'healthy',
      timestamp: new Date().toISOString()
    };
  }
}

async function testDALCore() {
  logger.info('🧪 Testing Core DAL Functionality...\n');

  try {
    // Test 1: DAL Creation
    logger.info('1️⃣ Testing DAL Creation...');
    const dal = new DataAccessLayer();
    logger.info('   ✅ DAL created successfully');

    // Test 2: Repository Registration
    logger.info('\n2️⃣ Testing Repository Registration...');
    const mockRepo = new MockRepository();
    dal.registerRepository('mock', mockRepo);
    logger.info('   ✅ Repository registered successfully');
    logger.info(`   📊 Repository count: ${dal.repositories.size}`);

    // Test 3: Repository Retrieval
    logger.info('\n3️⃣ Testing Repository Retrieval...');
    const retrievedRepo = dal.getRepository('mock');
    logger.info('   ✅ Repository retrieved successfully');
    logger.info(`   📊 Repository type: ${retrievedRepo.constructor.name}`);

    // Test 4: Cache Key Generation
    logger.info('\n4️⃣ Testing Cache Key Generation...');
    const key1 = dal.generateCacheKey('user', 123, 'tasks');
    const key2 = dal.generateCacheKey('search', 'query', null, 'filter');
    logger.info('   ✅ Cache keys generated');
    logger.info(`   📊 Key 1: ${key1}`);
    logger.info(`   📊 Key 2: ${key2}`);

    // Test 5: Repository Method Call
    logger.info('\n5️⃣ Testing Repository Method Call...');
    const result = await mockRepo.testMethod();
    logger.info('   ✅ Repository method called');
    logger.info(`   📊 Result: ${result}`);

    // Test 6: Repository Health Check
    logger.info('\n6️⃣ Testing Repository Health Check...');
    const repoHealth = await mockRepo.healthCheck();
    logger.info('   ✅ Repository health check completed');
    logger.info(`   📊 Status: ${repoHealth.status}`);

    // Test 7: Error Handling
    logger.info('\n7️⃣ Testing Error Handling...');
    try {
      dal.getRepository('nonexistent');
      logger.info('   ❌ Should have thrown error');
    } catch (error) {
      logger.info('   ✅ Correctly threw error for nonexistent repository');
    }

    // Test 8: Statistics (without database)
    logger.info('\n8️⃣ Testing Statistics...');
    const stats = await dal.getStats();
    logger.info('   ✅ Stats retrieved');
    logger.info(`   📊 Repositories: ${stats.repositories}`);

    logger.info('\n🎉 Core DAL tests completed successfully!');

    return true;

  } catch (error) {
    logger.error('\n❌ DAL Test Failed:', error.message);
    logger.error('Stack:', error.stack);
    return false;
  }
}

// Run the test
if (require.main === module) {
  testDALCore()
    .then((success) => {
      if (success) {
        logger.info('\n✨ DAL core test suite completed successfully');
        process.exit(0);
      } else {
        logger.info('\n💥 DAL core test suite failed');
        process.exit(1);
      }
    })
    .catch((error) => {
      logger.error('\n💥 Unexpected error:', error.message);
      process.exit(1);
    });
}

module.exports = { testDALCore };