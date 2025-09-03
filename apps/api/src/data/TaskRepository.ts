const BaseRepository = require('./BaseRepository');

/**
 * Task Repository
 * Handles all task-related data operations with PostgreSQL + Redis cache-aside pattern
 */
class TaskRepository extends BaseRepository {
  constructor() {
    super('tasks');
    this.cacheNamespace = 'tasks';
  }

  /**
   * Get all tasks for a user with filtering and pagination
   */
  async getUserTasks(userId, filters = {}) {
    const {
      completed,
      priority,
      category_id,
      sort = 'created_at',
      order = 'desc',
      limit = 50,
      offset = 0
    } = filters;

    // Generate cache key
    const cacheKey = this.dal.generateCacheKey(
      'user_tasks',
      userId,
      JSON.stringify(filters)
    );

    // Try cache first
    const cached = await this.dal.getCached(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    // Build WHERE conditions
    const conditions = ['t.user_id = $1'];
    const params = [userId];
    let paramCount = 2;

    if (completed !== undefined) {
      conditions.push(`t.completed = $${paramCount}`);
      params.push(completed === 'true' || completed === true);
      paramCount++;
    }

    if (priority) {
      conditions.push(`t.priority = $${paramCount}`);
      params.push(priority);
      paramCount++;
    }

    if (category_id) {
      conditions.push(`t.category_id = $${paramCount}`);
      params.push(parseInt(category_id));
      paramCount++;
    }

    // Validate and build ORDER BY clause
    const allowedSortFields = ['created_at', 'due_date', 'priority', 'title'];
    const allowedOrderDirections = ['asc', 'desc'];
    
    if (!allowedSortFields.includes(sort)) {
      throw new Error(`Invalid sort field: ${sort}. Allowed: ${allowedSortFields.join(', ')}`);
    }
    
    if (!allowedOrderDirections.includes(order.toLowerCase())) {
      throw new Error(`Invalid order direction: ${order}. Allowed: ${allowedOrderDirections.join(', ')}`);
    }

    const whereClause = conditions.join(' AND ');
    const orderClause = `ORDER BY t.${sort} ${order.toUpperCase()}`;
    const limitClause = `LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    // Main query
    const query = `
      SELECT 
        t.id,
        t.title,
        t.description,
        t.completed,
        t.priority,
        t.due_date,
        t.created_at,
        t.updated_at,
        c.name as category_name,
        c.color as category_color,
        c.id as category_id
      FROM tasks t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE ${whereClause}
      ${orderClause}
      ${limitClause}
    `;

    // Count query for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM tasks t
      WHERE ${whereClause}
    `;

    try {
      const [tasksResult, countResult] = await Promise.all([
        this.dal.query(query, params),
        this.dal.query(countQuery, params.slice(0, -2))
      ]);

      const response = {
        tasks: tasksResult.rows,
        pagination: {
          total: parseInt(countResult.rows[0].total),
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: (parseInt(offset) + parseInt(limit)) < parseInt(countResult.rows[0].total)
        }
      };

      // Cache the result
      await this.dal.setCached(cacheKey, response, this.dal.cacheTTL.short);

      return { ...response, fromCache: false };

    } catch (error) {
      this.dal.logger.error('Failed to get user tasks', { 
        userId, 
        filters, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get a specific task by ID
   */
  async getTaskById(taskId, userId) {
    const cacheKey = this.dal.generateCacheKey('task', taskId, userId);

    // Try cache first
    const cached = await this.dal.getCached(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    const query = `
      SELECT 
        t.id,
        t.title,
        t.description,
        t.completed,
        t.priority,
        t.due_date,
        t.created_at,
        t.updated_at,
        c.name as category_name,
        c.color as category_color,
        c.id as category_id
      FROM tasks t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.id = $1 AND t.user_id = $2
    `;

    try {
      const result = await this.dal.query(query, [taskId, userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const task = result.rows[0];

      // Cache the result
      await this.dal.setCached(cacheKey, task, this.dal.cacheTTL.medium);

      return { ...task, fromCache: false };

    } catch (error) {
      this.dal.logger.error('Failed to get task by ID', { 
        taskId, 
        userId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Create a new task
   */
  async createTask(userId, taskData) {
    const {
      title,
      description,
      priority = 'medium',
      due_date,
      category_id
    } = taskData;

    // Validate category if provided
    if (category_id) {
      const categoryExists = await this.validateCategoryOwnership(category_id, userId);
      if (!categoryExists) {
        throw new Error('Category not found or does not belong to user');
      }
    }

    const query = `
      INSERT INTO tasks (title, description, priority, due_date, category_id, user_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, title, description, completed, priority, due_date, created_at, updated_at
    `;

    try {
      const result = await this.dal.query(query, [
        title, 
        description, 
        priority, 
        due_date, 
        category_id, 
        userId
      ]);

      const newTask = result.rows[0];

      // Invalidate user tasks cache
      await this.invalidateUserTasksCache(userId);

      this.dal.logger.info('Task created', { taskId: newTask.id, userId });

      return newTask;

    } catch (error) {
      this.dal.logger.error('Failed to create task', { 
        userId, 
        taskData, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Update an existing task
   */
  async updateTask(taskId, userId, updateData) {
    const { title, description, completed, priority, due_date, category_id } = updateData;

    // Check if task exists and belongs to user
    const existingTask = await this.getTaskById(taskId, userId);
    if (!existingTask) {
      return null;
    }

    // Validate category if provided
    if (category_id !== undefined && category_id !== null) {
      const categoryExists = await this.validateCategoryOwnership(category_id, userId);
      if (!categoryExists) {
        throw new Error('Category not found or does not belong to user');
      }
    }

    // Build dynamic update query
    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;

    if (title !== undefined) {
      updateFields.push(`title = $${paramCount}`);
      updateValues.push(title);
      paramCount++;
    }

    if (description !== undefined) {
      updateFields.push(`description = $${paramCount}`);
      updateValues.push(description);
      paramCount++;
    }

    if (completed !== undefined) {
      updateFields.push(`completed = $${paramCount}`);
      updateValues.push(completed);
      paramCount++;
    }

    if (priority !== undefined) {
      updateFields.push(`priority = $${paramCount}`);
      updateValues.push(priority);
      paramCount++;
    }

    if (due_date !== undefined) {
      updateFields.push(`due_date = $${paramCount}`);
      updateValues.push(due_date);
      paramCount++;
    }

    if (category_id !== undefined) {
      updateFields.push(`category_id = $${paramCount}`);
      updateValues.push(category_id);
      paramCount++;
    }

    if (updateFields.length === 0) {
      throw new Error('No fields to update');
    }

    updateValues.push(taskId, userId);

    const query = `
      UPDATE tasks 
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
      RETURNING id, title, description, completed, priority, due_date, created_at, updated_at
    `;

    try {
      const result = await this.dal.query(query, updateValues);

      if (result.rows.length === 0) {
        return null;
      }

      const updatedTask = result.rows[0];

      // Invalidate related cache entries
      await Promise.all([
        this.invalidateUserTasksCache(userId),
        this.dal.deleteCached(this.dal.generateCacheKey('task', taskId, userId))
      ]);

      this.dal.logger.info('Task updated', { taskId, userId });

      return updatedTask;

    } catch (error) {
      this.dal.logger.error('Failed to update task', { 
        taskId, 
        userId, 
        updateData, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId, userId) {
    const query = `
      DELETE FROM tasks 
      WHERE id = $1 AND user_id = $2 
      RETURNING id
    `;

    try {
      const result = await this.dal.query(query, [taskId, userId]);

      if (result.rows.length === 0) {
        return false;
      }

      // Invalidate related cache entries
      await Promise.all([
        this.invalidateUserTasksCache(userId),
        this.dal.deleteCached(this.dal.generateCacheKey('task', taskId, userId))
      ]);

      this.dal.logger.info('Task deleted', { taskId, userId });

      return true;

    } catch (error) {
      this.dal.logger.error('Failed to delete task', { 
        taskId, 
        userId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Get task statistics for a user
   */
  async getTaskStats(userId) {
    const cacheKey = this.dal.generateCacheKey('user_task_stats', userId);

    // Try cache first
    const cached = await this.dal.getCached(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE completed = true) as completed,
        COUNT(*) FILTER (WHERE completed = false) as pending,
        COUNT(*) FILTER (WHERE priority = 'urgent') as urgent,
        COUNT(*) FILTER (WHERE priority = 'high') as high_priority,
        COUNT(*) FILTER (WHERE due_date < NOW() AND completed = false) as overdue
      FROM tasks 
      WHERE user_id = $1
    `;

    try {
      const result = await this.dal.query(query, [userId]);
      const stats = result.rows[0];

      // Convert counts to integers
      Object.keys(stats).forEach(key => {
        stats[key] = parseInt(stats[key]) || 0;
      });

      // Cache for short period (stats change frequently)
      await this.dal.setCached(cacheKey, stats, this.dal.cacheTTL.short);

      return { ...stats, fromCache: false };

    } catch (error) {
      this.dal.logger.error('Failed to get task stats', { 
        userId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Validate category ownership
   */
  async validateCategoryOwnership(categoryId, userId) {
    const query = 'SELECT id FROM categories WHERE id = $1 AND user_id = $2';
    
    try {
      const result = await this.dal.query(query, [categoryId, userId]);
      return result.rows.length > 0;
    } catch (error) {
      this.dal.logger.error('Failed to validate category ownership', { 
        categoryId, 
        userId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Invalidate user tasks cache patterns
   */
  async invalidateUserTasksCache(userId) {
    // Note: In production, you might want to use Redis SCAN for pattern deletion
    // For now, we'll just delete the common cache keys
    const patterns = [
      this.dal.generateCacheKey('user_tasks', userId),
      this.dal.generateCacheKey('user_task_stats', userId)
    ];

    await this.dal.invalidateCache(patterns);
  }
}

module.exports = TaskRepository;