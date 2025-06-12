import { jest, describe, beforeEach, afterEach, test, expect } from '@jest/globals';
import { FileStorage } from '../../src/storage/file-storage.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('FileStorage Functional Tests', () => {
  let fileStorage;
  let testDir;

  beforeEach(async () => {
    // Create unique test directory
    testDir = path.join(os.tmpdir(), `file-storage-functional-test-${Date.now()}`);
    fileStorage = new FileStorage(testDir);
    await fileStorage.initialize();
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Task Persistence', () => {
    test('should store and retrieve task data correctly', async () => {
      const originalTask = {
        id: 'task-123',
        semantic_id: 'API-1.01',
        title: 'Build REST API',
        description: 'Create user authentication endpoints',
        status: 'pending',
        priority: 'high',
        created_at: '2025-06-11T12:00:00Z',
        dependencies: [
          { id: 'auth-service', status: 'done' },
          { id: 'database-setup', status: 'in-progress' }
        ],
        subtasks: [
          { title: 'Design API schema', is_complete: true },
          { title: 'Implement endpoints', is_complete: false },
          { title: 'Add validation', is_complete: false }
        ],
        notes: [
          { timestamp: '2025-06-11T10:00:00Z', content: 'Started planning phase' },
          { timestamp: '2025-06-11T11:00:00Z', content: 'Reviewed requirements' }
        ]
      };

      // Action: Store the task
      const filePath = await fileStorage.createTaskFile(originalTask);
      expect(filePath).toBeTruthy();

      // Verification: Retrieve and verify all data is preserved
      const retrievedTask = await fileStorage.readTaskFile('task-123');
      
      expect(retrievedTask).toMatchObject({
        id: 'task-123',
        semantic_id: 'API-1.01',
        title: 'Build REST API',
        description: 'Create user authentication endpoints',
        status: 'pending',
        priority: 'high'
      });

      // Verify complex nested data
      expect(retrievedTask.dependencies).toHaveLength(2);
      expect(retrievedTask.dependencies[0]).toMatchObject({ id: 'auth-service', status: 'done' });
      expect(retrievedTask.dependencies[1]).toMatchObject({ id: 'database-setup', status: 'in-progress' });

      expect(retrievedTask.subtasks).toHaveLength(3);
      expect(retrievedTask.subtasks[0]).toMatchObject({ title: 'Design API schema', is_complete: true });
      expect(retrievedTask.subtasks[1]).toMatchObject({ title: 'Implement endpoints', is_complete: false });

      expect(retrievedTask.notes).toHaveLength(2);
      expect(retrievedTask.notes[0]).toMatchObject({ 
        timestamp: '2025-06-11T10:00:00Z', 
        content: 'Started planning phase' 
      });
    });

    test('should handle minimal task data correctly', async () => {
      const minimalTask = {
        id: 'minimal-task',
        title: 'Simple Task',
        status: 'pending'
      };

      await fileStorage.createTaskFile(minimalTask);
      const retrieved = await fileStorage.readTaskFile('minimal-task');

      expect(retrieved.id).toBe('minimal-task');
      expect(retrieved.title).toBe('Simple Task');
      expect(retrieved.status).toBe('pending');
      expect(retrieved.dependencies).toEqual([]);
      expect(retrieved.subtasks).toEqual([]);
      expect(retrieved.notes).toEqual([]);
    });

    test('should preserve data integrity across multiple operations', async () => {
      const task = {
        id: 'integrity-test',
        title: 'Data Integrity Test',
        status: 'pending',
        priority: 'medium',
        dependencies: [{ id: 'dep1', status: 'done' }]
      };

      // Create, read, verify
      await fileStorage.createTaskFile(task);
      let retrieved = await fileStorage.readTaskFile('integrity-test');
      expect(retrieved.dependencies).toHaveLength(1);

      // Update status and verify data is preserved
      await fileStorage.updateTaskStatus('integrity-test', 'in-progress');
      retrieved = await fileStorage.readTaskFile('integrity-test');
      
      expect(retrieved.status).toBe('in-progress');
      expect(retrieved.title).toBe('Data Integrity Test'); // Should preserve
      expect(retrieved.priority).toBe('medium'); // Should preserve
      expect(retrieved.dependencies).toHaveLength(1); // Should preserve
    });
  });

  describe('Task Status Management', () => {
    test('should move tasks between status directories', async () => {
      const task = {
        id: 'status-test',
        title: 'Status Test Task',
        status: 'pending'
      };

      // Create in pending
      await fileStorage.createTaskFile(task);
      let retrieved = await fileStorage.readTaskFile('status-test');
      expect(retrieved.file_path).toContain('/pending/');

      // Move to in-progress
      await fileStorage.updateTaskStatus('status-test', 'in-progress');
      retrieved = await fileStorage.readTaskFile('status-test');
      expect(retrieved.status).toBe('in-progress');
      expect(retrieved.file_path).toContain('/in-progress/');

      // Move to done
      await fileStorage.updateTaskStatus('status-test', 'done');
      retrieved = await fileStorage.readTaskFile('status-test');
      expect(retrieved.status).toBe('done');
      expect(retrieved.file_path).toContain('/done/');

      // Should still be the same task
      expect(retrieved.id).toBe('status-test');
      expect(retrieved.title).toBe('Status Test Task');
    });

    test('should handle non-existent task gracefully', async () => {
      await expect(
        fileStorage.updateTaskStatus('non-existent', 'done')
      ).rejects.toThrow('Task non-existent not found');
    });

    test('should find tasks regardless of status directory', async () => {
      // Create tasks in different directories
      await fileStorage.createTaskFile({
        id: 'pending-task',
        title: 'Pending Task',
        status: 'pending'
      });

      await fileStorage.createTaskFile({
        id: 'progress-task',
        title: 'In Progress Task',
        status: 'in-progress'
      });

      // Move one to done
      await fileStorage.updateTaskStatus('pending-task', 'done');

      // Should find both regardless of directory
      const pendingTask = await fileStorage.readTaskFile('pending-task');
      const progressTask = await fileStorage.readTaskFile('progress-task');

      expect(pendingTask.status).toBe('done');
      expect(progressTask.status).toBe('in-progress');
    });
  });

  describe('Task Collection Operations', () => {
    test('should list all tasks across directories', async () => {
      // Create tasks in different status directories
      const tasks = [
        { id: 'task-1', title: 'First Task', status: 'pending' },
        { id: 'task-2', title: 'Second Task', status: 'in-progress' },
        { id: 'task-3', title: 'Third Task', status: 'done' }
      ];

      for (const task of tasks) {
        await fileStorage.createTaskFile(task);
      }

      const allTasks = await fileStorage.listAllTasks();
      
      expect(allTasks).toHaveLength(3);
      
      const taskIds = allTasks.map(t => t.id).sort();
      expect(taskIds).toEqual(['task-1', 'task-2', 'task-3']);

      // Verify each task has correct data
      const task1 = allTasks.find(t => t.id === 'task-1');
      expect(task1.title).toBe('First Task');
      expect(task1.status).toBe('pending');
    });

    test('should handle empty directories gracefully', async () => {
      const tasks = await fileStorage.listAllTasks();
      expect(tasks).toEqual([]);
    });

    test('should maintain task data when listing', async () => {
      const complexTask = {
        id: 'complex-task',
        title: 'Complex Task',
        status: 'pending',
        priority: 'high',
        dependencies: [{ id: 'dep1', status: 'done' }],
        subtasks: [{ title: 'Subtask 1', is_complete: false }]
      };

      await fileStorage.createTaskFile(complexTask);
      const tasks = await fileStorage.listAllTasks();
      
      expect(tasks).toHaveLength(1);
      const task = tasks[0];
      
      expect(task.priority).toBe('high');
      expect(task.dependencies).toHaveLength(1);
      expect(task.subtasks).toHaveLength(1);
    });
  });

  describe('Filename Generation', () => {
    test('should generate unique filenames for different tasks', async () => {
      const task1 = { id: 'task-1', semantic_id: 'API-1.01', title: 'API Task', status: 'pending' };
      const task2 = { id: 'task-2', semantic_id: 'UI-1.01', title: 'UI Task', status: 'pending' };

      const path1 = await fileStorage.createTaskFile(task1);
      const path2 = await fileStorage.createTaskFile(task2);

      // Should have different filenames
      expect(path.basename(path1)).not.toBe(path.basename(path2));
      
      // Should both be retrievable
      const retrieved1 = await fileStorage.readTaskFile('task-1');
      const retrieved2 = await fileStorage.readTaskFile('task-2');
      
      expect(retrieved1.title).toBe('API Task');
      expect(retrieved2.title).toBe('UI Task');
    });

    test('should handle special characters in titles', async () => {
      const task = {
        id: 'special-chars',
        title: 'Task with Special!@#$%^&*() Characters',
        status: 'pending'
      };

      const filePath = await fileStorage.createTaskFile(task);
      const retrieved = await fileStorage.readTaskFile('special-chars');

      expect(retrieved.title).toBe('Task with Special!@#$%^&*() Characters');
      expect(filePath).toBeTruthy();
    });

    test('should handle very long titles', async () => {
      const longTitle = 'This is a very long title that exceeds normal length limits and should be handled gracefully by the file storage system without breaking';
      
      const task = {
        id: 'long-title',
        title: longTitle,
        status: 'pending'
      };

      const filePath = await fileStorage.createTaskFile(task);
      const retrieved = await fileStorage.readTaskFile('long-title');

      expect(retrieved.title).toBe(longTitle);
      expect(filePath).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    test('should handle directory creation gracefully', async () => {
      // Try to create in a new directory structure
      const deepPath = path.join(testDir, 'very', 'deep', 'nested', 'structure');
      const deepStorage = new FileStorage(deepPath);
      
      await expect(deepStorage.initialize()).resolves.toBe(true);
      
      // Should be able to create tasks
      const task = { id: 'deep-task', title: 'Deep Task', status: 'pending' };
      await expect(deepStorage.createTaskFile(task)).resolves.toBeTruthy();
    });

    test('should return null for non-existent tasks', async () => {
      const task = await fileStorage.readTaskFile('does-not-exist');
      expect(task).toBeNull();
    });

    test('should handle concurrent operations', async () => {
      const tasks = Array(10).fill(null).map((_, i) => ({
        id: `concurrent-${i}`,
        title: `Concurrent Task ${i}`,
        status: 'pending'
      }));

      // Create all tasks concurrently
      const promises = tasks.map(task => fileStorage.createTaskFile(task));
      const results = await Promise.all(promises);

      // All should succeed
      expect(results).toHaveLength(10);
      expect(results.every(path => path)).toBe(true);

      // All should be retrievable
      const retrieved = await Promise.all(
        tasks.map(task => fileStorage.readTaskFile(task.id))
      );

      expect(retrieved).toHaveLength(10);
      expect(retrieved.every(task => task !== null)).toBe(true);
    });
  });

  describe('Data Format Flexibility', () => {
    test('should preserve data types correctly', async () => {
      const task = {
        id: 'types-test',
        title: 'Type Preservation Test',
        status: 'pending',
        priority: 'high',
        created_at: '2025-06-11T12:00:00Z',
        dependencies: [],
        subtasks: [],
        notes: []
      };

      await fileStorage.createTaskFile(task);
      const retrieved = await fileStorage.readTaskFile('types-test');

      expect(typeof retrieved.title).toBe('string');
      expect(Array.isArray(retrieved.dependencies)).toBe(true);
      expect(Array.isArray(retrieved.subtasks)).toBe(true);
      expect(Array.isArray(retrieved.notes)).toBe(true);
    });

    test('should handle missing optional fields gracefully', async () => {
      const bareMinimum = {
        id: 'minimal',
        title: 'Minimal Task',
        status: 'pending'
        // No description, priority, etc.
      };

      await fileStorage.createTaskFile(bareMinimum);
      const retrieved = await fileStorage.readTaskFile('minimal');

      expect(retrieved.id).toBe('minimal');
      expect(retrieved.title).toBe('Minimal Task');
      expect(retrieved.status).toBe('pending');
      // Should handle missing fields gracefully
      expect(retrieved.dependencies).toEqual([]);
      expect(retrieved.subtasks).toEqual([]);
      expect(retrieved.notes).toEqual([]);
    });
  });
});