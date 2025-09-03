/**
 * Structured logging utilities for PAKE+ System
 */

export interface LogContext {
  userId?: string;
  requestId?: string;
  service?: string;
  action?: string;
  metadata?: Record<string, any>;
}

export interface Logger {
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
}

class PakeLogger implements Logger {
  private serviceName: string;

  constructor(serviceName = 'pake-system') {
    this.serviceName = serviceName;
  }

  private formatLog(level: string, message: string, context?: LogContext, error?: Error) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      service: this.serviceName,
      message,
      ...context,
      ...(error && {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        }
      })
    };

    return JSON.stringify(logEntry);
  }

  info(message: string, context?: LogContext): void {
    console.log(this.formatLog('INFO', message, context));
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatLog('WARN', message, context));
  }

  error(message: string, error?: Error, context?: LogContext): void {
    console.error(this.formatLog('ERROR', message, context, error));
  }

  debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
      console.log(this.formatLog('DEBUG', message, context));
    }
  }
}

// Default logger instance
export const logger = new PakeLogger();

// Create logger for specific service
export const createLogger = (serviceName: string): Logger => {
  return new PakeLogger(serviceName);
};