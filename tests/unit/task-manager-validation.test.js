import { jest, describe, beforeEach, test, expect } from '@jest/globals';
import { TaskManager } from '../../src/core/task-manager.js';

describe('TaskManager Validation Tests', () => {
  let taskManager;
  
  // Minimal mocks
  const mockFileStorage = {
    tasksDir: '/tmp/test',
    initialize: jest.fn().mockResolvedValue(true),
    createTaskFile: jest.fn().mockResolvedValue('/tmp/test/file.md'),
    readTaskFile: jest.fn().mockResolvedValue(null),
    listAllTasks: jest.fn().mockResolvedValue([])
  };
  
  const mockGraphConnection = {
    initialize: jest.fn().mockResolvedValue(true),
    createTask: jest.fn().mockResolvedValue(true),
    addDependency: jest.fn().mockResolvedValue(true)
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock the imports
    jest.doMock('../../src/core/sync-engine.js', () => ({
      SyncEngine: jest.fn().mockImplementation(() => ({
        ensureSynced: jest.fn().mockResolvedValue({ changes: 0 }),
        clearCache: jest.fn()
      }))
    }));
    
    jest.doMock('../../src/core/journal.js', () => ({
      SimpleJournal: jest.fn().mockImplementation(() => ({
        initialize: jest.fn().mockResolvedValue(true),
        logTaskCreated: jest.fn().mockResolvedValue(true),
        logSyncPerformed: jest.fn().mockResolvedValue(true),
        logTaskStatusUpdated: jest.fn().mockResolvedValue(true),
        logNoteAdded: jest.fn().mockResolvedValue(true),
        logSubtasksAdded: jest.fn().mockResolvedValue(true),
        logTaskDeleted: jest.fn().mockResolvedValue(true)
      }))
    }));
    
    taskManager = new TaskManager(mockFileStorage, mockGraphConnection);
  });

  describe('Title validation', () => {
    test('should require title', async () => {
      await expect(taskManager.createTask({}))
        .rejects.toThrow('Title is required');
    });
    
    test('should reject empty title', async () => {
      await expect(taskManager.createTask({ title: '' }))
        .rejects.toThrow('Title cannot be empty');
    });
    
    test('should reject whitespace-only title', async () => {
      await expect(taskManager.createTask({ title: '   ' }))
        .rejects.toThrow('Title cannot be empty');
    });
    
    test('should reject non-string title', async () => {
      await expect(taskManager.createTask({ title: 123 }))
        .rejects.toThrow('Title cannot be empty');
      
      await expect(taskManager.createTask({ title: null }))
        .rejects.toThrow('Title is required');
      
      await expect(taskManager.createTask({ title: undefined }))
        .rejects.toThrow('Title is required');
    });
  });

  describe('Priority validation', () => {
    test('should accept valid priorities', async () => {
      mockFileStorage.listAllTasks.mockResolvedValue([]);
      
      const validPriorities = ['high', 'medium', 'low'];
      
      for (const priority of validPriorities) {
        await expect(taskManager.createTask({ 
          title: 'Test Task',
          priority 
        })).resolves.toBeTruthy();
      }
    });
    
    test('should reject invalid priority', async () => {
      await expect(taskManager.createTask({ 
        title: 'Test',
        priority: 'invalid'
      })).rejects.toThrow('Invalid priority: invalid. Must be one of: high, medium, low');
    });
    
    test('should reject uppercase priority', async () => {
      await expect(taskManager.createTask({ 
        title: 'Test',
        priority: 'HIGH'
      })).rejects.toThrow('Invalid priority: HIGH');
    });
    
    test('should use default priority if not provided', async () => {
      mockFileStorage.listAllTasks.mockResolvedValue([]);
      
      await taskManager.createTask({ title: 'Test' });
      
      const callArgs = mockFileStorage.createTaskFile.mock.calls[0][0];
      expect(callArgs.priority).toBe('medium');
    });
  });

  describe('Dependencies validation', () => {
    test('should accept empty array', async () => {
      mockFileStorage.listAllTasks.mockResolvedValue([]);
      
      await expect(taskManager.createTask({ 
        title: 'Test',
        dependencies: []
      })).resolves.toBeTruthy();
    });
    
    test('should accept array of strings', async () => {
      mockFileStorage.listAllTasks.mockResolvedValue([]);
      
      await expect(taskManager.createTask({ 
        title: 'Test',
        dependencies: ['dep1', 'dep2']
      })).resolves.toBeTruthy();
    });
    
    test('should reject non-array dependencies', async () => {
      await expect(taskManager.createTask({ 
        title: 'Test',
        dependencies: 'not-an-array'
      })).rejects.toThrow('Dependencies must be an array');
      
      await expect(taskManager.createTask({ 
        title: 'Test',
        dependencies: { dep1: true }
      })).rejects.toThrow('Dependencies must be an array');
    });
    
    test('should use empty array if dependencies not provided', async () => {
      mockFileStorage.listAllTasks.mockResolvedValue([]);
      
      await taskManager.createTask({ title: 'Test' });
      
      const callArgs = mockFileStorage.createTaskFile.mock.calls[0][0];
      expect(callArgs.dependencies).toEqual([]);
    });
  });


  describe('Combined validation', () => {
    test('should validate all fields together', async () => {
      // Missing title
      await expect(taskManager.createTask({ 
        priority: 'high',
        dependencies: [],
      })).rejects.toThrow('Title is required');
      
      // Invalid priority with valid title
      await expect(taskManager.createTask({ 
        title: 'Test',
        priority: 'urgent',
        dependencies: [],
      })).rejects.toThrow('Invalid priority');
      
      // Invalid dependencies with valid title and priority
      await expect(taskManager.createTask({ 
        title: 'Test',
        priority: 'high',
        dependencies: 'dep1,dep2',
      })).rejects.toThrow('Dependencies must be an array');
    });
    
    test('should create task with all valid fields', async () => {
      mockFileStorage.listAllTasks.mockResolvedValue([]);
      
      const result = await taskManager.createTask({ 
        title: 'Complete Task',
        description: 'A complete task with all fields',
        priority: 'high',
        dependencies: ['dep1', 'dep2'],
      });
      
      expect(result).toMatchObject({
        id: expect.stringMatching(/^[a-z0-9]+-[a-z0-9]{6}$/),
        title: 'Complete Task',
        file_path: expect.any(String)
      });
    });
  });
});