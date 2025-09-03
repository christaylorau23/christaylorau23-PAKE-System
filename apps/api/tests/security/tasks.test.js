const request = require('supertest');
const app = require('../../src/app');
const { pool, redis, connectDB, connectRedis } = require('../../src/config/database');

describe('Tasks Security Tests', () => {
  let authToken;
  let userId;

  beforeAll(async () => {
    // Connect to databases
    await connectDB();
    await connectRedis();
    
    // Create a test user and get auth token
    const userResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'testuser@example.com',
        password: 'TestPassword123!',
        name: 'Test User'
      });

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'testuser@example.com',
        password: 'TestPassword123!'
      });

    authToken = loginResponse.body.data.token;
    userId = loginResponse.body.data.user.id;
  });

  afterAll(async () => {
    // Clean up test data
    await pool.query('DELETE FROM tasks WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await redis.del(`user_tasks:${userId}`);
  });

  describe('SQL Injection Protection', () => {
    test('test_sql_injection_attempt_returns_400', async () => {
      const maliciousSort = "id); DROP TABLE tasks; --";
      
      const response = await request(app)
        .get('/api/tasks')
        .query({ sort: maliciousSort })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid sort parameter');
      expect(response.body.details).toContain('sort must be one of: created_at, due_date, priority, title');
    });

    test('test_sql_injection_in_order_parameter_returns_400', async () => {
      const maliciousOrder = "ASC; DROP TABLE users; --";
      
      const response = await request(app)
        .get('/api/tasks')
        .query({ sort: 'created_at', order: maliciousOrder })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid order parameter');
      expect(response.body.details).toContain('order must be one of: ASC, DESC');
    });

    test('test_union_based_sql_injection_returns_400', async () => {
      const maliciousSort = "title UNION SELECT password FROM users --";
      
      const response = await request(app)
        .get('/api/tasks')
        .query({ sort: maliciousSort })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid sort parameter');
    });

    test('test_boolean_based_sql_injection_returns_400', async () => {
      const maliciousSort = "created_at WHERE 1=1 AND (SELECT COUNT(*) FROM users)>0 --";
      
      const response = await request(app)
        .get('/api/tasks')
        .query({ sort: maliciousSort })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid sort parameter');
    });
  });

  describe('Valid Parameter Tests', () => {
    beforeEach(async () => {
      // Create a test task for sorting tests
      await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Task',
          description: 'Test Description',
          priority: 'high',
          due_date: '2024-12-31T23:59:59.000Z'
        });
    });

    afterEach(async () => {
      // Clean up test tasks
      await pool.query('DELETE FROM tasks WHERE user_id = $1', [userId]);
    });

    test('test_valid_sort_returns_sorted_results', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .query({ sort: 'created_at', order: 'asc' })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.tasks).toBeInstanceOf(Array);
    });

    test('test_all_valid_sort_fields_work', async () => {
      const validSortFields = ['created_at', 'due_date', 'priority', 'title'];
      
      for (const sortField of validSortFields) {
        const response = await request(app)
          .get('/api/tasks')
          .query({ sort: sortField, order: 'desc' })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      }
    });

    test('test_all_valid_order_directions_work', async () => {
      const validOrders = ['asc', 'desc', 'ASC', 'DESC'];
      
      for (const orderDir of validOrders) {
        const response = await request(app)
          .get('/api/tasks')
          .query({ sort: 'created_at', order: orderDir })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      }
    });
  });

  describe('Edge Cases', () => {
    test('test_empty_sort_parameter_uses_default', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .query({ sort: '' })
        .set('Authorization', `Bearer ${authToken}`);

      // Should use default sort (created_at) since empty string fails validation
      expect(response.status).toBe(400);
    });

    test('test_invalid_case_variations_rejected', async () => {
      const invalidCases = ['Created_At', 'TITLE', 'Due_Date', 'PRIORITY'];
      
      for (const invalidCase of invalidCases) {
        const response = await request(app)
          .get('/api/tasks')
          .query({ sort: invalidCase })
          .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid sort parameter');
      }
    });
  });
});