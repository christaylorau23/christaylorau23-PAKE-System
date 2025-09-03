import { Request, Response, NextFunction } from 'express';

require('dotenv').config();

const app = require('./app');
const { connectDB, connectRedis } = require('./config/database');
const { getConfig } = require('./config/configLoader');
const { getServiceConfig } = require('./config/serviceConfig');

const config = getConfig();
const serviceConfig = getServiceConfig();
const PORT = config.get('server.port', 3000);

// Initialize database connections and start server
async function startServer() {
  try {
    // Connect to databases
    await connectDB();
    await connectRedis();
    
    // Start server
    app.listen(PORT, () => {
      const host = serviceConfig.getEnvironmentInfo().isDocker ? 'http://task-api' : 'http://localhost';
      logger.info(`🚀 Task Manager API running on port ${PORT}`);
      logger.info(`📊 Health check: ${host}:${PORT}/health`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
      logger.info(`🐳 Docker: ${serviceConfig.getEnvironmentInfo().isDocker}`);
      
      // Log service URLs
      const mcpConfig = config.getMcpConfig();
      if (mcpConfig.enabled && mcpConfig.url) {
        logger.info(`🔗 MCP Server: ${mcpConfig.url}`);
      }
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

startServer();