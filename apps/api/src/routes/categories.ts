import { Request, Response, NextFunction } from 'express';

const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool, redis } = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all categories for the authenticated user
router.get('/', auth, async (req, res, next) => {
  try {
    const cacheKey = `user_categories:${req.user.id}`;
    
    // Try to get from Redis cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: JSON.parse(cached),
        cached: true
      });
    }

    // Get categories from database
    const result = await pool.query(
      'SELECT id, name, color, created_at FROM categories WHERE user_id = $1 ORDER BY name',
      [req.user.id]
    );

    // Cache the result for 30 minutes
    await redis.set(cacheKey, result.rows, 1800);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
});

// Create a new category
router.post('/', [
  auth,
  body('name').trim().isLength({ min: 1, max: 100 }),
  body('color').optional().matches(/^#[0-9A-F]{6}$/i)
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

    const { name, color = '#3B82F6' } = req.body;

    // Check if category already exists for this user
    const existingCategory = await pool.query(
      'SELECT id FROM categories WHERE name = $1 AND user_id = $2',
      [name, req.user.id]
    );

    if (existingCategory.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Category with this name already exists'
      });
    }

    // Create category
    const result = await pool.query(
      'INSERT INTO categories (name, color, user_id) VALUES ($1, $2, $3) RETURNING id, name, color, created_at',
      [name, color, req.user.id]
    );

    // Clear cache
    await redis.del(`user_categories:${req.user.id}`);

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// Update a category
router.put('/:id', [
  auth,
  body('name').optional().trim().isLength({ min: 1, max: 100 }),
  body('color').optional().matches(/^#[0-9A-F]{6}$/i)
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
    const { name, color } = req.body;

    // Check if category exists and belongs to user
    const existingCategory = await pool.query(
      'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existingCategory.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    // Build update query dynamically
    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;

    if (name) {
      updateFields.push(`name = $${paramCount}`);
      updateValues.push(name);
      paramCount++;
    }

    if (color) {
      updateFields.push(`color = $${paramCount}`);
      updateValues.push(color);
      paramCount++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updateValues.push(id, req.user.id);

    const result = await pool.query(
      `UPDATE categories SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $${paramCount} AND user_id = $${paramCount + 1} 
       RETURNING id, name, color, created_at`,
      updateValues
    );

    // Clear cache
    await redis.del(`user_categories:${req.user.id}`);

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// Delete a category
router.delete('/:id', auth, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if category exists and belongs to user
    const existingCategory = await pool.query(
      'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existingCategory.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    // Delete category (tasks will have category_id set to NULL due to ON DELETE SET NULL)
    await pool.query(
      'DELETE FROM categories WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    // Clear caches
    await redis.del(`user_categories:${req.user.id}`);
    await redis.del(`user_tasks:${req.user.id}`);

    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;