import { Request, Response, NextFunction } from 'express';

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { pool, cacheService } = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all tasks for the authenticated user with filtering and sorting
router.get('/', [
  auth,
  query('completed').optional().isBoolean(),
  query('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  query('category_id').optional().isInt({ min: 1 }),
  query('sort').optional().isIn(['created_at', 'due_date', 'priority', 'title']),
  query('order').optional().isIn(['asc', 'desc']),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: errors.array()
      });
    }

    const {
      completed,
      priority,
      category_id,
      sort = 'created_at',
      order = 'desc',
      limit = 50,
      offset = 0
    } = req.query;

    // Try to get from cache first using CacheService
    const cached = await cacheService.getUserTasks(req.user.id, req.query);
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    // Build WHERE conditions
    const conditions = ['t.user_id = $1'];
    const params = [req.user.id];
    let paramCount = 2;

    if (completed !== undefined) {
      conditions.push(`t.completed = $${paramCount}`);
      params.push(completed === 'true');
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

    // Validate sort and order parameters against whitelists
    const allowedSortFields = ['created_at', 'due_date', 'priority', 'title'];
    const allowedOrderDirections = ['ASC', 'DESC'];
    
    if (!allowedSortFields.includes(sort)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid sort parameter',
        details: [`sort must be one of: ${allowedSortFields.join(', ')}`]
      });
    }
    
    if (!allowedOrderDirections.includes(order.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order parameter',
        details: [`order must be one of: ${allowedOrderDirections.join(', ')}`]
      });
    }

    // Build the query with whitelisted values
    const whereClause = conditions.join(' AND ');
    const orderClause = `ORDER BY t.${sort} ${order.toUpperCase()}`;
    const limitClause = `LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(parseInt(limit), parseInt(offset));

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

    const result = await pool.query(query, params);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM tasks t
      WHERE ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params.slice(0, -2));

    const response = {
      tasks: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < parseInt(countResult.rows[0].total)
      }
    };

    // Cache the result for 5 minutes using CacheService
    await cacheService.setUserTasks(req.user.id, req.query, response, cacheService.ttl.short);

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    next(error);
  }
});

// Get a specific task by ID
router.get('/:id', auth, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Try to get from cache first
    const cached = await cacheService.getUserTask(req.user.id, id);
    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    const result = await pool.query(`
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
    `, [id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    const taskData = result.rows[0];

    // Cache the individual task
    await cacheService.setUserTask(req.user.id, id, taskData, cacheService.ttl.medium);

    res.json({
      success: true,
      data: taskData
    });
  } catch (error) {
    next(error);
  }
});

// Create a new task
router.post('/', [
  auth,
  body('title').trim().isLength({ min: 1, max: 255 }),
  body('description').optional().trim(),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('due_date').optional().isISO8601(),
  body('category_id').optional().isInt({ min: 1 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: errors.array()
      });
    }

    const {
      title,
      description,
      priority = 'medium',
      due_date,
      category_id
    } = req.body;

    // Validate category belongs to user if provided
    if (category_id) {
      const categoryResult = await pool.query(
        'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
        [category_id, req.user.id]
      );

      if (categoryResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Category not found or does not belong to user'
        });
      }
    }

    // Create task
    const result = await pool.query(`
      INSERT INTO tasks (title, description, priority, due_date, category_id, user_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, title, description, completed, priority, due_date, created_at, updated_at
    `, [title, description, priority, due_date, category_id, req.user.id]);

    // Clear user tasks cache using pattern-based invalidation
    await cacheService.invalidateUserTasksCache(req.user.id);

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// Update a task
router.put('/:id', [
  auth,
  body('title').optional().trim().isLength({ min: 1, max: 255 }),
  body('description').optional().trim(),
  body('completed').optional().isBoolean(),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('due_date').optional().isISO8601(),
  body('category_id').optional().isInt({ min: 1 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: errors.array()
      });
    }

    const { id } = req.params;
    const { title, description, completed, priority, due_date, category_id } = req.body;

    // Check if task exists and belongs to user
    const existingTask = await pool.query(
      'SELECT id FROM tasks WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existingTask.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    // Validate category belongs to user if provided
    if (category_id) {
      const categoryResult = await pool.query(
        'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
        [category_id, req.user.id]
      );

      if (categoryResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Category not found or does not belong to user'
        });
      }
    }

    // Build update query dynamically
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
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updateValues.push(id, req.user.id);

    const result = await pool.query(`
      UPDATE tasks 
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
      RETURNING id, title, description, completed, priority, due_date, created_at, updated_at
    `, updateValues);

    // Clear user tasks cache using pattern-based invalidation
    await cacheService.invalidateUserTasksCache(req.user.id);
    
    // Also invalidate the specific task cache
    await cacheService.invalidateUserTask(req.user.id, id);

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// Delete a task
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if task exists and belongs to user
    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    // Clear user tasks cache using pattern-based invalidation
    await cacheService.invalidateUserTasksCache(req.user.id);
    
    // Also invalidate the specific task cache
    await cacheService.invalidateUserTask(req.user.id, id);

    res.json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;