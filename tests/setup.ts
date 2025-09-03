/**
 * Global test setup for PAKE+ System
 */

import { config } from 'dotenv';
import { logger } from '@pake/common';

// Load test environment variables
config({ path: '.env.test' });

// Configure test database
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'pake_system_test';
process.env.REDIS_DB = '1';

// Suppress console output during tests unless explicitly needed
const originalConsole = console;
global.console = {
    ...originalConsole,
    log: process.env.VERBOSE_TESTS ? originalConsole.log : jest.fn(),
    warn: originalConsole.warn,
    error: originalConsole.error,
    info: process.env.VERBOSE_TESTS ? originalConsole.info : jest.fn(),
    debug: process.env.VERBOSE_TESTS ? originalConsole.debug : jest.fn()
};

// Global test utilities
global.testUtils = {
    /**
     * Create a mock request object
     */
    mockRequest: (overrides = {}) => ({
        body: {},
        params: {},
        query: {},
        headers: {},
        user: null,
        ...overrides
    }),

    /**
     * Create a mock response object
     */
    mockResponse: () => {
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
            send: jest.fn().mockReturnThis(),
            cookie: jest.fn().mockReturnThis(),
            clearCookie: jest.fn().mockReturnThis()
        };
        return res;
    },

    /**
     * Create a mock next function
     */
    mockNext: () => jest.fn(),

    /**
     * Wait for a specified time
     */
    wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

    /**
     * Generate test data
     */
    generateTestUser: (overrides = {}) => ({
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides
    }),

    generateTestTask: (overrides = {}) => ({
        id: 'test-task-id',
        title: 'Test Task',
        description: 'Test task description',
        status: 'todo',
        priority: 'medium',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides
    })
};

// Setup and teardown hooks
beforeAll(async () => {
    // Global setup
    logger.info('🧪 Test suite starting...');
});

afterAll(async () => {
    // Global cleanup
    logger.info('🧪 Test suite completed');
});

// Setup for each test
beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
});
