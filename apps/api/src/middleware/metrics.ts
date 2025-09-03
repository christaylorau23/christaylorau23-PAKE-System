import { Request, Response, NextFunction } from 'express';

/**
 * Metrics Collection Middleware for Task Manager API
 * Prometheus-compatible metrics for observability
 */

const { logger } = require('../utils/logger');

/**
 * Metrics store using in-memory counters
 * In production, this would typically use a proper metrics library like prom-client
 */
class MetricsStore {
  constructor() {
    this.reset();
  }

  reset() {
    this.httpRequests = new Map(); // method:path:status -> count
    this.httpDuration = new Map(); // method:path -> {sum, count, buckets}
    this.httpRequestsTotal = 0;
    this.httpErrors = 0;
    this.startTime = Date.now();
    
    // Memory and performance metrics
    this.lastMemoryUpdate = 0;
    this.memoryMetrics = {
      rss: 0,
      heapUsed: 0,
      heapTotal: 0,
      external: 0
    };
  }

  // Increment HTTP request counter
  incrementHttpRequests(method, path, statusCode) {
    const key = `${method}:${this.normalizePath(path)}:${statusCode}`;
    this.httpRequests.set(key, (this.httpRequests.get(key) || 0) + 1);
    this.httpRequestsTotal++;
    
    if (statusCode >= 400) {
      this.httpErrors++;
    }
  }

  // Record HTTP request duration
  recordHttpDuration(method, path, duration) {
    const key = `${method}:${this.normalizePath(path)}`;
    const existing = this.httpDuration.get(key) || { sum: 0, count: 0, buckets: new Map() };
    
    existing.sum += duration;
    existing.count++;
    
    // Histogram buckets (in milliseconds)
    const buckets = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
    buckets.forEach(bucket => {
      if (duration <= bucket) {
        existing.buckets.set(bucket, (existing.buckets.get(bucket) || 0) + 1);
      }
    });
    
    this.httpDuration.set(key, existing);
  }

  // Update memory metrics
  updateMemoryMetrics() {
    const now = Date.now();
    if (now - this.lastMemoryUpdate > 5000) { // Update every 5 seconds
      const memUsage = process.memoryUsage();
      this.memoryMetrics = {
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external
      };
      this.lastMemoryUpdate = now;
    }
  }

  // Normalize API paths for metrics (remove IDs, etc.)
  normalizePath(path) {
    return path
      .replace(/\/\d+/g, '/:id')  // Replace numeric IDs
      .replace(/\/[a-f0-9]{24}/g, '/:id')  // Replace MongoDB ObjectIDs
      .replace(/\/[a-f0-9-]{36}/g, '/:uuid')  // Replace UUIDs
      .replace(/\?.*/, '');  // Remove query parameters
  }

  // Get current metrics
  getMetrics() {
    this.updateMemoryMetrics();
    
    return {
      httpRequests: this.httpRequests,
      httpDuration: this.httpDuration,
      httpRequestsTotal: this.httpRequestsTotal,
      httpErrors: this.httpErrors,
      uptime: Date.now() - this.startTime,
      memory: this.memoryMetrics,
      timestamp: new Date().toISOString()
    };
  }
}

// Global metrics store
const metricsStore = new MetricsStore();

/**
 * Express middleware to collect HTTP metrics
 */
function metricsMiddleware(options = {}) {
  const { 
    excludePaths = ['/health', '/metrics', '/favicon.ico'],
    includeBody = false 
  } = options;

  return (req, res, next) => {
    const startTime = Date.now();
    
    // Skip excluded paths
    if (excludePaths.some(path => req.path === path)) {
      return next();
    }

    // Log request start for metrics
    const reqLogger = req.logger || logger.withRequest(req);
    
    // Wrap res.end to capture response metrics
    const originalEnd = res.end;
    res.end = function(chunk, encoding) {
      const duration = Date.now() - startTime;
      const method = req.method;
      const path = req.route?.path || req.path;
      const statusCode = res.statusCode;

      // Record metrics
      metricsStore.incrementHttpRequests(method, path, statusCode);
      metricsStore.recordHttpDuration(method, path, duration);

      // Log structured metrics
      reqLogger.http('HTTP Request Metrics', {
        method,
        path,
        statusCode,
        duration,
        contentLength: res.get('Content-Length'),
        userAgent: req.get('User-Agent')
      });

      return originalEnd.call(this, chunk, encoding);
    };

    next();
  };
}

/**
 * Generate Prometheus-format metrics
 */
