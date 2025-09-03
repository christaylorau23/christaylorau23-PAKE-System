/**
 * Unified Configuration Loader for Task Manager API
 * Supports hierarchical configuration: defaults -> config.json -> environment variables
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  database: {
    host: 'localhost',
    port: 5432,
    name: 'task_manager',
    user: 'postgres',
    password: '',
    ssl: false,
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMs: 60000,
      createTimeoutMs: 30000,
      destroyTimeoutMs: 5000,
      idleTimeoutMs: 30000,
      reapIntervalMs: 1000,
      createRetryIntervalMs: 200
    }
  },
  
  redis: {
    host: 'localhost',
    port: 6379,
    password: '',
    db: 0,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    enableOfflineQueue: false,
    connectTimeout: 10000,
    lazyConnect: true,
    cache: {
      default_ttl_seconds: 300,  // 5 minutes
      max_ttl_seconds: 3600,     // 1 hour
      key_prefix: 'task_manager:'
    }
  },

  server: {
    port: 3000,
    host: '0.0.0.0',
    cors: {
      enabled: true,
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization']
    },
    rate_limiting: {
      enabled: true,
      window_minutes: 15,
      max_requests: 100,
      skip_successful: false
    },
    request_timeout: 30000,
    body_limit: '1mb'
  },

  authentication: {
    jwt: {
      secret: '',  // Must be set via environment
      expires_in: '24h',
      issuer: 'task-manager-api',
      audience: 'task-manager-client'
    },
    password: {
      min_length: 8,
      require_uppercase: true,
      require_lowercase: true,
      require_numbers: true,
      require_symbols: false,
      max_attempts: 5,
      lockout_minutes: 15
    },
    session: {
      cookie_name: 'task_session',
      secure: true,
      http_only: true,
      same_site: 'strict',
      max_age_hours: 24
    }
  },

  logging: {
    level: 'info',
    format: 'json',
    include_stack_trace: false,
    max_stack_trace_lines: 5,
    file_logging: {
      enabled: false,
      filename: 'task-manager.log',
      max_size: '10m',
      max_files: 5
    },
    console_logging: {
      enabled: true,
      colorize: true
    }
  },

  security: {
    helmet: {
      enabled: true,
      content_security_policy: true,
      cross_origin_embedder_policy: true,
      dns_prefetch_control: true,
      frame_guard: true,
      hide_powered_by: true,
      hsts: true,
      ie_no_open: true,
      no_sniff: true,
      origin_agent_cluster: true,
      permitted_cross_domain_policies: true,
      referrer_policy: true,
      x_content_type_options: true,
      x_dns_prefetch_control: true,
      x_download_options: true,
      x_frame_options: true,
      x_permitted_cross_domain_policies: true,
      x_powered_by: false,
      x_xss_protection: true
    },
    sanitization: {
      enabled: true,
      strip_html: true,
      escape_sql: true,
      max_input_length: 10000
    }
  },

  tasks: {
    pagination: {
      default_limit: 20,
      max_limit: 100
    },
    priorities: ['low', 'medium', 'high', 'urgent'],
    statuses: ['pending', 'in_progress', 'completed', 'cancelled'],
    default_priority: 'medium',
    default_status: 'pending',
    auto_archive_days: 90
  },

  // External Services Configuration
  services: {
    mcp: {
      url: '', // Will be set via environment variable
      enabled: true,
      timeout: 30000,
      retries: 3,
      health_check_interval: 60000
    },
    ollama: {
      url: '', // Will be set via environment variable
      enabled: false,
      timeout: 30000
    }
  }
};

class ConfigLoader {
  constructor(configFile = null, environmentPrefix = 'TM_') {
    this.environmentPrefix = environmentPrefix;
    this.configFilePath = null;
    this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); // Deep clone
    
    this._loadConfiguration(configFile);
  }

  /**
   * Load configuration in hierarchical order
   */
  _loadConfiguration(configFile) {
    // Step 1: Load config file overrides
    const configData = this._loadConfigFile(configFile);
    if (configData) {
      this._applyConfigOverrides(configData);
    }

    // Step 2: Apply environment variable overrides
    this._applyEnvironmentOverrides();

    // Step 3: Validate configuration
    this._validateConfiguration();
  }

  /**
   * Find configuration file using multiple search strategies
   */
  _findConfigFile(configFile) {
    const searchPaths = [];

    // 1. Explicit config file path
    if (configFile) {
      searchPaths.push(configFile);
    }

    // 2. Environment variable
    const envConfigPath = process.env[`${this.environmentPrefix}CONFIG_FILE`];
    if (envConfigPath) {
      searchPaths.push(envConfigPath);
    }

    // 3. Standard locations relative to current working directory
    searchPaths.push(
      path.join(process.cwd(), 'config.json'),
      path.join(process.cwd(), 'config', 'config.json'),
      path.join(process.cwd(), 'configs', 'config.json')
    );

    // 4. Standard locations relative to script directory
    const scriptDir = path.dirname(__filename);
    searchPaths.push(
      path.join(scriptDir, 'config.json'),
      path.join(scriptDir, '..', 'config.json'),
      path.join(scriptDir, '..', 'config', 'config.json'),
      path.join(scriptDir, '..', 'configs', 'config.json')
    );

    // Return first existing file
    for (const filePath of searchPaths) {
      try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          return path.resolve(filePath);
        }
      } catch (error) {
        // Continue searching if file access fails
        continue;
      }
    }

    return null;
  }

  /**
   * Load configuration from JSON file
   */
  _loadConfigFile(configFile) {
    const configPath = this._findConfigFile(configFile);
    if (!configPath) {
      logger.info('No configuration file found, using defaults');
      return null;
    }

    try {
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      this.configFilePath = configPath;
      logger.info(`Loaded configuration from: ${configPath}`);
      return configData;
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn(`Config file not found: ${configPath}`);
      } else if (error instanceof SyntaxError) {
        logger.error(`Invalid JSON in config file ${configPath}: ${error.message}`);
      } else {
        logger.error(`Error loading config file ${configPath}: ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Apply configuration file overrides to default values
   */
  _applyConfigOverrides(configData) {
    this.config = this._deepMerge(this.config, configData);
  }

  /**
   * Deep merge two objects
   */
  _deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = this._deepMerge(target[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  /**
   * Apply environment variable overrides
   */
  _applyEnvironmentOverrides() {
    // Database configuration
    this._setFromEnv('database.host', 'DB_HOST');
    this._setFromEnv('database.port', 'DB_PORT', 'number');
    this._setFromEnv('database.name', 'DB_NAME');
    this._setFromEnv('database.user', 'DB_USER');
    this._setFromEnv('database.password', 'DB_PASSWORD');
    this._setFromEnv('database.ssl', 'DB_SSL', 'boolean');

    // Redis configuration
    this._setFromEnv('redis.host', 'REDIS_HOST');
    this._setFromEnv('redis.port', 'REDIS_PORT', 'number');
    this._setFromEnv('redis.password', 'REDIS_PASSWORD');
    this._setFromEnv('redis.db', 'REDIS_DB', 'number');
    this._setFromEnv('redis.cache.default_ttl_seconds', 'REDIS_TTL', 'number');
    this._setFromEnv('redis.cache.max_ttl_seconds', 'REDIS_MAX_TTL', 'number');

    // Server configuration
    this._setFromEnv('server.port', 'PORT', 'number');
    this._setFromEnv('server.host', 'HOST');
    this._setFromEnv('server.request_timeout', 'REQUEST_TIMEOUT', 'number');

    // Authentication configuration
    this._setFromEnv('authentication.jwt.secret', 'JWT_SECRET');
    this._setFromEnv('authentication.jwt.expires_in', 'JWT_EXPIRES_IN');

    // Logging configuration
    this._setFromEnv('logging.level', 'LOG_LEVEL');
    this._setFromEnv('logging.format', 'LOG_FORMAT');

    // External Services configuration (check both prefixed and unprefixed)
    this._setFromEnvFallback('services.mcp.url', 'MCP_SERVER_URL');
    this._setFromEnvFallback('services.mcp.enabled', 'MCP_SERVER_ENABLED', 'boolean');
    this._setFromEnvFallback('services.mcp.timeout', 'MCP_TIMEOUT', 'number');
    this._setFromEnvFallback('services.mcp.retries', 'MCP_RETRIES', 'number');
    this._setFromEnvFallback('services.ollama.url', 'OLLAMA_URL');
    this._setFromEnvFallback('services.ollama.enabled', 'OLLAMA_ENABLED', 'boolean');

    // Environment-specific settings
    const nodeEnv = process.env.NODE_ENV || 'development';
    if (nodeEnv === 'production') {
      // Only override logging level if not explicitly set via environment
      if (!process.env[this.environmentPrefix + 'LOG_LEVEL']) {
        this.config.logging.level = 'warn';
      }
      this.config.security.helmet.enabled = true;
      this.config.authentication.session.secure = true;
    } else if (nodeEnv === 'development') {
      // Only override logging level if not explicitly set via environment
      if (!process.env[this.environmentPrefix + 'LOG_LEVEL']) {
        this.config.logging.level = 'debug';
      }
      this.config.security.helmet.enabled = false;
      this.config.authentication.session.secure = false;
    }
  }

  /**
   * Set configuration value from environment variable
   */
  _setFromEnv(configPath, envKey, type = 'string') {
    const fullEnvKey = this.environmentPrefix + envKey;
    const envValue = process.env[fullEnvKey];

    if (envValue !== undefined) {
      let convertedValue = envValue;

      try {
        switch (type) {
          case 'number':
            convertedValue = Number(envValue);
            if (isNaN(convertedValue)) {
              throw new Error(`Invalid number: ${envValue}`);
            }
            break;
          case 'boolean':
            convertedValue = envValue.toLowerCase() === 'true' || envValue === '1';
            break;
          case 'json':
            convertedValue = JSON.parse(envValue);
            break;
          // 'string' requires no conversion
        }

        this._setNestedValue(this.config, configPath, convertedValue);
        logger.info(`Environment override: ${configPath} = ${convertedValue}`);

      } catch (error) {
        logger.warn(`Invalid environment value for ${fullEnvKey}: ${envValue} (${error.message})`);
      }
    }
  }

  /**
   * Set configuration value from environment variable with fallback to unprefixed
   * For backward compatibility with service configuration
   */
  _setFromEnvFallback(configPath, envKey, type = 'string') {
    // First try prefixed version
    const prefixedEnvKey = this.environmentPrefix + envKey;
    let envValue = process.env[prefixedEnvKey];
    
    // Fallback to unprefixed version for backward compatibility
    if (envValue === undefined) {
      envValue = process.env[envKey];
    }

    if (envValue !== undefined) {
      let convertedValue = envValue;

      try {
        switch (type) {
          case 'number':
            convertedValue = Number(envValue);
            if (isNaN(convertedValue)) {
              throw new Error(`Invalid number: ${envValue}`);
            }
            break;
          case 'boolean':
            convertedValue = envValue.toLowerCase() === 'true' || envValue === '1';
            break;
          case 'json':
            convertedValue = JSON.parse(envValue);
            break;
          // 'string' requires no conversion
        }

        this._setNestedValue(this.config, configPath, convertedValue);
        logger.info(`Environment override: ${configPath} = ${convertedValue}`);

      } catch (error) {
        const usedKey = process.env[prefixedEnvKey] !== undefined ? prefixedEnvKey : envKey;
        logger.warn(`Invalid environment value for ${usedKey}: ${envValue} (${error.message})`);
      }
    }
  }

  /**
   * Set nested value in object using dot notation
   */
  _setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key];
    }, obj);

    target[lastKey] = value;
  }

  /**
   * Get nested value from object using dot notation
   */
  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Validate configuration values
   */
  _validateConfiguration() {
    const issues = [];

    // Validate required values
    if (!this.config.authentication.jwt.secret) {
      issues.push('JWT secret is required (set TM_JWT_SECRET environment variable)');
    }

    // Validate numeric ranges
    if (this.config.server.port < 1 || this.config.server.port > 65535) {
      issues.push('Server port must be between 1 and 65535');
    }

    if (this.config.tasks.pagination.default_limit > this.config.tasks.pagination.max_limit) {
      issues.push('Default pagination limit cannot exceed maximum limit');
    }

    if (this.config.redis.cache.default_ttl_seconds > this.config.redis.cache.max_ttl_seconds) {
      issues.push('Default cache TTL cannot exceed maximum TTL');
    }

    if (issues.length > 0) {
      logger.error('Configuration validation errors:');
      issues.forEach(issue => logger.error(`  - ${issue}`));
      throw new Error('Configuration validation failed');
    }

    logger.info('Configuration validation passed');
  }

  /**
   * Get configuration value with optional default
   */
  get(path, defaultValue = null) {
    const value = this._getNestedValue(this.config, path);
    return value !== undefined ? value : defaultValue;
  }

  /**
   * Get database configuration
   */
  getDatabaseConfig() {
    return this.config.database;
  }

  /**
   * Get Redis configuration
   */
  getRedisConfig() {
    return this.config.redis;
  }

  /**
   * Get cache TTL based on environment
   */
  getCacheTTL(environment = null) {
    const env = environment || process.env.NODE_ENV || 'development';
    
    if (env === 'production') {
      return this.config.redis.cache.default_ttl_seconds;
    } else {
      return 0; // No caching in development
    }
  }

  /**
   * Get server configuration
   */
  getServerConfig() {
    return this.config.server;
  }

  /**
   * Get logging configuration
   */
  getLoggingConfig() {
    return this.config.logging;
  }

  /**
   * Get security configuration
   */
  getSecurityConfig() {
    return this.config.security;
  }

  /**
   * Get tasks configuration
   */
  getTasksConfig() {
    return this.config.tasks;
  }

  /**
   * Get services configuration
   */
  getServicesConfig() {
    return this.config.services;
  }

  /**
   * Get MCP server configuration
   */
  getMcpConfig() {
    return this.config.services.mcp;
  }

  /**
   * Get Ollama configuration
   */
  getOllamaConfig() {
    return this.config.services.ollama;
  }

  /**
   * Export full configuration for inspection
   */
  toJSON() {
    return {
      ...this.config,
      _metadata: {
        configFilePath: this.configFilePath,
        environmentPrefix: this.environmentPrefix,
        nodeEnv: process.env.NODE_ENV,
        loadedAt: new Date().toISOString()
      }
    };
  }
}

// Global configuration instance
let configInstance = null;

/**
 * Get global configuration instance (singleton pattern)
 */
function getConfig(configFile = null, forceReload = false): Promise<any> {
  if (!configInstance || forceReload) {
    configInstance = new ConfigLoader(configFile);
  }
  return configInstance;
}

module.exports = {
  ConfigLoader,
  getConfig,
  DEFAULT_CONFIG
};