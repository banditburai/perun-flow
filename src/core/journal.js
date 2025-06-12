import { promises as fs } from 'fs';
import path from 'path';
import { log } from '../utils/logger.js';

/**
 * Simple append-only journal for operation logging
 * Provides audit trail and debugging capabilities
 */
export class SimpleJournal {
  constructor(tasksDir) {
    this.journalPath = path.join(tasksDir, '.journal.jsonl');
    this.tasksDir = tasksDir;
  }

  /**
   * Initialize journal (create if doesn't exist)
   */
  async initialize() {
    try {
      // Ensure tasks directory exists
      await fs.mkdir(this.tasksDir, { recursive: true });
      
      // Check if journal exists
      try {
        await fs.access(this.journalPath);
        log('debug', 'Journal file exists');
      } catch {
        // Create empty journal
        await fs.writeFile(this.journalPath, '', 'utf8');
        log('info', 'Created new journal file');
      }
    } catch (error) {
      log('error', `Failed to initialize journal: ${error.message}`);
      throw error;
    }
  }

  /**
   * Log an operation to the journal
   */
  async logOperation(operation, details = {}) {
    try {
      const entry = {
        timestamp: new Date().toISOString(),
        operation,
        details,
        version: '1.0' // For future compatibility
      };
      
      // Append as JSONL (one JSON object per line)
      const line = JSON.stringify(entry) + '\n';
      await fs.appendFile(this.journalPath, line, 'utf8');
      
      log('debug', `Journaled operation: ${operation}`);
    } catch (error) {
      // Don't throw - journaling failures shouldn't break operations
      log('error', `Failed to journal operation: ${error.message}`);
    }
  }

  /**
   * Log task creation
   */
  async logTaskCreated(task) {
    await this.logOperation('task.created', {
      task_id: task.id,
      semantic_id: task.semantic_id,
      title: task.title,
      priority: task.priority,
      dependencies: task.dependencies?.map(d => d.id) || []
    });
  }

  /**
   * Log task status update
   */
  async logTaskStatusUpdated(taskId, oldStatus, newStatus) {
    await this.logOperation('task.status_updated', {
      task_id: taskId,
      old_status: oldStatus,
      new_status: newStatus
    });
  }

  /**
   * Log task deletion
   */
  async logTaskDeleted(taskId, title) {
    await this.logOperation('task.deleted', {
      task_id: taskId,
      title: title
    });
  }

  /**
   * Log dependency addition
   */
  async logDependencyAdded(fromTaskId, toTaskId) {
    await this.logOperation('dependency.added', {
      from_task_id: fromTaskId,
      to_task_id: toTaskId
    });
  }

  /**
   * Log dependency removal
   */
  async logDependencyRemoved(fromTaskId, toTaskId) {
    await this.logOperation('dependency.removed', {
      from_task_id: fromTaskId,
      to_task_id: toTaskId
    });
  }

  /**
   * Log note addition
   */
  async logNoteAdded(taskId, notePreview) {
    await this.logOperation('note.added', {
      task_id: taskId,
      preview: notePreview.substring(0, 100) + (notePreview.length > 100 ? '...' : '')
    });
  }

  /**
   * Log subtask creation
   */
  async logSubtasksAdded(parentTaskId, subtaskCount) {
    await this.logOperation('subtasks.added', {
      parent_task_id: parentTaskId,
      count: subtaskCount
    });
  }

  /**
   * Log sync operation
   */
  async logSyncPerformed(result) {
    await this.logOperation('sync.performed', {
      status: result.status,
      changes: result.changes,
      details: result.details
    });
  }

  /**
   * Read recent journal entries
   */
  async getRecentEntries(limit = 50) {
    try {
      const content = await fs.readFile(this.journalPath, 'utf8');
      const lines = content.trim().split('\n').filter(line => line);
      
      // Get last N entries
      const recentLines = lines.slice(-limit);
      
      // Parse each line
      const entries = [];
      for (const line of recentLines) {
        try {
          entries.push(JSON.parse(line));
        } catch (error) {
          log('warn', `Skipping malformed journal entry: ${line}`);
        }
      }
      
      return entries.reverse(); // Most recent first
    } catch (error) {
      log('error', `Failed to read journal: ${error.message}`);
      return [];
    }
  }

  /**
   * Get journal statistics
   */
  async getStats() {
    try {
      const stats = await fs.stat(this.journalPath);
      const content = await fs.readFile(this.journalPath, 'utf8');
      const lines = content.trim().split('\n').filter(line => line);
      
      // Count operations by type
      const operationCounts = {};
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          operationCounts[entry.operation] = (operationCounts[entry.operation] || 0) + 1;
        } catch {
          // Skip malformed entries
        }
      }
      
      return {
        size_bytes: stats.size,
        size_mb: (stats.size / 1024 / 1024).toFixed(2),
        entry_count: lines.length,
        created_at: stats.birthtime,
        modified_at: stats.mtime,
        operations: operationCounts
      };
    } catch (error) {
      log('error', `Failed to get journal stats: ${error.message}`);
      return null;
    }
  }

  /**
   * Query journal entries by criteria
   */
  async query({ operation, taskId, startDate, endDate, limit = 100 }) {
    try {
      const content = await fs.readFile(this.journalPath, 'utf8');
      const lines = content.trim().split('\n').filter(line => line);
      
      const results = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          
          // Apply filters
          if (operation && entry.operation !== operation) continue;
          if (taskId && entry.details.task_id !== taskId) continue;
          if (startDate && new Date(entry.timestamp) < new Date(startDate)) continue;
          if (endDate && new Date(entry.timestamp) > new Date(endDate)) continue;
          
          results.push(entry);
          
          if (results.length >= limit) break;
        } catch {
          // Skip malformed entries
        }
      }
      
      return results.reverse(); // Most recent first
    } catch (error) {
      log('error', `Failed to query journal: ${error.message}`);
      return [];
    }
  }

  /**
   * Export journal to a different format
   */
  async export(format = 'json') {
    try {
      const entries = await this.getRecentEntries(Number.MAX_SAFE_INTEGER);
      
      if (format === 'json') {
        return JSON.stringify(entries, null, 2);
      } else if (format === 'csv') {
        // Simple CSV export
        const headers = ['timestamp', 'operation', 'details'];
        const rows = entries.map(e => [
          e.timestamp,
          e.operation,
          JSON.stringify(e.details)
        ]);
        
        return [headers, ...rows].map(row => row.join(',')).join('\n');
      }
      
      throw new Error(`Unsupported export format: ${format}`);
    } catch (error) {
      log('error', `Failed to export journal: ${error.message}`);
      throw error;
    }
  }

  /**
   * Rotate journal (archive current and start new)
   */
  async rotate() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const archivePath = path.join(this.tasksDir, `.journal-${timestamp}.jsonl`);
      
      // Move current journal to archive
      await fs.rename(this.journalPath, archivePath);
      
      // Create new empty journal
      await fs.writeFile(this.journalPath, '', 'utf8');
      
      log('info', `Rotated journal to ${archivePath}`);
      
      return archivePath;
    } catch (error) {
      log('error', `Failed to rotate journal: ${error.message}`);
      throw error;
    }
  }
}

export default SimpleJournal;