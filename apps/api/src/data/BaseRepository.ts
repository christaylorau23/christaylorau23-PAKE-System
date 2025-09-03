/**
 * Base Repository
 * Provides common functionality for all repositories
 */
class BaseRepository {
  constructor(tableName) {
    this.tableName = tableName;
    this.dal = null; // Will be injected by DAL
  }

  /**
   * Set DAL instance (dependency injection)
   */
  setDAL(dal) {
    this.dal = dal;
  }

  /**
   * Ensure DAL is available
   */
  ensureDAL() {
    if (!this.dal) {
      throw new Error(`DAL not available for ${this.constructor.name}. Repository must be registered with DAL.`);
    }
  }

  /**
   * Execute query with DAL
   */
  async query(sql, params = [], options = {}) {
    this.ensureDAL();
    return await this.dal.query(sql, params, options);
  }

  /**
   * Execute within transaction
   */
  async executeInTransaction(callback) {
    this.ensureDAL();
    return await this.dal.executeTransaction(callback);
  }

  /**
   * Cache operations
   */
  async getCached(key) {
    this.ensureDAL();
    return await this.dal.getCached(key);
  }

  async setCached(key, data, ttl) {
    this.ensureDAL();
    return await this.dal.setCached(key, data, ttl);
  }

  async deleteCached(key) {
    this.ensureDAL();
    return await this.dal.deleteCached(key);
  }

  /**
   * Generate cache key
   */
  generateCacheKey(...parts) {
    this.ensureDAL();
    return this.dal.generateCacheKey(this.cacheNamespace || this.tableName, ...parts);
  }

  /**
   * Common validation helpers
   */
  validateRequired(data, requiredFields) {
    const missing = requiredFields.filter(field => 
      data[field] === undefined || data[field] === null || data[field] === ''
    );

    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
  }

  validateTypes(data, typeDefinitions) {
    for (const [field, expectedType] of Object.entries(typeDefinitions)) {
      if (data[field] !== undefined) {
        const actualType = typeof data[field];
        if (actualType !== expectedType) {
          throw new Error(`Field '${field}' must be of type ${expectedType}, got ${actualType}`);
        }
      }
    }
  }

  /**
   * Common query builders
   */
  buildWhereClause(conditions) {
    if (!conditions || Object.keys(conditions).length === 0) {
      return { whereClause: '', params: [] };
    }

    const whereParts = [];
    const params = [];
    let paramCount = 1;

    for (const [field, value] of Object.entries(conditions)) {
      if (value !== null && value !== undefined) {
        whereParts.push(`${field} = $${paramCount}`);
        params.push(value);
        paramCount++;
      }
    }

    return {
      whereClause: whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '',
      params
    };
  }

  buildUpdateClause(data, excludeFields = []) {
    const updateFields = [];
    const params = [];
    let paramCount = 1;

    for (const [field, value] of Object.entries(data)) {
      if (!excludeFields.includes(field) && value !== undefined) {
        updateFields.push(`${field} = $${paramCount}`);
        params.push(value);
        paramCount++;
      }
    }

    return {
      updateClause: updateFields.join(', '),
      params,
      nextParamCount: paramCount
    };
  }

  /**
   * Repository health check
   */
  async healthCheck() {
    try {
      this.ensureDAL();
      
      // Basic connectivity test
      const result = await this.query(`SELECT 1 as health_check`);
      
      return {
        repository: this.constructor.name,
        table: this.tableName,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        connectionTest: result.rows.length > 0
      };
    } catch (error) {
      return {
        repository: this.constructor.name,
        table: this.tableName,
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }
}

module.exports = BaseRepository;