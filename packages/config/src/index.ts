/**
 * @pake/config - Centralized configuration management
 * 
 * Environment-based configuration system for PAKE+ System
 */

import { AppConfig, DatabaseConfig, RedisConfig } from '@pake/types';

export class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig | null = null;

  private constructor() {}

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  public getConfig(): AppConfig {
    if (!this.config) {
      this.config = this.loadConfig();
    }
    return this.config;
  }

  private loadConfig(): AppConfig {
    const env = process.env.NODE_ENV as 'development' | 'staging' | 'production' || 'development';
    
    return {
      port: parseInt(process.env.PORT || '3000', 10),
      env,
      cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
        credentials: process.env.CORS_CREDENTIALS === 'true'
      },
      database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'pake_system',
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.DB_SSL === 'true'
      },
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
        database: parseInt(process.env.REDIS_DB || '0', 10)
      }
    };
  }

  public validateConfig(): boolean {
    const config = this.getConfig();
    
    // Validate required fields
    const required = [
      config.database.password,
      config.port
    ];

    return required.every(field => field !== undefined && field !== '');
  }
}

// Export singleton instance
export const config = ConfigManager.getInstance().getConfig();
export const configManager = ConfigManager.getInstance();