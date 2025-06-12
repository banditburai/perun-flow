import { jest, describe, beforeEach, test, expect } from '@jest/globals';
import { TaskManager } from '../../src/core/task-manager.js';
// import { promises as fs } from 'fs';
// import path from 'path';

describe('TaskManager Unit Tests (Simple)', () => {
  let taskManager;

  // Mock dependencies
  const mockFileStorage = {
    tasksDir: '/tmp/test-tasks',
    initialize: jest.fn().mockResolvedValue(true),
    createTaskFile: jest.fn().mockResolvedValue('/tmp/test-tasks/pending/test.md'),
    readTaskFile: jest.fn().mockResolvedValue(null),
    listAllTasks: jest.fn().mockResolvedValue([]),
    taskFileExists: jest.fn().mockResolvedValue(false),
  };

  const mockGraphConnection = {
    initialize: jest.fn().mockResolvedValue(true),
    createTask: jest.fn().mockResolvedValue(true),
    addDependency: jest.fn().mockResolvedValue(true),
    getTask: jest.fn().mockResolvedValue(null),
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock the imports that TaskManager will create
    jest.doMock('../../src/core/sync-engine.js', () => ({
      SyncEngine: jest.fn().mockImplementation(() => ({
        ensureSynced: jest.fn().mockResolvedValue({ changes: 0 }),
        clearCache: jest.fn(),
      })),
    }));

    jest.doMock('../../src/core/journal.js', () => ({
      SimpleJournal: jest.fn().mockImplementation(() => ({
        initialize: jest.fn().mockResolvedValue(true),
        logTaskCreated: jest.fn().mockResolvedValue(true),
        logSyncPerformed: jest.fn().mockResolvedValue(true),
        logTaskStatusUpdated: jest.fn().mockResolvedValue(true),
        logNoteAdded: jest.fn().mockResolvedValue(true),
        logSubtasksAdded: jest.fn().mockResolvedValue(true),
        logTaskDeleted: jest.fn().mockResolvedValue(true),
      })),
    }));

    // Create TaskManager with mocked dependencies
    taskManager = new TaskManager(mockFileStorage, mockGraphConnection);
  });

  describe('generateTaskId', () => {
    test('should generate unique IDs with correct format', () => {
      const id1 = taskManager.generateTaskId('Test Task 1');
      const id2 = taskManager.generateTaskId('Test Task 2');

      // Check format: timestamp-hash
      expect(id1).toMatch(/^[a-z0-9]+-[a-z0-9]{6}$/);
      expect(id2).toMatch(/^[a-z0-9]+-[a-z0-9]{6}$/);

      // Should be different for different titles
      expect(id1).not.toBe(id2);
    });

    test('should generate same ID for same title', () => {
      const title = 'Same Task Title';
      const id1 = taskManager.generateTaskId(title);

      // Wait a bit to ensure different timestamp
      setTimeout(() => {
        const id2 = taskManager.generateTaskId(title);

        // Hash part should be the same
        const hash1 = id1.split('-')[1];
        const hash2 = id2.split('-')[1];
        expect(hash1).toBe(hash2);
      }, 10);
    });
  });

  describe('detectStream', () => {
    test('should detect TEST stream', () => {
      expect(taskManager.detectStream('Write unit tests')).toBe('TEST');
      expect(taskManager.detectStream('Add testing framework')).toBe('TEST');
      expect(taskManager.detectStream('Create test spec')).toBe('TEST');
    });

    test('should detect SYNC stream', () => {
      expect(taskManager.detectStream('Implement sync system')).toBe('SYNC');
      expect(taskManager.detectStream('Add synchronization')).toBe('SYNC');
    });

    test('should detect GIT stream', () => {
      expect(taskManager.detectStream('Setup git hooks')).toBe('GIT');
      expect(taskManager.detectStream('Add version control')).toBe('GIT');
      expect(taskManager.detectStream('Create commit workflow')).toBe('GIT');
    });

    test('should detect DOC stream', () => {
      expect(taskManager.detectStream('Write documentation')).toBe('DOC');
      expect(taskManager.detectStream('Update readme')).toBe('DOC');
      expect(taskManager.detectStream('Create guide')).toBe('DOC');
    });

    test('should detect API stream', () => {
      expect(taskManager.detectStream('Create REST API')).toBe('API');
      expect(taskManager.detectStream('Add endpoint')).toBe('API');
      expect(taskManager.detectStream('Define routes')).toBe('API');
    });

    test('should detect AUTH stream', () => {
      expect(taskManager.detectStream('Add authentication')).toBe('AUTH');
      expect(taskManager.detectStream('Implement security')).toBe('AUTH');
      expect(taskManager.detectStream('Create login system')).toBe('AUTH');
    });

    test('should detect DATA stream', () => {
      expect(taskManager.detectStream('Setup database')).toBe('DATA');
      expect(taskManager.detectStream('Create schema')).toBe('DATA');
      expect(taskManager.detectStream('Add data models')).toBe('DATA');
    });

    test('should detect UI stream', () => {
      expect(taskManager.detectStream('Build user interface')).toBe('UI');
      expect(taskManager.detectStream('Create frontend')).toBe('UI');
    });

    test('should detect DEPLOY stream', () => {
      expect(taskManager.detectStream('Deploy to production')).toBe('DEPLOY');
      expect(taskManager.detectStream('Release new version')).toBe('DEPLOY');
      expect(taskManager.detectStream('Publish package')).toBe('DEPLOY');
    });

    test('should return TASK for generic tasks', () => {
      expect(taskManager.detectStream('Do something')).toBe('TASK');
      expect(taskManager.detectStream('Miscellaneous work')).toBe('TASK');
    });

    test('should prioritize first matching keyword', () => {
      expect(taskManager.detectStream('Test the API endpoints')).toBe('TEST');
      expect(taskManager.detectStream('Document the auth system')).toBe('DOC');
    });

    test('should use description if provided', () => {
      expect(taskManager.detectStream('Update system', 'Sync data between services')).toBe('SYNC');
      expect(taskManager.detectStream('New feature', 'API endpoints for users')).toBe('API');
    });
  });

  describe('calculatePhase', () => {
    test('should return phase 1 for no dependencies', async () => {
      const phase = await taskManager.calculatePhase([]);
      expect(phase).toBe(1);
    });

    test('should return phase 1 for null dependencies', async () => {
      const phase = await taskManager.calculatePhase(null);
      expect(phase).toBe(1);
    });

    test('should calculate phase from single dependency', async () => {
      mockFileStorage.readTaskFile.mockResolvedValueOnce({
        semantic_id: 'API-2.03',
      });

      const phase = await taskManager.calculatePhase(['dep1']);
      expect(phase).toBe(3); // Max dependency phase (2) + 1
    });

    test('should find max phase from multiple dependencies', async () => {
      mockFileStorage.readTaskFile
        .mockResolvedValueOnce({ semantic_id: 'API-1.01' })
        .mockResolvedValueOnce({ semantic_id: 'AUTH-3.02' })
        .mockResolvedValueOnce({ semantic_id: 'DATA-2.05' });

      const phase = await taskManager.calculatePhase(['dep1', 'dep2', 'dep3']);
      expect(phase).toBe(4); // Max dependency phase (3) + 1
    });

    test('should handle missing dependencies gracefully', async () => {
      mockFileStorage.readTaskFile
        .mockResolvedValueOnce({ semantic_id: 'API-2.01' })
        .mockRejectedValueOnce(new Error('File not found'))
        .mockResolvedValueOnce({ semantic_id: 'DATA-1.03' });

      const phase = await taskManager.calculatePhase(['dep1', 'missing', 'dep3']);
      expect(phase).toBe(3); // Max found phase (2) + 1, ignoring errors
    });

    test('should handle dependencies without semantic IDs', async () => {
      mockFileStorage.readTaskFile
        .mockResolvedValueOnce({ semantic_id: 'API-2.01' })
        .mockResolvedValueOnce({ id: 'old-task' }) // No semantic_id
        .mockResolvedValueOnce(null);

      const phase = await taskManager.calculatePhase(['dep1', 'dep2', 'dep3']);
      expect(phase).toBe(3); // Max found phase (2) + 1
    });

    test('should stay at phase 1 if no semantic dependencies found', async () => {
      mockFileStorage.readTaskFile
        .mockResolvedValueOnce({ id: 'task1' })
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('Not found'));

      const phase = await taskManager.calculatePhase(['dep1', 'dep2', 'dep3']);
      expect(phase).toBe(1); // No semantic deps found, stay at 1
    });
  });

  describe('getNextSequence', () => {
    test('should return 01 for first task in stream-phase', async () => {
      mockFileStorage.listAllTasks.mockResolvedValueOnce([]);

      const sequence = await taskManager.getNextSequence('API', 1);
      expect(sequence).toBe('01');
    });

    test('should increment sequence within same stream-phase', async () => {
      mockFileStorage.listAllTasks.mockResolvedValueOnce([
        { semantic_id: 'API-1.01' },
        { semantic_id: 'API-1.02' },
        { semantic_id: 'API-2.01' }, // Different phase
        { semantic_id: 'AUTH-1.01' }, // Different stream
      ]);

      const sequence = await taskManager.getNextSequence('API', 1);
      expect(sequence).toBe('03');
    });

    test('should pad sequence with zero', async () => {
      mockFileStorage.listAllTasks.mockResolvedValueOnce([{ semantic_id: 'TEST-3.09' }]);

      const sequence = await taskManager.getNextSequence('TEST', 3);
      expect(sequence).toBe('10');
    });
  });

  describe('generateSemanticId', () => {
    test('should generate complete semantic ID', async () => {
      mockFileStorage.listAllTasks.mockResolvedValue([]);
      mockFileStorage.readTaskFile.mockResolvedValue(null);

      const semanticId = await taskManager.generateSemanticId(
        'Create API endpoints',
        'REST API for user management',
        []
      );

      expect(semanticId).toBe('API-1.01');
    });

    test('should increment sequence for existing tasks', async () => {
      mockFileStorage.listAllTasks.mockResolvedValue([
        { semantic_id: 'TEST-1.01' },
        { semantic_id: 'TEST-1.02' },
      ]);

      const semanticId = await taskManager.generateSemanticId('Write more tests', '', []);

      expect(semanticId).toBe('TEST-1.03');
    });
  });

  describe('createTask', () => {
    test('should create task with all required fields', async () => {
      mockFileStorage.listAllTasks.mockResolvedValue([]);

      const result = await taskManager.createTask({
        title: 'Test Task',
        description: 'Test description',
        priority: 'high',
      });

      expect(result).toMatchObject({
        id: expect.stringMatching(/^[a-z0-9]+-[a-z0-9]{6}$/),
        semantic_id: expect.stringMatching(/^TEST-1\.01$/), // 'Test' maps to TEST stream
        title: 'Test Task',
        file_path: '/tmp/test-tasks/pending/test.md',
      });

      expect(mockFileStorage.createTaskFile).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Task',
          description: 'Test description',
          priority: 'high',
          status: 'pending',
        })
      );

      expect(mockGraphConnection.createTask).toHaveBeenCalled();
    });

    test('should handle dependencies correctly', async () => {
      mockFileStorage.listAllTasks.mockResolvedValue([]);
      mockFileStorage.readTaskFile.mockResolvedValue({
        semantic_id: 'AUTH-1.01',
      });

      const result = await taskManager.createTask({
        title: 'Create user API',
        dependencies: ['auth-task-id'],
      });

      expect(result.semantic_id).toBe('API-2.01');
      expect(mockGraphConnection.addDependency).toHaveBeenCalledWith(result.id, 'auth-task-id');
    });

    test('should use default priority', async () => {
      mockFileStorage.listAllTasks.mockResolvedValue([]);

      await taskManager.createTask({
        title: 'Default Priority Task',
      });

      expect(mockFileStorage.createTaskFile).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'medium',
        })
      );
    });
  });
});
