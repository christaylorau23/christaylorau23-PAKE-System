/**
 * Task Service Unit Tests
 */

import { TaskService } from '../../src/services/TaskService';
import { TaskRepository } from '../../src/data/TaskRepository';
import { Task, TaskStatus, TaskPriority } from '@pake/types';

// Mock the repository
jest.mock('../../src/data/TaskRepository');
const MockTaskRepository = TaskRepository as jest.MockedClass<typeof TaskRepository>;

describe('TaskService', () => {
    let taskService: TaskService;
    let mockTaskRepository: jest.Mocked<TaskRepository>;

    beforeEach(() => {
        mockTaskRepository = new MockTaskRepository() as jest.Mocked<TaskRepository>;
        taskService = new TaskService(mockTaskRepository);
    });

    describe('createTask', () => {
        it('should create a new task successfully', async () => {
            const taskData = {
                title: 'Test Task',
                description: 'Test Description',
                priority: TaskPriority.HIGH
            };

            const expectedTask: Task = {
                id: 'task123',
                title: taskData.title,
                description: taskData.description,
                status: TaskStatus.TODO,
                priority: taskData.priority,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            mockTaskRepository.create.mockResolvedValue(expectedTask);

            const result = await taskService.createTask(taskData);

            expect(mockTaskRepository.create).toHaveBeenCalledWith({
                ...taskData,
                status: TaskStatus.TODO
            });
            expect(result).toEqual(expectedTask);
        });

        it('should throw error when title is missing', async () => {
            const taskData = {
                description: 'Test Description',
                priority: TaskPriority.HIGH
            };

            await expect(taskService.createTask(taskData as any))
                .rejects.toThrow('Title is required');
        });

        it('should handle repository errors', async () => {
            const taskData = {
                title: 'Test Task',
                description: 'Test Description',
                priority: TaskPriority.HIGH
            };

            mockTaskRepository.create.mockRejectedValue(new Error('Database error'));

            await expect(taskService.createTask(taskData))
                .rejects.toThrow('Database error');
        });
    });

    describe('getTasks', () => {
        it('should return paginated tasks', async () => {
            const mockTasks: Task[] = [
                testUtils.generateTestTask({ id: 'task1' }),
                testUtils.generateTestTask({ id: 'task2' })
            ];

            mockTaskRepository.findMany.mockResolvedValue({
                data: mockTasks,
                total: 2,
                page: 1,
                limit: 10
            });

            const result = await taskService.getTasks({ page: 1, limit: 10 });

            expect(result.data).toEqual(mockTasks);
            expect(result.total).toBe(2);
        });

        it('should filter by status', async () => {
            const filters = { status: TaskStatus.IN_PROGRESS };
            
            await taskService.getTasks(filters);

            expect(mockTaskRepository.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ status: TaskStatus.IN_PROGRESS })
            );
        });
    });

    describe('updateTaskStatus', () => {
        it('should update task status successfully', async () => {
            const taskId = 'task123';
            const newStatus = TaskStatus.DONE;
            
            const updatedTask = testUtils.generateTestTask({ 
                id: taskId, 
                status: newStatus 
            });

            mockTaskRepository.update.mockResolvedValue(updatedTask);

            const result = await taskService.updateTaskStatus(taskId, newStatus);

            expect(mockTaskRepository.update).toHaveBeenCalledWith(taskId, {
                status: newStatus,
                updatedAt: expect.any(Date)
            });
            expect(result.status).toBe(newStatus);
        });

        it('should throw error for invalid task ID', async () => {
            const taskId = 'invalid-id';
            mockTaskRepository.update.mockResolvedValue(null);

            await expect(taskService.updateTaskStatus(taskId, TaskStatus.DONE))
                .rejects.toThrow('Task not found');
        });
    });
});
