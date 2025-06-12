import { jest, describe, beforeEach, afterEach, test, expect } from '@jest/globals';
import { SimpleJournal } from '../../src/core/journal.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Mock logger to avoid console output
jest.mock('../../src/utils/logger.js');

describe('Journal Unit Tests', () => {
  let journal;
  let testDir;

  beforeEach(async () => {
    // Create unique test directory
    testDir = path.join(os.tmpdir(), `journal-test-${Date.now()}`);
    journal = new SimpleJournal(testDir);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('initialize', () => {
    test('should create journal file and directory', async () => {
      await journal.initialize();
      
      // Check directory exists
      const dirStats = await fs.stat(testDir);
      expect(dirStats.isDirectory()).toBe(true);
      
      // Check journal file exists
      const journalStats = await fs.stat(journal.journalPath);
      expect(journalStats.isFile()).toBe(true);
      
      // Check file is initially empty
      const content = await fs.readFile(journal.journalPath, 'utf8');
      expect(content).toBe('');
    });

    test('should handle existing journal file', async () => {
      // Create journal file first
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(journal.journalPath, 'existing content', 'utf8');
      
      await journal.initialize();
      
      // Should not overwrite existing content
      const content = await fs.readFile(journal.journalPath, 'utf8');
      expect(content).toBe('existing content');
    });

    test('should handle initialization errors', async () => {
      // Create read-only directory to trigger permission error
      const readOnlyDir = path.join(os.tmpdir(), 'readonly-test');
      await fs.mkdir(readOnlyDir, { recursive: true });
      await fs.chmod(readOnlyDir, 0o444); // Read-only
      
      const readOnlyJournal = new SimpleJournal(path.join(readOnlyDir, 'subdir'));
      
      try {
        await expect(readOnlyJournal.initialize()).rejects.toThrow();
      } finally {
        // Clean up
        await fs.chmod(readOnlyDir, 0o755);
        await fs.rm(readOnlyDir, { recursive: true, force: true });
      }
    });
  });

  describe('logOperation', () => {
    beforeEach(async () => {
      await journal.initialize();
    });

    test('should log operation with timestamp and version', async () => {
      const beforeTime = new Date();
      await journal.logOperation('test.operation', { key: 'value' });
      const afterTime = new Date();
      
      const content = await fs.readFile(journal.journalPath, 'utf8');
      const entry = JSON.parse(content.trim());
      
      expect(entry.operation).toBe('test.operation');
      expect(entry.details).toEqual({ key: 'value' });
      expect(entry.version).toBe('1.0');
      
      const timestamp = new Date(entry.timestamp);
      expect(timestamp >= beforeTime).toBe(true);
      expect(timestamp <= afterTime).toBe(true);
    });

    test('should append multiple operations as JSONL', async () => {
      await journal.logOperation('operation1', { data: 1 });
      await journal.logOperation('operation2', { data: 2 });
      await journal.logOperation('operation3', { data: 3 });
      
      const content = await fs.readFile(journal.journalPath, 'utf8');
      const lines = content.trim().split('\n');
      
      expect(lines).toHaveLength(3);
      
      const entry1 = JSON.parse(lines[0]);
      const entry2 = JSON.parse(lines[1]);
      const entry3 = JSON.parse(lines[2]);
      
      expect(entry1.operation).toBe('operation1');
      expect(entry2.operation).toBe('operation2');
      expect(entry3.operation).toBe('operation3');
    });

    test('should handle empty details', async () => {
      await journal.logOperation('no.details');
      
      const content = await fs.readFile(journal.journalPath, 'utf8');
      const entry = JSON.parse(content.trim());
      
      expect(entry.operation).toBe('no.details');
      expect(entry.details).toEqual({});
    });

    test('should not throw on logging errors', async () => {
      // Don't initialize journal to trigger error
      const badJournal = new SimpleJournal('/nonexistent/path');
      
      // Should not throw even if logging fails
      await expect(badJournal.logOperation('test', {})).resolves.not.toThrow();
    });
  });

  describe('specific logging methods', () => {
    beforeEach(async () => {
      await journal.initialize();
    });

    test('should log task creation', async () => {
      const task = {
        id: 'task-123',
        semantic_id: 'TEST-1.01',
        title: 'Test Task',
        priority: 'high',
        dependencies: [{ id: 'dep1' }, { id: 'dep2' }]
      };
      
      await journal.logTaskCreated(task);
      
      const entries = await journal.getRecentEntries(1);
      expect(entries).toHaveLength(1);
      expect(entries[0].operation).toBe('task.created');
      expect(entries[0].details).toEqual({
        task_id: 'task-123',
        semantic_id: 'TEST-1.01',
        title: 'Test Task',
        priority: 'high',
        dependencies: ['dep1', 'dep2']
      });
    });

    test('should log task status update', async () => {
      await journal.logTaskStatusUpdated('task-123', 'pending', 'in-progress');
      
      const entries = await journal.getRecentEntries(1);
      expect(entries[0].operation).toBe('task.status_updated');
      expect(entries[0].details).toEqual({
        task_id: 'task-123',
        old_status: 'pending',
        new_status: 'in-progress'
      });
    });

    test('should log task deletion', async () => {
      await journal.logTaskDeleted('task-123', 'Deleted Task');
      
      const entries = await journal.getRecentEntries(1);
      expect(entries[0].operation).toBe('task.deleted');
      expect(entries[0].details).toEqual({
        task_id: 'task-123',
        title: 'Deleted Task'
      });
    });

    test('should log dependency operations', async () => {
      await journal.logDependencyAdded('task1', 'task2');
      await journal.logDependencyRemoved('task1', 'task3');
      
      const entries = await journal.getRecentEntries(2);
      
      expect(entries[0].operation).toBe('dependency.removed');
      expect(entries[0].details).toEqual({
        from_task_id: 'task1',
        to_task_id: 'task3'
      });
      
      expect(entries[1].operation).toBe('dependency.added');
      expect(entries[1].details).toEqual({
        from_task_id: 'task1',
        to_task_id: 'task2'
      });
    });

    test('should log note addition with preview', async () => {
      const longNote = 'This is a very long note that exceeds 100 characters and should be truncated when logged to the journal for preview purposes';
      
      await journal.logNoteAdded('task-123', longNote);
      
      const entries = await journal.getRecentEntries(1);
      expect(entries[0].operation).toBe('note.added');
      expect(entries[0].details.task_id).toBe('task-123');
      expect(entries[0].details.preview).toHaveLength(103); // 100 + '...'
      expect(entries[0].details.preview.endsWith('...')).toBe(true);
    });

    test('should log subtasks addition', async () => {
      await journal.logSubtasksAdded('parent-123', 5);
      
      const entries = await journal.getRecentEntries(1);
      expect(entries[0].operation).toBe('subtasks.added');
      expect(entries[0].details).toEqual({
        parent_task_id: 'parent-123',
        count: 5
      });
    });

    test('should log sync operations', async () => {
      const syncResult = {
        status: 'synced',
        changes: 3,
        details: { created: 1, updated: 2, deleted: 0 }
      };
      
      await journal.logSyncPerformed(syncResult);
      
      const entries = await journal.getRecentEntries(1);
      expect(entries[0].operation).toBe('sync.performed');
      expect(entries[0].details).toEqual(syncResult);
    });
  });

  describe('getRecentEntries', () => {
    beforeEach(async () => {
      await journal.initialize();
    });

    test('should return recent entries in reverse order', async () => {
      await journal.logOperation('first', { order: 1 });
      await journal.logOperation('second', { order: 2 });
      await journal.logOperation('third', { order: 3 });
      
      const entries = await journal.getRecentEntries(3);
      
      expect(entries).toHaveLength(3);
      expect(entries[0].operation).toBe('third');
      expect(entries[1].operation).toBe('second');
      expect(entries[2].operation).toBe('first');
    });

    test('should respect limit parameter', async () => {
      for (let i = 1; i <= 10; i++) {
        await journal.logOperation(`operation${i}`, { order: i });
      }
      
      const entries = await journal.getRecentEntries(5);
      expect(entries).toHaveLength(5);
      expect(entries[0].operation).toBe('operation10');
      expect(entries[4].operation).toBe('operation6');
    });

    test('should handle malformed entries gracefully', async () => {
      // Add valid entry
      await journal.logOperation('valid', {});
      
      // Add malformed entry manually
      await fs.appendFile(journal.journalPath, 'invalid json\n', 'utf8');
      
      // Add another valid entry
      await journal.logOperation('valid2', {});
      
      const entries = await journal.getRecentEntries(10);
      expect(entries).toHaveLength(2);
      expect(entries[0].operation).toBe('valid2');
      expect(entries[1].operation).toBe('valid');
    });

    test('should return empty array for non-existent journal', async () => {
      const emptyJournal = new SimpleJournal('/nonexistent/path');
      const entries = await emptyJournal.getRecentEntries();
      expect(entries).toEqual([]);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await journal.initialize();
    });

    test('should return journal statistics', async () => {
      await journal.logOperation('test.operation1', {});
      await journal.logOperation('test.operation2', {});
      await journal.logOperation('test.operation1', {});
      
      const stats = await journal.getStats();
      
      expect(stats.entry_count).toBe(3);
      expect(stats.size_bytes).toBeGreaterThan(0);
      expect(stats.size_mb).toBeDefined();
      expect(typeof stats.created_at).toBe('object');
      expect(typeof stats.modified_at).toBe('object');
      expect(stats.created_at).toBeTruthy();
      expect(stats.modified_at).toBeTruthy();
      expect(stats.operations).toEqual({
        'test.operation1': 2,
        'test.operation2': 1
      });
    });

    test('should handle empty journal', async () => {
      const stats = await journal.getStats();
      
      expect(stats.entry_count).toBe(0);
      expect(stats.size_bytes).toBe(0);
      expect(stats.operations).toEqual({});
    });

    test('should return null for non-existent journal', async () => {
      const emptyJournal = new SimpleJournal('/nonexistent/path');
      const stats = await emptyJournal.getStats();
      expect(stats).toBeNull();
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      await journal.initialize();
      
      // Set up test data
      await journal.logTaskCreated({ id: 'task1', title: 'Task 1' });
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      await journal.logTaskStatusUpdated('task1', 'pending', 'done');
      await new Promise(resolve => setTimeout(resolve, 10));
      await journal.logTaskCreated({ id: 'task2', title: 'Task 2' });
      await new Promise(resolve => setTimeout(resolve, 10));
      await journal.logDependencyAdded('task2', 'task1');
    });

    test('should filter by operation type', async () => {
      const results = await journal.query({ operation: 'task.created' });
      
      expect(results).toHaveLength(2);
      expect(results.every(e => e.operation === 'task.created')).toBe(true);
    });

    test('should filter by task ID', async () => {
      const results = await journal.query({ taskId: 'task1' });
      
      expect(results).toHaveLength(2);
      expect(results.every(e => e.details.task_id === 'task1')).toBe(true);
    });

    test('should filter by date range', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
      
      const results = await journal.query({
        startDate: oneHourAgo.toISOString(),
        endDate: oneHourFromNow.toISOString()
      });
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(e => 
        new Date(e.timestamp) >= oneHourAgo && 
        new Date(e.timestamp) <= oneHourFromNow
      )).toBe(true);
    });

    test('should respect limit parameter', async () => {
      const results = await journal.query({ limit: 2 });
      expect(results).toHaveLength(2);
    });

    test('should combine multiple filters', async () => {
      const results = await journal.query({
        operation: 'task.created',
        taskId: 'task1',
        limit: 1
      });
      
      expect(results).toHaveLength(1);
      expect(results[0].operation).toBe('task.created');
      expect(results[0].details.task_id).toBe('task1');
    });

    test('should return empty array for non-matching criteria', async () => {
      const results = await journal.query({ operation: 'nonexistent.operation' });
      expect(results).toEqual([]);
    });
  });

  describe('export', () => {
    beforeEach(async () => {
      await journal.initialize();
      await journal.logOperation('test1', { data: 'value1' });
      await journal.logOperation('test2', { data: 'value2' });
    });

    test('should export as JSON format', async () => {
      const exported = await journal.export('json');
      const parsed = JSON.parse(exported);
      
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].operation).toBe('test2'); // Most recent first
      expect(parsed[1].operation).toBe('test1');
    });

    test('should export as CSV format', async () => {
      const exported = await journal.export('csv');
      const lines = exported.split('\n');
      
      expect(lines[0]).toBe('timestamp,operation,details');
      expect(lines).toHaveLength(3); // Header + 2 entries
      expect(lines[1]).toContain('test2');
      expect(lines[2]).toContain('test1');
    });

    test('should default to JSON format', async () => {
      const exported = await journal.export();
      expect(() => JSON.parse(exported)).not.toThrow();
    });

    test('should throw for unsupported format', async () => {
      await expect(journal.export('xml')).rejects.toThrow('Unsupported export format: xml');
    });
  });

  describe('rotate', () => {
    beforeEach(async () => {
      await journal.initialize();
      await journal.logOperation('before.rotation', {});
    });

    test('should archive current journal and create new one', async () => {
      const archivePath = await journal.rotate();
      
      // Archive should exist
      const archiveExists = await fs.access(archivePath).then(() => true).catch(() => false);
      expect(archiveExists).toBe(true);
      
      // New journal should exist and be empty
      const newContent = await fs.readFile(journal.journalPath, 'utf8');
      expect(newContent).toBe('');
      
      // Archive should contain old content
      const archiveContent = await fs.readFile(archivePath, 'utf8');
      expect(archiveContent).toContain('before.rotation');
    });

    test('should handle rotation errors', async () => {
      // Create a situation that will cause rotation to fail
      const nonWritableJournal = new SimpleJournal('/readonly/path');
      await expect(nonWritableJournal.rotate()).rejects.toThrow();
    });
  });

  describe('performance and large data', () => {
    beforeEach(async () => {
      await journal.initialize();
    });

    test('should handle large number of entries efficiently', async () => {
      const startTime = Date.now();
      
      // Log 1000 operations
      for (let i = 0; i < 1000; i++) {
        await journal.logOperation(`bulk.operation.${i}`, { index: i });
      }
      
      const duration = Date.now() - startTime;
      
      // Should complete within reasonable time (adjust based on system)
      expect(duration).toBeLessThan(5000); // 5 seconds
      
      // Verify all entries are logged
      const stats = await journal.getStats();
      expect(stats.entry_count).toBe(1000);
    });

    test('should handle very large entry details', async () => {
      const largeDetails = {
        description: 'x'.repeat(10000), // 10KB string
        metadata: Array(1000).fill().map((_, i) => ({ id: i, value: `item${i}` }))
      };
      
      await journal.logOperation('large.entry', largeDetails);
      
      const entries = await journal.getRecentEntries(1);
      expect(entries[0].details).toEqual(largeDetails);
    });

    test('should handle concurrent logging operations', async () => {
      const promises = Array(50).fill().map((_, i) =>
        journal.logOperation(`concurrent.${i}`, { index: i })
      );
      
      await Promise.all(promises);
      
      const stats = await journal.getStats();
      expect(stats.entry_count).toBe(50);
    });
  });
});