/**
 * @pake/types - Shared TypeScript type definitions
 * 
 * Common types used across the PAKE+ System monorepo
 */

// API Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    timestamp: string;
    requestId: string;
    version: string;
  };
}

// User Types
export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  VIEWER = 'viewer'
}

// Knowledge Management Types
export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  type: KnowledgeType;
  tags: string[];
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export enum KnowledgeType {
  NOTE = 'note',
  DOCUMENT = 'document',
  LINK = 'link',
  TASK = 'task'
}

// Configuration Types
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  database: number;
}

export interface AppConfig {
  port: number;
  env: 'development' | 'staging' | 'production';
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
  database: DatabaseConfig;
  redis: RedisConfig;
}

// Task Types
export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignedTo?: string;
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
  CANCELLED = 'cancelled'
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}