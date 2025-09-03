# PAKE+ System Testing Guide

## Overview

This document describes the comprehensive testing strategy for the PAKE+ System monorepo, designed to maintain >80% code coverage and ensure high-quality code.

## Testing Architecture

### Test Types

1. **Unit Tests** (`**/*.test.ts`)
   - Test individual functions and classes in isolation
   - Mock external dependencies
   - Fast execution, no external services

2. **Integration Tests** (`tests/integration/**`)
   - Test API endpoints with real database
   - Test service interactions
   - Validate data flow between components

3. **End-to-End Tests** (`tests/e2e/**`)
   - Test complete user workflows
   - Browser automation with Playwright
   - Production-like environment testing

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests
```bash
npm run test:integration
```

### With Coverage
```bash
npm run test:coverage
```

### Watch Mode (Development)
```bash
npm run test:watch
```

## Coverage Requirements

- **Minimum Coverage**: 80% across all metrics
- **Functions**: 80% minimum
- **Lines**: 80% minimum  
- **Branches**: 75% minimum
- **Statements**: 80% minimum

## Test Structure

### Unit Tests
```
apps/
  api/
    __tests__/
      unit/
        auth.middleware.test.ts
        task.service.test.ts
        user.controller.test.ts
```

### Integration Tests
```
tests/
  integration/
    api.integration.test.ts
    database.integration.test.ts
    auth.integration.test.ts
```

### Shared Test Utilities
```
tests/
  setup.ts              # Global test setup
  fixtures/             # Test data
  helpers/              # Test helper functions
```

## Writing Tests

### Unit Test Example
```typescript
describe('UserService', () => {
  let userService: UserService;
  let mockRepository: jest.Mocked<UserRepository>;

  beforeEach(() => {
    mockRepository = createMockRepository();
    userService = new UserService(mockRepository);
  });

  it('should create user with valid data', async () => {
    const userData = { email: 'test@example.com', name: 'Test User' };
    const expectedUser = { ...userData, id: 'user123' };
    
    mockRepository.create.mockResolvedValue(expectedUser);
    
    const result = await userService.createUser(userData);
    
    expect(result).toEqual(expectedUser);
    expect(mockRepository.create).toHaveBeenCalledWith(userData);
  });
});
```

### Integration Test Example
```typescript
describe('POST /api/users', () => {
  it('should create a new user', async () => {
    const response = await request(app)
      .post('/api/users')
      .send({ email: 'test@example.com', name: 'Test User' })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty('id');
  });
});
```

## Test Data Management

### Fixtures
Use consistent test data across tests:
```typescript
export const TEST_USER = {
  id: 'test-user-id',
  email: 'test@example.com',
  name: 'Test User'
};
```

### Database State
- Each integration test should clean up after itself
- Use transactions for test isolation
- Seed required reference data in test setup

## Mocking Guidelines

### External Services
Mock all external API calls:
```typescript
jest.mock('@pake/external-service');
```

### Database Operations
Mock database calls in unit tests:
```typescript
const mockRepository = {
  create: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  delete: jest.fn()
};
```

### Time-Dependent Code
Mock date/time for consistent testing:
```typescript
jest.useFakeTimers();
jest.setSystemTime(new Date('2024-01-01'));
```

## Performance Testing

### Response Time Validation
```typescript
it('should respond within 500ms', async () => {
  const start = Date.now();
  await request(app).get('/api/health');
  const duration = Date.now() - start;
  
  expect(duration).toBeLessThan(500);
});
```

### Concurrent Request Testing
```typescript
it('should handle 100 concurrent requests', async () => {
  const requests = Array(100).fill(null).map(() => 
    request(app).get('/api/health')
  );
  
  const responses = await Promise.all(requests);
  expect(responses.every(r => r.status === 200)).toBe(true);
});
```

## Continuous Integration

### Pre-commit Hooks
- Run unit tests before commit
- Enforce coverage thresholds
- Lint test files

### CI/CD Pipeline
1. **Fast Feedback**: Unit tests run on every push
2. **Full Suite**: Integration tests run on pull requests
3. **Coverage Gates**: Block deployment if coverage drops below 80%

## Troubleshooting

### Common Issues

**Test Database Connection**
```bash
# Ensure test database exists
createdb pake_system_test
```

**Coverage Issues**
```bash
# View detailed coverage report
npm run test:coverage
open coverage/lcov-report/index.html
```

**Slow Tests**
- Check for unnecessary database operations
- Ensure proper mocking of external services
- Use `test.concurrent` for independent tests

## Best Practices

1. **Test Names**: Use descriptive test names that explain the scenario
2. **Arrange-Act-Assert**: Structure tests clearly
3. **One Assertion Per Test**: Keep tests focused
4. **Mock External Dependencies**: Tests should be deterministic
5. **Clean Up**: Ensure tests don't affect each other
6. **Test Edge Cases**: Cover error scenarios and boundary conditions

---

**Coverage Target**: >80% across all applications and packages
**Test Execution**: Automated on every commit
**Quality Gates**: Block deployment on test failures
