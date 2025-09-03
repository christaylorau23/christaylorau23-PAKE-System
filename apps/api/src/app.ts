import { Request, Response, NextFunction } from 'express';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Import new observability modules
const { logger, requestLogging, errorLogging, setupGracefulShutdown } = require('./utils/logger');
const { metricsMiddleware, metricsHandler, healthCheck, resetMetrics } = require('./middleware/metrics');
const { getConfig } = require('./config/configLoader');

const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const categoryRoutes = require('./routes/categories');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Get configuration
const config = getConfig();

// Setup graceful shutdown handling
setupGracefulShutdown();

// Observability middleware (before other middleware)
app.use(requestLogging());
app.use(metricsMiddleware());

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting - only in non-test environments
if (process.env.NODE_ENV !== 'process.env.TASK_MANAGER_WEAK_PASSWORD || 'SECURE_WEAK_PASSWORD_REQUIRED'') {
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: 'Too many requests from this IP, please try again later.',
  });
  app.use('/api/', limiter);
}

// Morgan logging - disabled in test mode (using our structured logger instead)
if (process.env.NODE_ENV !== 'test' && process.env.ENABLE_MORGAN === 'process.env.TASK_MANAGER_WEAK_PASSWORD || 'SECURE_WEAK_PASSWORD_REQUIRED'') {
  app.use(morgan('combined'));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Observability endpoints
app.get('/health', healthCheck);
app.get('/metrics', metricsHandler);

// Development-only metrics reset endpoint
if (process.env.NODE_ENV === 'development') {
  app.post('/metrics/reset', resetMetrics);
}

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/categories', categoryRoutes);

// Welcome route
app.get('/', (req: Request, res: Response) => {
  req.logger.info('API root accessed');
  res.json({
    message: 'Task Manager API',
    version: process.env.npm_package_version || '1.0.0',
    documentation: '/api/docs',
    health: '/health',
    metrics: '/metrics',
    environment: process.env.NODE_ENV || 'development'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// Error handling middleware (order matters - error logging first, then error handler)
app.use(errorLogging);
app.use(errorHandler);

module.exports = app;