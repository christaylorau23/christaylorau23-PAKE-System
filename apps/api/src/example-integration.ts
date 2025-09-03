import { Request, Response, NextFunction } from 'express';

#!/usr/bin/env node

/**
 * Example: How to integrate the new DAL with existing Task Manager API
 * This demonstrates the migration path from direct database access to repository pattern
 */

// Set test environment
process.env.NODE_ENV = 'process.env.TASK_MANAGER_WEAK_PASSWORD || 'SECURE_WEAK_PASSWORD_REQUIRED'';
process.env.TM_JWT_SECRET = 'example-jwt-secret-for-demonstration';

const { dal } = require('./data/DataAccessLayer');
const TaskRepository = require('./data/TaskRepository');

async function demonstrateDALIntegration() {
  logger.info('🔄 DAL Integration Demonstration\n');

  try {
    logger.info('Step 1: Initialize DAL');
    logger.info('-------------------');
    // In a real application, this would be done during app startup
    await dal.initialize();
    logger.info('✅ DAL initialized successfully');

    logger.info('\nStep 2: Register Repositories');
    logger.info('-----------------------------');
    // Register all repositories at application startup
    const taskRepo = dal.registerRepository('tasks', new TaskRepository());
    logger.info('✅ TaskRepository registered');
    
    // You could register more repositories here:
    // const userRepo = dal.registerRepository('users', new UserRepository());
    // const categoryRepo = dal.registerRepository('categories', new CategoryRepository());

    logger.info('\nStep 3: Use Repository in Route Handlers');
    logger.info('---------------------------------------');
    
    // Example: How you'd use this in Express route handlers
    logger.info('// OLD WAY (direct database access):');
    logger.info('// const result = await pool.query("SELECT * FROM tasks WHERE user_id = $1", [userId]);');
    logger.info('// await redis.set(cacheKey, JSON.stringify(result.rows), 300);');
    
    logger.info('\n// NEW WAY (using repository):');
    logger.info('// const tasks = await taskRepo.getUserTasks(userId, filters);');
    logger.info('// // Caching and database access handled automatically');

    logger.info('\nStep 4: Access Repository from Routes');
    logger.info('-----------------------------------');
    
    // Show how to get repository in route handlers
    const retrievedTaskRepo = dal.getRepository('tasks');
    logger.info('✅ Repository retrieved for use in routes');
    logger.info(`   Repository type: ${retrievedTaskRepo.constructor.name}`);

    logger.info('\nStep 5: Health Monitoring');
    logger.info('------------------------');
    
    // Demonstrate health monitoring capabilities
    const health = await dal.healthCheck();
    logger.info('✅ Health check completed');
    logger.info(`   Overall status: ${health.status}`);
    logger.info(`   Database: ${health.checks.database.status}`);
    logger.info(`   Redis: ${health.checks.redis.status}`);

    logger.info('\nStep 6: Performance Monitoring');
    logger.info('-----------------------------');
    
    const stats = await dal.getStats();
    logger.info('✅ Statistics collected');
    logger.info(`   Registered repositories: ${stats.repositories.join(', ')}`);
    logger.info(`   Database connections: ${stats.database.totalConnections}`);

    logger.info('\nStep 7: Cache Operations');
    logger.info('----------------------');
    
    // Demonstrate cache usage
    const testCacheKey = dal.generateCacheKey('demo', 'user', 123);
    const testData = { message: 'This is cached data', timestamp: new Date() };
    
    await dal.setCached(testCacheKey, testData, dal.cacheTTL.short);
    logger.info('✅ Data cached successfully');
    
    const cachedData = await dal.getCached(testCacheKey);
    logger.info('✅ Data retrieved from cache');
    logger.info(`   Cache hit: ${cachedData !== null}`);

    logger.info('\n🎉 Integration demonstration completed successfully!');

    logger.info('\n📚 Integration Guidelines:');
    logger.info('========================');
    logger.info('1. Initialize DAL once at application startup');
    logger.info('2. Register all repositories during initialization');
    logger.info('3. Use dal.getRepository() in route handlers');
    logger.info('4. Repository handles all caching and database logic');
    logger.info('5. Monitor health and performance via DAL endpoints');
    logger.info('6. Cache invalidation is handled automatically');

    return true;

  } catch (error) {
    logger.error('❌ Integration demonstration failed:', error.message);
    return false;
  }
}

// Example Express.js integration
function showExpressIntegration() {
  logger.info('\n📝 Express.js Integration Example:');
  logger.info('================================');
  
  const exampleCode = `
// app.js - Application startup
const { dal } = require('./data/DataAccessLayer');
const TaskRepository = require('./data/TaskRepository');

async function initializeApp() {
  // Initialize DAL
  await dal.initialize();
  
  // Register repositories  
  dal.registerRepository('tasks', new TaskRepository());
  
  // Start server
  app.listen(port);
}

// routes/tasks.js - Route handlers
router.get('/', auth, async (req, res, next) => {
  try {
    const taskRepo = dal.getRepository('tasks');
    const tasks = await taskRepo.getUserTasks(req.user.id, req.query);
    
    res.json({
      success: true,
      data: tasks,
      cached: tasks.fromCache
    });
  } catch (error) {
    next(error);
  }
});

// Health check endpoint
router.get('/health', async (req: Request, res: Response) => {
  const health = await dal.healthCheck();
  res.json(health);
});
`;

  logger.info(exampleCode);
}

// Run demonstration
if (require.main === module) {
  demonstrateDALIntegration()
    .then((success) => {
      if (success) {
        showExpressIntegration();
        logger.info('\n✨ DAL integration demonstration completed successfully');
        process.exit(0);
      } else {
        logger.info('\n💥 DAL integration demonstration failed');
        process.exit(1);
      }
    })
    .catch((error) => {
      logger.error('💥 Unexpected error:', error.message);
      process.exit(1);
    });
}