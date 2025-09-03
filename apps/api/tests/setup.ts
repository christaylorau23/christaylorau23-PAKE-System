/**
 * Test Setup Configuration
 * Configures the test environment and global settings
 */

// Set test environment variables
process.env.NODE_ENV = 'process.env.TASK_MANAGER_WEAK_PASSWORD || 'SECURE_WEAK_PASSWORD_REQUIRED'';
process.env.JWT_SECRET = 'test-jwt-secret-for-jest';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'taskmanager_test';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'process.env.DB_PASSWORD || 'SECURE_DB_PASSWORD_REQUIRED'';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

// Global test timeout
jest.setTimeout(30000);

// Suppress console output during tests unless there's an error
const originalConsole = { ...console };

beforeAll(() => {
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
  // Keep console.error for debugging
});

afterAll(() => {
  Object.assign(console, originalConsole);
});

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit in tests, but log the error
});

// Global error handler
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // Don't exit in tests, but log the error
});

// Mock axios for tests that need it
jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  patch: jest.fn(),
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn()
  }))
}));

// Helper function to create test database connection
global.createTestDBConnection = () => {
  // This would be implemented based on your database setup
  return {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn()
  };
};

// Helper function to create test Redis connection
global.createTestRedisConnection = () => {
  const mockData = new Map();
  return {
    get: jest.fn(async (key) => mockData.get(key) || null),
    set: jest.fn(async (key, value) => { mockData.set(key, value); return 'OK'; }),
    setEx: jest.fn(async (key, ttl, value) => { mockData.set(key, value); return 'OK'; }),
    del: jest.fn(async (key) => { 
      const deleted = mockData.has(key) ? 1 : 0; 
      mockData.delete(key); 
      return deleted; 
    }),
    exists: jest.fn(async (key) => mockData.has(key) ? 1 : 0),
    connect: jest.fn(),
    disconnect: jest.fn(),
    isOpen: true
  };
};

logger.info('✅ Test environment configured');