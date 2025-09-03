import { Request, Response, NextFunction } from 'express';


interface RequestBody {
  title: string;
  description: string;
  priority: string;
  due_date: string;
  category_id: string;
  hasOwnProperty: function hasOwnProperty() { [native code] };
}

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const { dal } = require('../data/DataAccessLayer');
const TaskRepository = require('../data/TaskRepository');

const router = express.Router();

// Initialize and register TaskRepository with DAL
const taskRepository = dal.registerRepository('tasks', new TaskRepository());

// Middleware to ensure DAL is initialized
const ensureDALInitialized = async (req, res, next): Promise<any> => {
  try {
    if (!dal.isInitialized) {
      await dal.initialize();
    }
    next();
  } catch (error) {
    req.logger?.error('DAL initialization failed', { error: error.message });
    res.status(503).json({
      success: false,
      error: 'Service temporarily unavailable'
    });
  }
};

// Apply DAL middleware to all routes
router.use(ensureDALInitialized);

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

    const userId = req.user.id;
    const filters = {
      completed: req.query.completed,
      priority: req.query.priority,
      category_id: req.query.category_id,
      sort: req.query.sort || 'created_at',
      order: req.query.order || 'desc',
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0
    };

    // Use repository to get tasks
    const result = await taskRepository.getUserTasks(userId, filters);

    // Log cache performance
    const logger = req.logger || dal.logger;
    logger.info('Tasks retrieved', {
      userId,
      taskCount: result.tasks.length,
      fromCache: result.fromCache,
      filters
    });

    res.json({
      success: true,
      data: result,
      cached: result.fromCache
    });

  } catch (error) {
    next(error);
  }
});

// Get a specific task by ID
router.get('/:id', [
  auth,
  // Add parameter validation
  (req, res, next) => {
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId) || taskId < 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid task ID'
      });
    }
    req.params.id = taskId;
    next();
  }
], async (req, res, next) => {
  try {
    const taskId = req.params.id;
    const userId = req.user.id;

    // Use repository to get task
    const task = await taskRepository.getTaskById(taskId, userId);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    // Log access
    const logger = req.logger || dal.logger;
    logger.info('Task retrieved', {
      taskId,
      userId,
      fromCache: task.fromCache
    });

    res.json({
      success: true,
      data: task,
      cached: task.fromCache
    });

  } catch (error) {
    next(error);
  }
});

// Create a new task
router.post('/', [
  auth,
  body('title').trim().isLength({ min: 1, max: 255 }).escape(),
  body('description').optional().trim().isLength({ max: 1000 }).escape(),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('due_date').optional().isISO8601().toDate(),
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

    const userId = req.user.id;
    const taskData = {
      title: req.body.title,
      description: req.body.description,
      priority: req.body.priority || 'medium',
      due_date: req.body.due_date,
      category_id: req.body.category_id
    };

    // Use repository to create task
    const newTask = await taskRepository.createTask(userId, taskData);

    // Log creation
    const logger = req.logger || dal.logger;
    logger.info('Task created', {
      taskId: newTask.id,
      userId,
      title: newTask.title
    });

    res.status(201).json({
      success: true,
      data: newTask
    });

  } catch (error) {
    // Handle repository-specific errors
    if (error.message.includes('Category not found')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    next(error);
  }
});

// Update a task
router.put('/:id', [
  auth,
  // Parameter validation
  (req, res, next) => {
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId) || taskId < 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid task ID'
      });
    }
    req.params.id = taskId;
    next();
  },
  body('title').optional().trim().isLength({ min: 1, max: 255 }).escape(),
  body('description').optional().trim().isLength({ max: 1000 }).escape(),
  body('completed').optional().isBoolean(),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('due_date').optional().isISO8601().toDate(),
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

    const taskId = req.params.id;
    const userId = req.user.id;
    
    // Extract only fields that were provided
    const updateData = {};
    const allowedFields = ['title', 'description', 'completed', 'priority', 'due_date', 'category_id'];
    
    for (const field of allowedFields) {
      if (req.body.hasOwnProperty(field)) {
        updateData[field] = req.body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    // Use repository to update task
    const updatedTask = await taskRepository.updateTask(taskId, userId, updateData);

    if (!updatedTask) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    // Log update
    const logger = req.logger || dal.logger;
    logger.info('Task updated', {
      taskId,
      userId,
      fieldsUpdated: Object.keys(updateData)
    });

    res.json({
      success: true,
      data: updatedTask
    });

  } catch (error) {
    // Handle repository-specific errors
    if (error.message.includes('Category not found')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    if (error.message.includes('No fields to update')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    next(error);
  }
});

// Delete a task
router.delete('/:id', [
  auth,
  // Parameter validation
  (req, res, next) => {
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId) || taskId < 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid task ID'
      });
    }
    req.params.id = taskId;
    next();
  }
], async (req, res, next) => {
  try {
    const taskId = req.params.id;
    const userId = req.user.id;

    // Use repository to delete task
    const deleted = await taskRepository.deleteTask(taskId, userId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    // Log deletion
    const logger = req.logger || dal.logger;
    logger.info('Task deleted', {
      taskId,
      userId
    });

    res.json({
      success: true,
      message: 'Task deleted successfully'
    });

  } catch (error) {
    next(error);
  }
});

// Get task statistics for the user
router.get('/stats/summary', auth, async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Use repository to get stats
    const stats = await taskRepository.getTaskStats(userId);

    // Log stats access
    const logger = req.logger || dal.logger;
    logger.info('Task stats retrieved', {
      userId,
      fromCache: stats.fromCache
    });

    res.json({
      success: true,
      data: stats,
      cached: stats.fromCache
    });

  } catch (error) {
    next(error);
  }
});

// Health check endpoint for task repository
router.get('/health/repository', auth, async (req, res, next) => {
  try {
    // Check repository health
    const health = await taskRepository.healthCheck();
    
    res.json({
      success: true,
      data: health
    });

  } catch (error) {
    res.status(503).json({
      success: false,
      error: 'Repository health check failed',
      details: error.message
    });
  }
});

module.exports = router;