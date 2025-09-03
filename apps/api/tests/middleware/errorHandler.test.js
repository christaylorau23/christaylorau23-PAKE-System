/**
 * Error Handler Middleware Tests
 * Tests secure error handling and information disclosure prevention
 */

const { errorHandler, notFoundHandler, asyncHandler } = require('../../src/middleware/errorHandler');

// Mock response object
const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Mock request object
const mockRequest = (overrides = {}) => ({
  method: 'GET',
  url: '/test',
  ip: '127.0.0.1',
  get: jest.fn().mockReturnValue('test-user-agent'),
  user: { id: 'test-user-123' },
  ...overrides
});

describe('Error Handler Middleware', () => {
  let req, res, next;
  
  beforeEach(() => {
    req = mockRequest();
    res = mockResponse();
    next = jest.fn();
    
    // Mock console.error to avoid cluttering test output
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('PostgreSQL Error Handling', () => {
    test('should sanitize duplicate key error (23505)', () => {
      const error = new Error('duplicate key value violates unique constraint "users_email_key"');
      error.code = '23505';
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: 'A record with this information already exists',
            code: 'DUPLICATE_RESOURCE',
            errorId: expect.any(String)
          })
        })
      );
    });
    
    test('should sanitize foreign key violation (23503)', () => {
      const error = new Error('insert or update on table "tasks" violates foreign key constraint');
      error.code = '23503';
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: 'Referenced resource not found',
            code: 'RESOURCE_NOT_FOUND'
          })
        })
      );
    });
    
    test('should sanitize database connection errors (08006)', () => {
      const error = new Error('connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed');
      error.code = '08006';
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: 'Service temporarily unavailable',
            code: 'SERVICE_UNAVAILABLE'
          })
        })
      );
      
      // Ensure database connection details are not exposed (even in development)
      const responseCall = res.json.mock.calls[0][0];
      expect(JSON.stringify(responseCall)).not.toContain('postgresql');
      expect(JSON.stringify(responseCall)).not.toContain('socket');
      expect(JSON.stringify(responseCall)).not.toContain('.s.PGSQL');
      // Should be redacted in development mode
      if (responseCall.development) {
        expect(responseCall.development.originalMessage).toContain('[REDACTED]');
      }
    });
  });

  describe('Authentication Error Handling', () => {
    test('should sanitize JWT validation errors', () => {
      const error = new Error('invalid signature');
      error.name = 'JsonWebTokenError';
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: 'Invalid authentication token',
            code: 'INVALID_TOKEN'
          })
        })
      );
    });
    
    test('should sanitize expired token errors', () => {
      const error = new Error('jwt expired');
      error.name = 'TokenExpiredError';
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: 'Authentication token expired',
            code: 'TOKEN_EXPIRED'
          })
        })
      );
    });
  });

  describe('File System Error Handling', () => {
    test('should sanitize file not found errors', () => {
      const error = new Error("ENOENT: no such file or directory, open '/sensitive/path/file.txt'");
      error.code = 'ENOENT';
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: 'Requested resource not found',
            code: 'RESOURCE_NOT_FOUND'
          })
        })
      );
      
      // Ensure file paths are not exposed (even in development)
      const responseCall = res.json.mock.calls[0][0];
      expect(JSON.stringify(responseCall)).not.toContain('/sensitive/path');
      // Should be redacted in development mode
      if (responseCall.development) {
        expect(responseCall.development.originalMessage).toContain('[REDACTED]');
      }
    });
    
    test('should sanitize permission errors', () => {
      const error = new Error("EACCES: permission denied, open '/etc/passwd'");
      error.code = 'EACCES';
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: 'Access denied',
            code: 'ACCESS_DENIED'
          })
        })
      );
    });
  });

  describe('Validation Error Handling', () => {
    test('should sanitize validation errors without exposing field values', () => {
      const error = new Error('Validation failed');
      error.name = 'ValidationError';
      error.errors = {
        'email': { message: 'Invalid email format' },
        'password': { message: 'Password too weak' }
      };
      
      errorHandler(error, req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.objectContaining({
            message: 'Validation failed for fields: email, password',
            code: 'VALIDATION_ERROR'
          })
        })
      );
    });
  });

  describe('Production vs Development Behavior', () => {
    test('should not include development info in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const error = new Error('Internal server error');
      error.stack = 'Error: Internal server error\n    at test (/app/test.js:1:1)';
      
      errorHandler(error, req, res, next);
      
      const responseCall = res.json.mock.calls[0][0];
      expect(responseCall).not.toHaveProperty('development');
      expect(responseCall).not.toHaveProperty('stack');
      
      process.env.NODE_ENV = originalEnv;
    });
    
    test('should include limited development info in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at line1\n    at line2\n    at line3\n    at line4\n    at line5\n    at line6';
      
      errorHandler(error, req, res, next);
      
      const responseCall = res.json.mock.calls[0][0];
      expect(responseCall).toHaveProperty('development');
      expect(responseCall.development).toHaveProperty('originalMessage', 'Test error');
      expect(responseCall.development).toHaveProperty('stack');
      expect(responseCall.development.stack).toHaveLength(5); // Limited to 5 lines
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Structured Logging', () => {
    test('should log structured error data internally', () => {
      const error = new Error('Test error for logging');
      error.code = 'TEST_ERROR';
      
      const consoleSpy = jest.spyOn(console, 'error');
      
      errorHandler(error, req, res, next);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Internal Error Log:',
        expect.stringContaining('"level":"ERROR"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        'Internal Error Log:',
        expect.stringContaining('"message":"Test error for logging"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        'Internal Error Log:',
        expect.stringContaining('"errorId"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        'Internal Error Log:',
        expect.stringContaining('"timestamp"')
      );
    });
    
    test('should include request context in logs', () => {
      const error = new Error('Test error');
      const consoleSpy = jest.spyOn(console, 'error');
      
      errorHandler(error, req, res, next);
      
      const logCall = consoleSpy.mock.calls[0][1];
      const logData = JSON.parse(logCall);
      
      expect(logData.request).toEqual({
        method: 'GET',
        url: '/test',
        ip: '127.0.0.1',
        userAgent: 'test-user-agent',
        userId: 'test-user-123'
      });
    });
  });

  describe('Async Handler', () => {
    test('should catch async errors and pass to next middleware', async () => {
      const asyncFn = jest.fn().mockRejectedValue(new Error('Async error'));
      const wrappedFn = asyncHandler(asyncFn);
      
      await wrappedFn(req, res, next);
      
      expect(asyncFn).toHaveBeenCalledWith(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
    
    test('should pass through successful async operations', async () => {
      const asyncFn = jest.fn().mockResolvedValue('success');
      const wrappedFn = asyncHandler(asyncFn);
      
      await wrappedFn(req, res, next);
      
      expect(asyncFn).toHaveBeenCalledWith(req, res, next);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Not Found Handler', () => {
    test('should create proper 404 error for unmatched routes', () => {
      const req = mockRequest({ originalUrl: '/nonexistent-route' });
      
      notFoundHandler(req, res, next);
      
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Route /nonexistent-route not found',
          statusCode: 404,
          code: 'ROUTE_NOT_FOUND'
        })
      );
    });
  });
});