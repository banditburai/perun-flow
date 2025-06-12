import { jest, describe, beforeEach, afterEach, test, expect } from '@jest/globals';
import { SyncEngine } from '../../src/core/sync-engine.js';
import { promises as fs } from 'fs';
import path from 'path';

// Mock logger
jest.mock('../../src/utils/logger.js');

// Mock fs promises
jest.mock('fs', () => ({
  promises: {
    readdir: jest.fn(),
    stat: jest.fn()
  }
}));

describe('SyncEngine Unit Tests', () => {
  let syncEngine;
  let mockFileStorage;
  let mockGraphConnection;

  beforeEach(() => {
    // Create mock file storage
    mockFileStorage = {
      tasksDir: '/test/tasks',
      statusDirs: ['pending', 'in-progress', 'done', 'archive'],
      listAllTasks: jest.fn().mockResolvedValue([]),
      readTaskFile: jest.fn().mockResolvedValue(null)
    };
    
    // Create mock graph connection
    mockGraphConnection = {
      execute: jest.fn().mockResolvedValue([]),
      createTask: jest.fn().mockResolvedValue(true),
      updateTask: jest.fn().mockResolvedValue(true),
      addDependency: jest.fn().mockResolvedValue(true),
      getDependencies: jest.fn().mockResolvedValue([]),
      getTask: jest.fn().mockResolvedValue(null),
      detectCircularDependencies: jest.fn().mockResolvedValue([])
    };
    
    // Create SyncEngine instance
    syncEngine = new SyncEngine(mockFileStorage, mockGraphConnection);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ensureSynced', () => {
    test('should skip sync if recently synced', async () => {
      // Set last sync to recent time
      syncEngine.lastSyncTime = Date.now() - 1000; // 1 second ago
      
      const result = await syncEngine.ensureSynced();
      
      expect(result).toEqual({ status: 'already_synced', changes: 0 });
      expect(mockFileStorage.listAllTasks).not.toHaveBeenCalled();
    });

    test('should perform sync if not recently synced', async () => {
      // Mock needsSync to return true
      jest.spyOn(syncEngine, 'needsSync').mockResolvedValue(true);
      // Mock syncFilesToGraph
      jest.spyOn(syncEngine, 'syncFilesToGraph').mockResolvedValue({
        status: 'synced',
        changes: 0,
        details: { created: 0, updated: 0, deleted: 0, dependencies: 0 }
      });
      
      const result = await syncEngine.ensureSynced();
      
      expect(syncEngine.syncFilesToGraph).toHaveBeenCalled();
      expect(result).toEqual({
        status: 'synced',
        changes: 0,
        details: { created: 0, updated: 0, deleted: 0, dependencies: 0 }
      });
    });

    test('should force sync when cache cleared', async () => {
      syncEngine.lastSyncTime = Date.now() - 1000; // Recent
      syncEngine.clearCache();
      
      // Mock syncFilesToGraph
      jest.spyOn(syncEngine, 'syncFilesToGraph').mockResolvedValue({
        status: 'synced',
        changes: 0,
        details: { created: 0, updated: 0, deleted: 0, dependencies: 0 }
      });
      
      const result = await syncEngine.ensureSynced();
      
      expect(syncEngine.syncFilesToGraph).toHaveBeenCalled();
    });
  });

  describe('verifySyncStatus', () => {
    test('should detect when in sync', async () => {
      const fileTasks = [
        { id: 'task-1', updated_at: '2025-06-11T12:00:00Z' },
        { id: 'task-2', updated_at: '2025-06-11T13:00:00Z' }
      ];
      
      mockFileStorage.listAllTasks.mockResolvedValueOnce(fileTasks);
      // The query returns a count result
      mockGraphConnection.execute.mockResolvedValueOnce([{ count: 2 }]);
      
      const status = await syncEngine.verifySyncStatus();
      
      expect(status.in_sync).toBe(true);
      expect(status.file_count).toBe(2);
      expect(status.graph_count).toBe(2);
      expect(status.difference).toBe(0);
    });

    test('should detect out of sync', async () => {
      const fileTasks = [
        { id: 'task-1', updated_at: '2025-06-11T12:00:00Z' },
        { id: 'task-2', updated_at: '2025-06-11T13:00:00Z' }
      ];
      
      mockFileStorage.listAllTasks.mockResolvedValueOnce(fileTasks);
      // Only 1 task in graph
      mockGraphConnection.execute.mockResolvedValueOnce([{ count: 1 }]);
      
      const status = await syncEngine.verifySyncStatus();
      
      expect(status.in_sync).toBe(false);
      expect(status.file_count).toBe(2);
      expect(status.graph_count).toBe(1);
      expect(status.difference).toBe(1);
    });

    test('should handle empty graph', async () => {
      const fileTasks = [
        { id: 'task-1', updated_at: '2025-06-11T12:00:00Z' }
      ];
      
      mockFileStorage.listAllTasks.mockResolvedValueOnce(fileTasks);
      // No count result means 0
      mockGraphConnection.execute.mockResolvedValueOnce([]);
      
      const status = await syncEngine.verifySyncStatus();
      
      expect(status.in_sync).toBe(false);
      expect(status.file_count).toBe(1);
      expect(status.graph_count).toBe(0);
      expect(status.difference).toBe(1);
    });
  });

  describe('syncFilesToGraph', () => {
    test('should create missing tasks in graph', async () => {
      const fileTask = {
        id: 'task-1',
        title: 'Test Task',
        updated_at: '2025-06-11T12:00:00Z',
        dependencies: []
      };
      
      // Mock sync status check
      mockFileStorage.listAllTasks.mockResolvedValue([fileTask]);
      mockGraphConnection.execute.mockResolvedValue([]); // No tasks in graph
      
      const result = await syncEngine.syncFilesToGraph();
      
      expect(mockGraphConnection.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'task-1',
          title: 'Test Task'
        })
      );
      expect(result.status).toBe('synced');
      expect(result.changes).toBe(1);
      expect(result.details.created).toBe(1);
    });

    test('should update outdated tasks in graph', async () => {
      const fileTask = {
        id: 'task-1',
        title: 'Updated Task',
        updated_at: '2025-06-11T14:00:00Z',
        dependencies: []
      };
      
      const graphTask = {
        id: 'task-1',
        title: 'Old Task',
        updated_at: '2025-06-11T12:00:00Z'
      };
      
      // Mock getAllGraphTasks to return the old task
      jest.spyOn(syncEngine, 'getAllGraphTasks').mockResolvedValue([graphTask]);
      mockFileStorage.listAllTasks.mockResolvedValue([fileTask]);
      
      const result = await syncEngine.syncFilesToGraph();
      
      expect(mockGraphConnection.updateTask).toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({
          title: 'Updated Task'
        })
      );
      expect(result.status).toBe('synced');
      expect(result.changes).toBe(1);
      expect(result.details.updated).toBe(1);
    });

    test('should delete tasks missing from files', async () => {
      const graphTask = {
        id: 'taskdelete1', // No dash so it's not a subtask
        title: 'Task to Delete',
        updated_at: '2025-06-11T12:00:00Z'
      };
      
      mockFileStorage.listAllTasks.mockResolvedValue([]); // No files
      // Mock getAllGraphTasks to return the task to delete
      jest.spyOn(syncEngine, 'getAllGraphTasks').mockResolvedValue([graphTask]);
      
      // Spy on deleteTaskFromGraph method
      const deleteSpy = jest.spyOn(syncEngine, 'deleteTaskFromGraph');
      
      const result = await syncEngine.syncFilesToGraph();
      
      expect(deleteSpy).toHaveBeenCalledWith('taskdelete1');
      expect(result.status).toBe('synced');
      expect(result.changes).toBe(1);
      expect(result.details.deleted).toBe(1);
    });

    test('should sync task dependencies', async () => {
      const fileTask = {
        id: 'task-1',
        title: 'Test Task',
        dependencies: [
          { id: 'dep-1', status: 'done' },
          { id: 'dep-2', status: 'pending' }
        ],
        updated_at: '2025-06-11T12:00:00Z'
      };
      
      mockFileStorage.listAllTasks.mockResolvedValue([fileTask]);
      // Mock getAllGraphTasks to return empty
      jest.spyOn(syncEngine, 'getAllGraphTasks').mockResolvedValue([]);
      // Mock getDependencies to return empty
      mockGraphConnection.getDependencies.mockResolvedValue([]);
      
      await syncEngine.syncFilesToGraph();
      
      expect(mockGraphConnection.addDependency).toHaveBeenCalledWith('task-1', 'dep-1');
      expect(mockGraphConnection.addDependency).toHaveBeenCalledWith('task-1', 'dep-2');
    });

    test('should handle sync errors gracefully', async () => {
      const fileTask = {
        id: 'task-1',
        title: 'Test Task',
        dependencies: []
      };
      
      mockFileStorage.listAllTasks.mockResolvedValue([fileTask]);
      mockGraphConnection.execute.mockResolvedValue([]);
      mockGraphConnection.createTask.mockRejectedValueOnce(new Error('Create failed'));
      
      const result = await syncEngine.syncFilesToGraph();
      
      // Should continue despite error
      expect(result.status).toBe('synced');
      expect(result.changes).toBe(0);
      expect(result.details.created).toBe(0);
    });
  });

  describe('createTaskInGraph', () => {
    test('should create task with all fields', async () => {
      const fileTask = {
        id: 'test-123',
        semantic_id: 'TEST-1.01',
        title: 'Test Task',
        description: 'Test description',
        status: 'pending',
        priority: 'high',
        created_at: '2025-06-11T12:00:00Z',
        file_path: '/test/path.md'
      };
      
      await syncEngine.createTaskInGraph(fileTask);
      
      expect(mockGraphConnection.createTask).toHaveBeenCalledWith({
        id: 'test-123',
        semantic_id: 'TEST-1.01',
        title: 'Test Task',
        description: 'Test description',
        status: 'pending',
        priority: 'high',
        created_at: '2025-06-11T12:00:00Z',
        file_path: '/test/path.md'
      });
    });

    test('should handle missing optional fields', async () => {
      const fileTask = {
        id: 'test-123',
        title: 'Test Task',
        status: 'pending',
        priority: 'medium',
        file_path: '/test/path.md'
      };
      
      await syncEngine.createTaskInGraph(fileTask);
      
      expect(mockGraphConnection.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-123',
          title: 'Test Task',
          description: ''
        })
      );
    });
  });

  describe('updateTaskInGraph', () => {
    test('should update task fields', async () => {
      const fileTask = {
        id: 'test-123',
        title: 'Updated Title',
        description: 'Updated description',
        status: 'done',
        priority: 'low',
        file_path: '/test/updated.md'
      };
      
      await syncEngine.updateTaskInGraph(fileTask);
      
      expect(mockGraphConnection.updateTask).toHaveBeenCalledWith(
        'test-123',
        {
          title: 'Updated Title',
          description: 'Updated description',
          status: 'done',
          priority: 'low',
          file_path: '/test/updated.md'
        }
      );
    });
  });

  describe('deleteTaskFromGraph', () => {
    test('should delete task using query', async () => {
      await syncEngine.deleteTaskFromGraph('test-123');
      
      expect(mockGraphConnection.execute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE t'),
        { id: 'test-123' }
      );
    });
  });

  describe('clearCache', () => {
    test('should reset last sync time', () => {
      syncEngine.lastSyncTime = Date.now();
      const oldTime = syncEngine.lastSyncTime;
      
      syncEngine.clearCache();
      
      expect(syncEngine.lastSyncTime).toBe(null);
      expect(syncEngine.lastSyncTime).not.toBe(oldTime);
    });
  });

  describe('performance', () => {
    test('should handle large task lists efficiently', async () => {
      // Create 1000 tasks
      const fileTasks = Array(1000).fill(null).map((_, i) => ({
        id: `task-${i}`,
        title: `Task ${i}`,
        updated_at: '2025-06-11T12:00:00Z',
        dependencies: []
      }));
      
      mockFileStorage.listAllTasks.mockResolvedValue(fileTasks);
      mockGraphConnection.execute.mockResolvedValue([]); // Empty graph
      
      const startTime = Date.now();
      await syncEngine.syncFilesToGraph();
      const duration = Date.now() - startTime;
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds
      expect(mockGraphConnection.createTask).toHaveBeenCalledTimes(1000);
    });
  });
});