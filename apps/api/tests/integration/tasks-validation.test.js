const request = require('supertest');

// Mock the database and redis modules
jest.mock('../../src/config/database', () => ({
  pool: {
    query: jest.fn()
  },
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1)
  }
}));

// Mock the auth middleware to bypass authentication
jest.mock('../../src/middleware/auth', () => {
  return (req, res, next) => {
    req.user = { id: 1 };
    next();
  };
});

const app = require('../../src/app');

describe('Tasks Route Validation Tests', () => {
  describe('SQL Injection Protection', () => {
    test('test_sql_injection_attempt_returns_400', async () => {
      const maliciousSort = "id); DROP TABLE tasks; --";
      
      const response = await request(app)
        .get('/api/tasks')
        .query({ sort: maliciousSort });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation error');
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'sort'
          })
        ])
      );
    });

    test('test_sql_injection_in_order_parameter_returns_400', async () => {
      const maliciousOrder = "ASC; DROP TABLE users; --";
      
      const response = await request(app)
        .get('/api/tasks')
        .query({ sort: 'created_at', order: maliciousOrder });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation error');
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'order'
          })
        ])
      );
    });

    test('test_union_based_sql_injection_returns_400', async () => {
      const maliciousSort = "title UNION SELECT password FROM users --";
      
      const response = await request(app)
        .get('/api/tasks')
        .query({ sort: maliciousSort });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation error');
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'sort'
          })
        ])
      );
    });

    test('test_boolean_based_sql_injection_returns_400', async () => {
      const maliciousSort = "created_at WHERE 1=1 AND (SELECT COUNT(*) FROM users)>0 --";
      
      const response = await request(app)
        .get('/api/tasks')
        .query({ sort: maliciousSort });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation error');
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'sort'
          })
        ])
      );
    });
  });

  describe('Valid Parameter Tests', () => {
    beforeEach(() => {
      // Mock successful query response
      const { pool } = require('../../src/config/database');
      pool.query.mockResolvedValue({
        rows: [
          {
            id: 1,
            title: 'Test Task',
            description: 'Test Description',
            completed: false,
            priority: 'high',
            due_date: '2024-12-31T23:59:59.000Z',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
            category_name: 'Work',
            category_color: '#FF0000',
            category_id: 1
          }
        ]
      });
    });

    test('test_valid_sort_returns_sorted_results', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .query({ sort: 'created_at', order: 'asc' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.tasks).toBeInstanceOf(Array);
    });

    test('test_all_valid_sort_fields_work', async () => {
      const validSortFields = ['created_at', 'due_date', 'priority', 'title'];
      
      for (const sortField of validSortFields) {
        const response = await request(app)
          .get('/api/tasks')
          .query({ sort: sortField, order: 'desc' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      }
    });

    test('test_all_valid_order_directions_work', async () => {
      const validOrders = ['asc', 'desc'];
      
      for (const orderDir of validOrders) {
        const response = await request(app)
          .get('/api/tasks')
          .query({ sort: 'created_at', order: orderDir });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      }
      
      // Test that uppercase variants are rejected by express-validator
      const invalidOrders = ['ASC', 'DESC'];
      for (const orderDir of invalidOrders) {
        const response = await request(app)
          .get('/api/tasks')
          .query({ sort: 'created_at', order: orderDir });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation error');
      }
    });
  });

  describe('Edge Cases', () => {
    test('test_empty_sort_parameter_uses_validation', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .query({ sort: '' });

      // Express validator should fail this and return 400 
      expect(response.status).toBe(400);
    });

    test('test_invalid_case_variations_rejected', async () => {
      const invalidCases = ['Created_At', 'TITLE', 'Due_Date', 'PRIORITY'];
      
      for (const invalidCase of invalidCases) {
        const response = await request(app)
          .get('/api/tasks')
          .query({ sort: invalidCase });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Validation error');
      }
    });
  });
});