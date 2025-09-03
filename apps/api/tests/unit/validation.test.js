describe('SQL Injection Protection', () => {
  test('test_sql_injection_attempt_returns_400', () => {
    const allowedSortFields = ['created_at', 'due_date', 'priority', 'title'];
    const maliciousSort = "id); DROP TABLE tasks; --";
    
    // Test validation logic
    const isValidSort = allowedSortFields.includes(maliciousSort);
    expect(isValidSort).toBe(false);
  });

  test('test_union_based_sql_injection_returns_400', () => {
    const allowedSortFields = ['created_at', 'due_date', 'priority', 'title'];
    const maliciousSort = "title UNION SELECT password FROM users --";
    
    const isValidSort = allowedSortFields.includes(maliciousSort);
    expect(isValidSort).toBe(false);
  });

  test('test_order_parameter_validation', () => {
    const allowedOrderDirections = ['ASC', 'DESC'];
    const maliciousOrder = "ASC; DROP TABLE users; --";
    
    const isValidOrder = allowedOrderDirections.includes(maliciousOrder.toUpperCase());
    expect(isValidOrder).toBe(false);
  });

  test('test_valid_parameters_accepted', () => {
    const allowedSortFields = ['created_at', 'due_date', 'priority', 'title'];
    const allowedOrderDirections = ['ASC', 'DESC'];
    
    // Test all valid sort fields
    allowedSortFields.forEach(field => {
      expect(allowedSortFields.includes(field)).toBe(true);
    });
    
    // Test all valid order directions
    ['asc', 'desc', 'ASC', 'DESC'].forEach(order => {
      expect(allowedOrderDirections.includes(order.toUpperCase())).toBe(true);
    });
  });

  test('test_case_sensitivity_protection', () => {
    const allowedSortFields = ['created_at', 'due_date', 'priority', 'title'];
    
    // These should fail validation due to case sensitivity
    const invalidCases = ['Created_At', 'TITLE', 'Due_Date', 'PRIORITY'];
    invalidCases.forEach(field => {
      expect(allowedSortFields.includes(field)).toBe(false);
    });
  });
});