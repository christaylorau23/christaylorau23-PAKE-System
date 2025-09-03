/**
 * API Integration Tests
 */

import request from 'supertest';
import { app } from '../../apps/api/src/app';
import { DatabaseService } from '@pake/database';

describe('API Integration Tests', () => {
    let authToken: string;
    let testUserId: string;

    beforeAll(async () => {
        // Setup test database
        await DatabaseService.initialize();
        await DatabaseService.migrate();
        
        // Create test user and get auth token
        const response = await request(app)
            .post('/api/auth/register')
            .send({
                email: 'integration@test.com',
                password: 'TestPassword123!',
                name: 'Integration Test User'
            });

        testUserId = response.body.data.user.id;
        authToken = response.body.data.token;
    });

    afterAll(async () => {
        // Cleanup test database
        await DatabaseService.cleanup();
        await DatabaseService.close();
    });

    describe('Authentication Flow', () => {
        it('should register a new user', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    email: 'newuser@test.com',
                    password: 'SecurePassword123!',
                    name: 'New Test User'
                });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.data.user).toHaveProperty('email', 'newuser@test.com');
            expect(response.body.data).toHaveProperty('token');
        });

        it('should login with valid credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'integration@test.com',
                    password: 'TestPassword123!'
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('token');
            expect(response.body.data.user).toHaveProperty('email', 'integration@test.com');
        });

        it('should reject login with invalid credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'integration@test.com',
                    password: 'wrongpassword'
                });

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
        });
    });

    describe('Task Management', () => {
        let taskId: string;

        it('should create a new task', async () => {
            const response = await request(app)
                .post('/api/tasks')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    title: 'Integration Test Task',
                    description: 'Task created in integration test',
                    priority: 'high'
                });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('title', 'Integration Test Task');
            expect(response.body.data).toHaveProperty('status', 'todo');
            
            taskId = response.body.data.id;
        });

        it('should get all tasks for authenticated user', async () => {
            const response = await request(app)
                .get('/api/tasks')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data.length).toBeGreaterThan(0);
        });

        it('should update task status', async () => {
            const response = await request(app)
                .patch(`/api/tasks/${taskId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    status: 'in_progress'
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data.status).toBe('in_progress');
        });

        it('should delete a task', async () => {
            const response = await request(app)
                .delete(`/api/tasks/${taskId}`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });
    });

    describe('Error Handling', () => {
        it('should handle 404 for non-existent endpoints', async () => {
            const response = await request(app)
                .get('/api/nonexistent');

            expect(response.status).toBe(404);
            expect(response.body.success).toBe(false);
        });

        it('should require authentication for protected routes', async () => {
            const response = await request(app)
                .get('/api/tasks');

            expect(response.status).toBe(401);
            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('UNAUTHORIZED');
        });

        it('should validate request data', async () => {
            const response = await request(app)
                .post('/api/tasks')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    // Missing required title
                    description: 'Task without title'
                });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('Performance', () => {
        it('should respond within acceptable time limits', async () => {
            const startTime = Date.now();
            
            await request(app)
                .get('/api/health')
                .expect(200);
                
            const responseTime = Date.now() - startTime;
            expect(responseTime).toBeLessThan(500); // 500ms threshold
        });

        it('should handle concurrent requests', async () => {
            const requests = Array(10).fill(null).map(() => 
                request(app)
                    .get('/api/health')
                    .expect(200)
            );

            const responses = await Promise.all(requests);
            expect(responses).toHaveLength(10);
            responses.forEach(response => {
                expect(response.body.success).toBe(true);
            });
        });
    });
});
