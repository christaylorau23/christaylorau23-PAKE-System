/**
 * Tests for Unified Configuration System (Node.js)
 * Tests hierarchical configuration loading, validation, and platform independence
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { ConfigLoader, getConfig, DEFAULT_CONFIG } = require('../../src/config/configLoader');

describe('ConfigLoader', () => {
  let tempConfigFile = null;

  beforeEach(() => {
    // Set required JWT secret for all tests
    process.env.TM_JWT_SECRET = 'test-jwt-secret-for-configuration-tests';
  });

  afterEach(() => {
    // Clean up temp files
    if (tempConfigFile && fs.existsSync(tempConfigFile)) {
      fs.unlinkSync(tempConfigFile);
      tempConfigFile = null;
    }
    
    // Clear any environment variables we set
    delete process.env.TM_CONFIG_FILE;
    delete process.env.TM_DB_HOST;
    delete process.env.TM_DB_PORT;
    delete process.env.TM_REDIS_TTL;
    delete process.env.TM_JWT_SECRET;
    delete process.env.NODE_ENV;
  });

  describe('Default Configuration Loading', () => {
    test('should load default configuration values', () => {
      const config = new ConfigLoader();
      
      // Test database defaults
      const dbConfig = config.getDatabaseConfig();
      expect(dbConfig.host).toBe('localhost');
      expect(dbConfig.port).toBe(5432);
      expect(dbConfig.name).toBe('task_manager');
      expect(dbConfig.user).toBe('postgres');
      
      // Test Redis defaults
      const redisConfig = config.getRedisConfig();
      expect(redisConfig.host).toBe('localhost');
      expect(redisConfig.port).toBe(6379);
      expect(redisConfig.cache.default_ttl_seconds).toBe(300);
      
      // Test server defaults
      const serverConfig = config.getServerConfig();
      expect(serverConfig.port).toBe(3000);
      expect(serverConfig.host).toBe('0.0.0.0');
      
      // Test tasks defaults
      const tasksConfig = config.getTasksConfig();
      expect(tasksConfig.pagination.default_limit).toBe(20);
      expect(tasksConfig.pagination.max_limit).toBe(100);
    });

    test('should have correct default structure', () => {
      const config = new ConfigLoader();
      const configData = config.toJSON();
      
      expect(configData).toHaveProperty('database');
      expect(configData).toHaveProperty('redis');
      expect(configData).toHaveProperty('server');
      expect(configData).toHaveProperty('authentication');
      expect(configData).toHaveProperty('logging');
      expect(configData).toHaveProperty('security');
      expect(configData).toHaveProperty('tasks');
      expect(configData).toHaveProperty('services');
      expect(configData).toHaveProperty('_metadata');
    });
  });

  describe('Configuration File Loading', () => {
    test('should load configuration from JSON file', () => {
      const configData = {
        database: {
          host: 'custom-db-host',
          port: 5433,
          name: 'custom_db'
        },
        redis: {
          cache: {
            default_ttl_seconds: 600
          }
        },
        server: {
          port: 8080
        }
      };

      // Create temporary config file
      tempConfigFile = path.join(os.tmpdir(), `test-config-${Date.now()}.json`);
      fs.writeFileSync(tempConfigFile, JSON.stringify(configData, null, 2));

      const config = new ConfigLoader(tempConfigFile);

      // Check that config file values override defaults
      expect(config.get('database.host')).toBe('custom-db-host');
      expect(config.get('database.port')).toBe(5433);
      expect(config.get('database.name')).toBe('custom_db');
      expect(config.get('redis.cache.default_ttl_seconds')).toBe(600);
      expect(config.get('server.port')).toBe(8080);

      // Check that unspecified values use defaults
      expect(config.get('database.user')).toBe('postgres');
      expect(config.get('redis.host')).toBe('localhost');
    });

    test('should handle missing config file gracefully', () => {
      const nonexistentFile = '/path/that/does/not/exist/config.json';
      
      // Should not throw an error
      expect(() => {
        new ConfigLoader(nonexistentFile);
      }).not.toThrow();
      
      const config = new ConfigLoader(nonexistentFile);
      
      // Should use default values
      expect(config.get('database.host')).toBe('localhost');
      expect(config.get('server.port')).toBe(3000);
    });

    test('should handle invalid JSON gracefully', () => {
      // Create file with invalid JSON
      tempConfigFile = path.join(os.tmpdir(), `invalid-config-${Date.now()}.json`);
      fs.writeFileSync(tempConfigFile, '{"invalid": json content}');

      // Should not throw an error
      expect(() => {
        new ConfigLoader(tempConfigFile);
      }).not.toThrow();

      const config = new ConfigLoader(tempConfigFile);
      
      // Should use default values when JSON is invalid
      expect(config.get('database.host')).toBe('localhost');
      expect(config.get('server.port')).toBe(3000);
    });
  });

  describe('Environment Variable Overrides', () => {
    test('should override configuration with environment variables', () => {
      // Set environment variables
      process.env.TM_DB_HOST = 'env-db-host';
      process.env.TM_DB_PORT = '5434';
      process.env.TM_REDIS_TTL = '450';
      process.env.TM_PORT = '4000';

      const config = new ConfigLoader();

      expect(config.get('database.host')).toBe('env-db-host');
      expect(config.get('database.port')).toBe(5434);
      expect(config.get('redis.cache.default_ttl_seconds')).toBe(450);
      expect(config.get('server.port')).toBe(4000);
    });

    test('should handle type conversion for environment variables', () => {
      // Set environment variables as strings (as they always are)
      process.env.TM_DB_PORT = '5435';
      process.env.TM_DB_SSL = 'true';
      process.env.TM_REDIS_DB = '2';

      const config = new ConfigLoader();

      // Should convert to correct types
      expect(config.get('database.port')).toBe(5435);
      expect(typeof config.get('database.port')).toBe('number');
      expect(config.get('database.ssl')).toBe(true);
      expect(typeof config.get('database.ssl')).toBe('boolean');
      expect(config.get('redis.db')).toBe(2);
      expect(typeof config.get('redis.db')).toBe('number');
    });

    test('should handle invalid environment variable values', () => {
      // Set invalid values
      process.env.TM_DB_PORT = 'not-a-number';
      
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      
      const config = new ConfigLoader();
      
      // Should use default value and log warning
      expect(config.get('database.port')).toBe(5432); // Default value
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid environment value')
      );
      
      consoleSpy.mockRestore();
    });

    test('should handle service configuration overrides', () => {
      // Test backward compatibility - unprefixed environment variables
      process.env.MCP_SERVER_URL = 'http://custom-mcp:9000';
      process.env.MCP_SERVER_ENABLED = 'false';
      process.env.MCP_TIMEOUT = '45000';
      process.env.OLLAMA_URL = 'http://custom-ollama:11435';
      process.env.OLLAMA_ENABLED = 'true';
      
      const config = new ConfigLoader();
      
      expect(config.get('services.mcp.url')).toBe('http://custom-mcp:9000');
      expect(config.get('services.mcp.enabled')).toBe(false);
      expect(config.get('services.mcp.timeout')).toBe(45000);
      expect(config.get('services.ollama.url')).toBe('http://custom-ollama:11435');
      expect(config.get('services.ollama.enabled')).toBe(true);
      
      // Clean up
      delete process.env.MCP_SERVER_URL;
      delete process.env.MCP_SERVER_ENABLED;
      delete process.env.MCP_TIMEOUT;
      delete process.env.OLLAMA_URL;
      delete process.env.OLLAMA_ENABLED;
    });
  });

  describe('Hierarchical Configuration Loading', () => {
    test('should apply configuration in correct priority order', () => {
      // Clear any conflicting environment variables first
      delete process.env.TM_PORT;
      
      // Create config file
      const configData = {
        database: { host: 'config-file-host', port: 5436 },
        server: { port: 8081 }
      };

      tempConfigFile = path.join(os.tmpdir(), `hierarchy-config-${Date.now()}.json`);
      fs.writeFileSync(tempConfigFile, JSON.stringify(configData, null, 2));

      // Set environment variables (should override config file)
      process.env.TM_DB_HOST = 'env-override-host';
      process.env.TM_REDIS_TTL = '720'; // Should override default

      const config = new ConfigLoader(tempConfigFile);

      // Environment should override config file
      expect(config.get('database.host')).toBe('env-override-host');

      // Config file should override default
      expect(config.get('database.port')).toBe(5436);
      expect(config.get('server.port')).toBe(8081);

      // Environment should override default
      expect(config.get('redis.cache.default_ttl_seconds')).toBe(720);

      // Defaults should be used when not overridden
      expect(config.get('database.user')).toBe('postgres');
      
      // Clean up environment variables
      delete process.env.TM_DB_HOST;
      delete process.env.TM_REDIS_TTL;
    });
  });

  describe('Configuration Validation', () => {
    test('should validate required configuration values', () => {
      // Remove JWT secret temporarily
      const originalSecret = process.env.TM_JWT_SECRET;
      delete process.env.TM_JWT_SECRET;
      
      // JWT secret is required - should throw without it
      expect(() => {
        new ConfigLoader();
      }).toThrow('Configuration validation failed');
      
      // Restore for other tests
      process.env.TM_JWT_SECRET = originalSecret;
    });

    test('should pass validation with required values set', () => {
      expect(() => {
        new ConfigLoader();
      }).not.toThrow();
      
      const config = new ConfigLoader();
      expect(config.get('authentication.jwt.secret')).toBe('test-jwt-secret-for-configuration-tests');
    });

    test('should validate numeric ranges', () => {
      // Set invalid port number
      const originalPort = process.env.TM_PORT;
      const originalSecret = process.env.TM_JWT_SECRET;
      process.env.TM_JWT_SECRET = 'test-secret'; // Required for validation
      process.env.TM_PORT = '70000'; // Invalid port number
      
      expect(() => {
        new ConfigLoader();
      }).toThrow('Configuration validation failed');
      
      // Clean up
      if (originalPort) {
        process.env.TM_PORT = originalPort;
      } else {
        delete process.env.TM_PORT;
      }
      if (originalSecret) {
        process.env.TM_JWT_SECRET = originalSecret;
      } else {
        delete process.env.TM_JWT_SECRET;
      }
    });

    test('should validate configuration relationships', () => {
      const originalSecret = process.env.TM_JWT_SECRET;
      process.env.TM_JWT_SECRET = 'test-secret'; // Required for validation
      
      const configData = {
        tasks: {
          pagination: {
            default_limit: 150, // Higher than max_limit
            max_limit: 100
          }
        }
      };

      tempConfigFile = path.join(os.tmpdir(), `validation-config-${Date.now()}.json`);
      fs.writeFileSync(tempConfigFile, JSON.stringify(configData, null, 2));

      expect(() => {
        new ConfigLoader(tempConfigFile);
      }).toThrow('Configuration validation failed');
      
      // Clean up
      if (originalSecret) {
        process.env.TM_JWT_SECRET = originalSecret;
      } else {
        delete process.env.TM_JWT_SECRET;
      }
    });
  });

  describe('Environment-Specific Configuration', () => {
    test('should adjust configuration for production environment', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.TM_JWT_SECRET;
      process.env.NODE_ENV = 'production';
      process.env.TM_JWT_SECRET = 'test-secret';
      
      const config = new ConfigLoader();
      
      expect(config.get('logging.level')).toBe('warn');
      expect(config.get('security.helmet.enabled')).toBe(true);
      expect(config.get('authentication.session.secure')).toBe(true);
      
      // Restore
      if (originalEnv) {
        process.env.NODE_ENV = originalEnv;
      } else {
        delete process.env.NODE_ENV;
      }
      if (originalSecret) {
        process.env.TM_JWT_SECRET = originalSecret;
      } else {
        delete process.env.TM_JWT_SECRET;
      }
    });

    test('should adjust configuration for development environment', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.TM_JWT_SECRET;
      process.env.NODE_ENV = 'development';
      process.env.TM_JWT_SECRET = 'test-secret';
      
      const config = new ConfigLoader();
      
      expect(config.get('logging.level')).toBe('debug');
      expect(config.get('security.helmet.enabled')).toBe(false);
      expect(config.get('authentication.session.secure')).toBe(false);
      
      // Restore
      if (originalEnv) {
        process.env.NODE_ENV = originalEnv;
      } else {
        delete process.env.NODE_ENV;
      }
      if (originalSecret) {
        process.env.TM_JWT_SECRET = originalSecret;
      } else {
        delete process.env.TM_JWT_SECRET;
      }
    });

    test('should provide appropriate cache TTL based on environment', () => {
      const originalSecret = process.env.TM_JWT_SECRET;
      process.env.TM_JWT_SECRET = 'test-secret';
      
      const config = new ConfigLoader();
      
      // Production should use configured TTL
      expect(config.getCacheTTL('production')).toBe(300);
      
      // Development should use no caching
      expect(config.getCacheTTL('development')).toBe(0);
      
      // Clean up
      if (originalSecret) {
        process.env.TM_JWT_SECRET = originalSecret;
      } else {
        delete process.env.TM_JWT_SECRET;
      }
    });
  });

  describe('Configuration Access Methods', () => {
    beforeEach(() => {
      process.env.TM_JWT_SECRET = 'test-jwt-secret-for-configuration-tests';
    });

    test('should provide convenient access methods', () => {
      const config = new ConfigLoader();
      
      // Test specific config getters
      expect(config.getDatabaseConfig()).toHaveProperty('host');
      expect(config.getRedisConfig()).toHaveProperty('host');
      expect(config.getServerConfig()).toHaveProperty('port');
      expect(config.getLoggingConfig()).toHaveProperty('level');
      expect(config.getSecurityConfig()).toHaveProperty('helmet');
      expect(config.getTasksConfig()).toHaveProperty('pagination');
      expect(config.getServicesConfig()).toHaveProperty('mcp');
      expect(config.getMcpConfig()).toHaveProperty('enabled');
    });

    test('should support dot notation access', () => {
      const config = new ConfigLoader();
      
      expect(config.get('database.host')).toBe('localhost');
      expect(config.get('redis.cache.default_ttl_seconds')).toBe(300);
      expect(config.get('server.cors.enabled')).toBe(true);
      
      // Test with default value
      expect(config.get('nonexistent.path', 'default-value')).toBe('default-value');
    });

    test('should export full configuration with metadata', () => {
      const config = new ConfigLoader();
      const exported = config.toJSON();
      
      expect(exported).toHaveProperty('_metadata');
      expect(exported._metadata).toHaveProperty('nodeEnv');
      expect(exported._metadata).toHaveProperty('loadedAt');
      expect(exported._metadata).toHaveProperty('environmentPrefix', 'TM_');
    });
  });

  describe('Deep Merge Functionality', () => {
    beforeEach(() => {
      process.env.TM_JWT_SECRET = 'test-jwt-secret-for-configuration-tests';
    });

    test('should properly merge nested objects', () => {
      const configData = {
        database: {
          host: 'custom-host',
          pool: {
            min: 5 // Override just one pool setting
          }
        }
      };

      tempConfigFile = path.join(os.tmpdir(), `merge-config-${Date.now()}.json`);
      fs.writeFileSync(tempConfigFile, JSON.stringify(configData, null, 2));
      
      const config = new ConfigLoader(tempConfigFile);

      // Should override specific values
      expect(config.get('database.host')).toBe('custom-host');
      expect(config.get('database.pool.min')).toBe(5);
      
      // Should preserve other default values
      expect(config.get('database.port')).toBe(5432);
      expect(config.get('database.pool.max')).toBe(10);
      expect(config.get('database.pool.acquireTimeoutMs')).toBe(60000);
    });
  });
});

describe('Global Configuration Singleton', () => {
  beforeEach(() => {
    process.env.TM_JWT_SECRET = 'test-secret';
    // Reset singleton state
    delete require.cache[require.resolve('../../src/config/configLoader')];
    // Re-require the module to reset singleton
    const { getConfig: freshGetConfig } = require('../../src/config/configLoader');
    global.getConfig = freshGetConfig;
  });
  
  afterEach(() => {
    // Reset singleton state
    delete require.cache[require.resolve('../../src/config/configLoader')];
    delete process.env.TM_JWT_SECRET;
  });

  test('should return same instance on multiple calls', () => {
    const { getConfig } = require('../../src/config/configLoader');
    
    const config1 = getConfig();
    const config2 = getConfig();
    
    expect(config1).toBe(config2);
  });

  test('should support force reload', () => {
    const { getConfig } = require('../../src/config/configLoader');
    
    const config1 = getConfig();
    const config2 = getConfig(null, true); // Force reload
    
    expect(config1).not.toBe(config2);
  });
});

describe('Platform Independence', () => {
  beforeEach(() => {
    process.env.TM_JWT_SECRET = 'test-secret';
  });

  afterEach(() => {
    delete process.env.TM_JWT_SECRET;
  });

  test('should handle cross-platform path resolution', () => {
    const config = new ConfigLoader();
    
    // Configuration loading should work regardless of platform
    expect(() => config.toJSON()).not.toThrow();
    
    // Should have proper path separators for current platform
    const metadata = config.toJSON()._metadata;
    if (metadata.configFilePath) {
      expect(metadata.configFilePath).toMatch(/[/\\]/); // Should contain path separators
    }
  });

  test('should provide consistent configuration across platforms', () => {
    const config = new ConfigLoader();
    
    // Core configuration should be consistent
    expect(config.get('database.host')).toBe('localhost');
    expect(config.get('server.port')).toBe(3000);
    expect(typeof config.get('redis.cache.default_ttl_seconds')).toBe('number');
  });
});