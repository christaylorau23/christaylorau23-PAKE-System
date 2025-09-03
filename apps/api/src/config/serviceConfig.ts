/**
 * Service Configuration for External Service URLs
 * Handles service discovery via environment variables with fallbacks for local development
 */

const os = require('os');

class ServiceConfig {
  constructor() {
    this.config = {
      mcp: {
        // MCP Server Configuration
        url: process.env.MCP_SERVER_URL || this._getDefaultMcpUrl(),
        enabled: process.env.MCP_SERVER_ENABLED === 'true' || process.env.MCP_SERVER_ENABLED === '1' || true,
        timeout: parseInt(process.env.MCP_TIMEOUT) || 30000,
        retries: parseInt(process.env.MCP_RETRIES) || 3,
        healthCheck: {
          enabled: process.env.MCP_HEALTH_CHECK_ENABLED !== 'false',
          interval: parseInt(process.env.MCP_HEALTH_CHECK_INTERVAL) || 60000,
          endpoint: process.env.MCP_HEALTH_ENDPOINT || '/health'
        }
      },
      
      services: {
        // Database service (already handled by configLoader.js)
        database: {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT) || 5432
        },
        
        // Redis service (already handled by configLoader.js)  
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT) || 6379
        },
        
        // Additional services can be added here
        ollama: {
          url: process.env.OLLAMA_URL || this._getDefaultOllamaUrl(),
          enabled: process.env.OLLAMA_ENABLED === 'true' || false
        }
      },
      
      // Service discovery settings
      discovery: {
        // Docker Compose networking
        useDockerNetworking: this._isRunningInDocker(),
        networkName: process.env.DOCKER_NETWORK || 'app-network',
        
        // Health check configurations
        healthCheckEnabled: process.env.SERVICE_HEALTH_CHECK !== 'false',
        healthCheckInterval: parseInt(process.env.SERVICE_HEALTH_CHECK_INTERVAL) || 30000
      },
      
      // Environment detection
      environment: {
        isDocker: this._isRunningInDocker(),
        isProduction: process.env.NODE_ENV === 'production',
        isDevelopment: process.env.NODE_ENV === 'development' || !process.env.NODE_ENV
      }
    };
  }

  /**
   * Get MCP Server URL with environment-based defaults
   */
  _getDefaultMcpUrl() {
    // In Docker environment, use service name
    if (this._isRunningInDocker()) {
      return 'http://mcp-server:8000';
    }
    
    // For local development, check if MCP server might be running
    return 'http://localhost:8000';
  }

  /**
   * Get Ollama URL with environment-based defaults
   */
  _getDefaultOllamaUrl() {
    if (this._isRunningInDocker()) {
      return 'http://ollama:11434';
    }
    return 'http://localhost:11434';
  }

  /**
   * Detect if running in Docker container
   */
  _isRunningInDocker() {
    // Check multiple indicators
    if (process.env.DOCKER_CONTAINER === 'true') {
      return true;
    }
    
    // Check for Docker-specific environment variables
    if (process.env.HOSTNAME && process.env.HOSTNAME.length === 12) {
      return true;
    }
    
    // Check for cgroup indicating Docker
    try {
      const fs = require('fs');
      if (fs.existsSync('/proc/1/cgroup')) {
        const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
        return cgroup.includes('docker') || cgroup.includes('containerd');
      }
    } catch (error) {
      // Ignore file system errors
    }
    
    return false;
  }

  /**
   * Get MCP server configuration
   */
  getMcpConfig() {
    return this.config.mcp;
  }

  /**
   * Get service configuration by name
   */
  getServiceConfig(serviceName) {
    return this.config.services[serviceName] || null;
  }

  /**
   * Get all service URLs
   */
  getServiceUrls() {
    return {
      mcp: this.config.mcp.url,
      ollama: this.config.services.ollama.url,
      database: `postgresql://${this.config.services.database.host}:${this.config.services.database.port}`,
      redis: `redis://${this.config.services.redis.host}:${this.config.services.redis.port}`
    };
  }

  /**
   * Check if service is enabled
   */
  isServiceEnabled(serviceName) {
    switch (serviceName) {
      case 'mcp':
        return this.config.mcp.enabled;
      case 'ollama':
        return this.config.services.ollama.enabled;
      default:
        return false;
    }
  }

  /**
   * Get environment information
   */
  getEnvironmentInfo() {
    return {
      ...this.config.environment,
      nodeEnv: process.env.NODE_ENV,
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      containerized: this.config.environment.isDocker
    };
  }

  /**
   * Health check a service URL
   */
  async healthCheck(serviceName) {
    const serviceConfig = this.getMcpConfig();
    if (!serviceConfig || !serviceConfig.enabled) {
      return { status: 'disabled', service: serviceName };
    }

    try {
      const url = serviceName === 'mcp' 
        ? serviceConfig.url + serviceConfig.healthCheck.endpoint
        : this.getServiceConfig(serviceName)?.url;

      if (!url) {
        return { status: 'unknown', service: serviceName, error: 'No URL configured' };
      }

      // Use fetch with timeout (Node.js 18+ has native fetch)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), serviceConfig.timeout || 5000);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });

      clearTimeout(timeout);

      return {
        status: response.ok ? 'healthy' : 'unhealthy',
        service: serviceName,
        statusCode: response.status,
        url: url
      };

    } catch (error) {
      return {
        status: 'error',
        service: serviceName,
        error: error.message
      };
    }
  }

  /**
   * Export configuration for inspection
   */
  toJSON() {
    return {
      ...this.config,
      _metadata: {
        generatedAt: new Date().toISOString(),
        environment: this.getEnvironmentInfo()
      }
    };
  }
}

// Global instance
let serviceConfigInstance = null;

/**
 * Get global service configuration instance (singleton)
 */
function getServiceConfig(forceReload = false): Promise<any> {
  if (!serviceConfigInstance || forceReload) {
    serviceConfigInstance = new ServiceConfig();
  }
  return serviceConfigInstance;
}

module.exports = {
  ServiceConfig,
  getServiceConfig
};