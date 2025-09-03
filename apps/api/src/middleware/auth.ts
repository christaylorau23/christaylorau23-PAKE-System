import { Request, Response, NextFunction } from 'express';

const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

const auth = async (req, res, next): Promise<any> => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No token, authorization denied'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user still exists
    const result = await pool.query(
      'SELECT id, email, name FROM users WHERE id = $1',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Token is not valid'
      });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      error: 'Token is not valid'
    });
  }
};

module.exports = auth;