function generatePrometheusMetrics() {
  const metrics = metricsStore.getMetrics();
  const lines = [];

  // Add metadata
  lines.push('# HELP http_requests_total Total number of HTTP requests');
  lines.push('# TYPE http_requests_total counter');

  // HTTP request counters
  for (const [key, count] of metrics.httpRequests.entries()) {
    const [method, path, status] = key.split(':');
    lines.push(
      `http_requests_total{method="${method}",path="${path}",status="${status}",service="task-manager-api"} ${count}`
    );
  }

  lines.push('');
  lines.push('# HELP http_request_duration_seconds HTTP request duration in seconds');
  lines.push('# TYPE http_request_duration_seconds histogram');

  // HTTP duration histograms
  for (const [key, data] of metrics.httpDuration.entries()) {
    const [method, path] = key.split(':');
    const baseLabels = `method="${method}",path="${path}",service="task-manager-api"`;

    // Histogram buckets
    for (const [bucket, count] of data.buckets.entries()) {
      lines.push(
        `http_request_duration_seconds_bucket{${baseLabels},le="${bucket / 1000}"} ${count}`
      );
    }
    
    // Add +Inf bucket
    lines.push(
      `http_request_duration_seconds_bucket{${baseLabels},le="+Inf"} ${data.count}`
    );
    
    // Sum and count
    lines.push(
      `http_request_duration_seconds_sum{${baseLabels}} ${data.sum / 1000}`
    );
    lines.push(
      `http_request_duration_seconds_count{${baseLabels}} ${data.count}`
    );
  }

  lines.push('');
  lines.push('# HELP http_requests_error_rate HTTP request error rate');
  lines.push('# TYPE http_requests_error_rate gauge');
  const errorRate = metrics.httpRequestsTotal > 0 ? 
    (metrics.httpErrors / metrics.httpRequestsTotal) : 0;
  lines.push(`http_requests_error_rate{service="task-manager-api"} ${errorRate.toFixed(4)}`);

  lines.push('');
  lines.push('# HELP process_uptime_seconds Process uptime in seconds');
  lines.push('# TYPE process_uptime_seconds counter');
  lines.push(`process_uptime_seconds{service="task-manager-api"} ${metrics.uptime / 1000}`);

  lines.push('');
  lines.push('# HELP process_memory_bytes Process memory usage in bytes');
  lines.push('# TYPE process_memory_bytes gauge');
  lines.push(`process_memory_bytes{type="rss",service="task-manager-api"} ${metrics.memory.rss}`);
  lines.push(`process_memory_bytes{type="heap_used",service="task-manager-api"} ${metrics.memory.heapUsed}`);
  lines.push(`process_memory_bytes{type="heap_total",service="task-manager-api"} ${metrics.memory.heapTotal}`);
  lines.push(`process_memory_bytes{type="external",service="task-manager-api"} ${metrics.memory.external}`);

  lines.push('');
  lines.push('# HELP nodejs_heap_usage_percent Node.js heap usage percentage');
  lines.push('# TYPE nodejs_heap_usage_percent gauge');
  const heapUsagePercent = metrics.memory.heapTotal > 0 ? 
    (metrics.memory.heapUsed / metrics.memory.heapTotal) * 100 : 0;
  lines.push(`nodejs_heap_usage_percent{service="task-manager-api"} ${heapUsagePercent.toFixed(2)}`);

  lines.push('');
  lines.push('# HELP nodejs_version_info Node.js version information');
  lines.push('# TYPE nodejs_version_info gauge');
  lines.push(`nodejs_version_info{version="${process.version}",service="task-manager-api"} 1`);

  return lines.join('\n');
}

/**
 * Generate JSON format metrics for debugging
 */
function generateJsonMetrics() {
  const metrics = metricsStore.getMetrics();
  
  // Convert Maps to objects for JSON serialization
  const jsonMetrics = {
    ...metrics,
    httpRequests: Object.fromEntries(metrics.httpRequests),
    httpDuration: Object.fromEntries(
      Array.from(metrics.httpDuration.entries()).map(([key, value]) => [
        key,
        {
          ...value,
          buckets: Object.fromEntries(value.buckets)
        }
      ])
    )
  };
  
  return jsonMetrics;
}

/**
 * Express route handler for /metrics endpoint
 */
function metricsHandler(req, res) {
  try {
    const format = req.query.format || req.get('Accept');
    
    if (format === 'json' || format === 'application/json') {
      res.set('Content-Type', 'application/json');
      res.json(generateJsonMetrics());
    } else {
      // Default to Prometheus format
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(generatePrometheusMetrics());
    }
    
    logger.debug('Metrics endpoint accessed', { 
      format: format || 'prometheus',
      ip: req.ip 
    });
  } catch (error) {
    logger.error('Failed to generate metrics', error);
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
}

/**
 * Custom metrics recording functions
 */
const customMetrics = {
  // Record custom counter
  incrementCounter(name, labels = {}, value = 1) {
    logger.info('Custom metric recorded', {
      metric: {
        name,
        type: 'counter',
        labels,
        value
      }
    });
  },

  // Record custom gauge
  setGauge(name, labels = {}, value) {
    logger.info('Custom metric recorded', {
      metric: {
        name,
        type: 'gauge',
        labels,
        value
      }
    });
  },

  // Record custom histogram
  recordHistogram(name, labels = {}, value) {
    logger.info('Custom metric recorded', {
      metric: {
        name,
        type: 'histogram',
        labels,
        value
      }
    });
  },

  // Business metrics
  recordBusinessEvent(event, userId = null, metadata = {}) {
    logger.business('Business event recorded', {
      event,
      userId,
      metadata
    });
  },

  // Database metrics  
  recordDatabaseOperation(operation, table, duration, success = true) {
    logger.database('Database operation recorded', {
      operation,
      table,
      duration,
      success
    });
  }
};

/**
 * Health check with metrics
 */
function healthCheck(req, res) {
  const metrics = metricsStore.getMetrics();
  const memUsage = process.memoryUsage();
  
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: metrics.uptime,
    service: 'task-manager-api',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    metrics: {
      totalRequests: metrics.httpRequestsTotal,
      errorRate: metrics.httpRequestsTotal > 0 ? 
        (metrics.httpErrors / metrics.httpRequestsTotal) : 0,
      memoryUsage: {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024)
      }
    }
  };

  // Determine health status based on metrics
  const heapUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  if (heapUsagePercent > 90) {
    health.status = 'degraded';
    health.warnings = ['High memory usage'];
  }

  res.json(health);
}

/**
 * Metrics reset endpoint (for testing)
 */
function resetMetrics(req, res) {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'Metrics reset only available in development' });
  }
  
  metricsStore.reset();
  logger.info('Metrics reset', { requestedBy: req.ip });
  res.json({ message: 'Metrics reset successfully' });
}

module.exports = {
  metricsMiddleware,
  metricsHandler,
  healthCheck,
  resetMetrics,
  customMetrics,
  generatePrometheusMetrics,
  generateJsonMetrics
};