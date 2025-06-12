import { promises as fs } from 'fs';
import path from 'path';
import { log } from '../utils/logger.js';

/**
 * Sync engine that ensures graph database matches file system state
 * Files are the source of truth, graph syncs to match
 */
export class SyncEngine {
  constructor(fileStorage, graphConnection) {
    this.files = fileStorage;
    this.graph = graphConnection;
    this.lastSyncTime = null;
    this.syncCache = new Map();

    // Track changes for efficient sync
    this.mcpChanges = new Set(); // Changes made by MCP operations
    this.fileTimestamps = new Map(); // file path -> last known mtime
    this.lastFullScan = 0; // Timestamp of last full scan
    this.fullScanInterval = 60000; // Re-scan interval (1 minute)
  }

  /**
   * Check if sync is needed based on file timestamps
   */
  async needsSync() {
    try {
      // Get latest file modification time
      const latestFileTime = await this.getLatestFileModTime();

      // If no last sync time, we need to sync
      if (!this.lastSyncTime) {
        return true;
      }

      // If files have been modified since last sync
      return latestFileTime > this.lastSyncTime;
    } catch (error) {
      log('warn', `Error checking sync status: ${error.message}`);
      return true; // Safe default - sync when uncertain
    }
  }

  /**
   * Get the latest modification time across all task files
   */
  async getLatestFileModTime() {
    let latestTime = 0;

    for (const status of this.files.statusDirs) {
      const dir = path.join(this.files.tasksDir, status);
      try {
        const files = await fs.readdir(dir);

        for (const file of files) {
          if (file.endsWith('.md')) {
            const filepath = path.join(dir, file);
            const stats = await fs.stat(filepath);
            if (stats.mtimeMs > latestTime) {
              latestTime = stats.mtimeMs;
            }
          }
        }
      } catch (error) {
        // Directory might not exist yet
        log('debug', `Skipping ${status} directory: ${error.message}`);
      }
    }

    return latestTime;
  }

  /**
   * Ensure graph is synced with file system
   * This is the main entry point called before any operation
   */
  async ensureSynced() {
    try {
      // Check if sync is needed
      if (!(await this.needsSync())) {
        log('debug', 'Graph is already in sync with files');
        return { status: 'already_synced', changes: 0 };
      }

      log('info', 'Starting sync from files to graph');

      // Perform the sync
      const result = await this.syncFilesToGraph();

      // Update last sync time
      this.lastSyncTime = Date.now();

      log('info', `Sync completed: ${result.changes} changes applied`);

      return result;
    } catch (error) {
      log('error', `Sync failed: ${error.message}`);
      // Don't throw - allow operations to continue with potentially stale graph
      return { status: 'failed', error: error.message, changes: 0 };
    }
  }

  /**
   * Sync all tasks from files to graph (intelligent sync)
   */
  async syncFilesToGraph() {
    log('info', 'Starting file-to-graph synchronization');

    const changes = {
      created: 0,
      updated: 0,
      deleted: 0,
      dependencies: 0,
    };

    try {
      // Get all tasks from files
      const fileTasks = await this.files.listAllTasks();
      const fileTaskIds = new Set(fileTasks.map(t => t.id));

      // Get all tasks from graph
      const graphTasks = await this.getAllGraphTasks();
      const graphTaskIds = new Set(graphTasks.map(t => t.id));

      // Process each file task
      for (const fileTask of fileTasks) {
        try {
          if (!graphTaskIds.has(fileTask.id)) {
            // Task exists in file but not graph - create it
            await this.createTaskInGraph(fileTask);
            changes.created++;
          } else {
            // Task exists in both - check if update needed
            const graphTask = graphTasks.find(t => t.id === fileTask.id);
            if (this.needsUpdate(fileTask, graphTask)) {
              await this.updateTaskInGraph(fileTask);
              changes.updated++;
            }
          }

          // Sync dependencies
          const depChanges = await this.syncTaskDependencies(fileTask);
          changes.dependencies += depChanges;

          // Sync subtasks
          await this.syncSubtasks(fileTask);
        } catch (error) {
          log('error', `Failed to sync task ${fileTask.id}: ${error.message}`);
        }
      }

      // Remove tasks that exist in graph but not files
      for (const graphTask of graphTasks) {
        if (!fileTaskIds.has(graphTask.id) && !graphTask.id.includes('-')) {
          // Don't delete subtasks (they have parent-N format)
          try {
            await this.deleteTaskFromGraph(graphTask.id);
            changes.deleted++;
          } catch (error) {
            log('error', `Failed to delete task ${graphTask.id}: ${error.message}`);
          }
        }
      }

      // Second pass: sync parent-child relationships
      for (const fileTask of fileTasks) {
        if (fileTask.parent_id) {
          try {
            await this.syncParentChildRelationship(fileTask);
          } catch (error) {
            log(
              'error',
              `Failed to sync parent-child relationship for ${fileTask.id}: ${error.message}`
            );
          }
        }
      }

      log(
        'info',
        `Sync completed: ${changes.created} created, ${changes.updated} updated, ${changes.deleted} deleted`
      );

      return {
        status: 'synced',
        changes: changes.created + changes.updated + changes.deleted,
        details: changes,
      };
    } catch (error) {
      log('error', `Sync failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all tasks from graph
   */
  async getAllGraphTasks() {
    const query = `
      MATCH (t:Task)
      RETURN t
    `;

    const result = await this.graph.execute(query);
    return result.map(row => row.t);
  }

  /**
   * Check if task needs update in graph
   */
  needsUpdate(fileTask, graphTask) {
    // Compare key fields
    return (
      fileTask.title !== graphTask.title ||
      fileTask.status !== graphTask.status ||
      fileTask.priority !== graphTask.priority ||
      fileTask.description !== graphTask.description ||
      fileTask.file_path !== graphTask.file_path
    );
  }

  /**
   * Create task in graph from file
   */
  async createTaskInGraph(fileTask) {
    await this.graph.createTask({
      id: fileTask.id,
      semantic_id: fileTask.semantic_id,
      title: fileTask.title,
      description: fileTask.description || '',
      status: fileTask.status,
      priority: fileTask.priority,
      created_at: fileTask.created_at,
      file_path: fileTask.file_path,
    });

    log('debug', `Created task in graph: ${fileTask.id}`);
  }

  /**
   * Update task in graph from file
   */
  async updateTaskInGraph(fileTask) {
    await this.graph.updateTask(fileTask.id, {
      title: fileTask.title,
      description: fileTask.description || '',
      status: fileTask.status,
      priority: fileTask.priority,
      file_path: fileTask.file_path,
    });

    log('debug', `Updated task in graph: ${fileTask.id}`);
  }

  /**
   * Delete task from graph
   */
  async deleteTaskFromGraph(taskId) {
    const query = `
      MATCH (t:Task {id: $id})
      DELETE t
    `;

    await this.graph.execute(query, { id: taskId });
    log('debug', `Deleted task from graph: ${taskId}`);
  }

  /**
   * Sync task dependencies from file to graph
   */
  async syncTaskDependencies(fileTask) {
    let changes = 0;

    if (!fileTask.dependencies || fileTask.dependencies.length === 0) {
      // Remove all dependencies if none in file
      const removed = await this.graph.execute(
        `
        MATCH (t:Task {id: $id})-[d:DEPENDS_ON]->()
        DELETE d
        RETURN count(d) as count
      `,
        { id: fileTask.id }
      );

      return removed[0]?.count || 0;
    }

    // Get current dependencies from graph
    const currentDeps = await this.graph.getDependencies(fileTask.id);
    const currentDepIds = new Set(currentDeps.map(d => d.id));
    const fileDepIds = new Set(fileTask.dependencies.map(d => d.id));

    // Add missing dependencies
    for (const dep of fileTask.dependencies) {
      if (!currentDepIds.has(dep.id)) {
        try {
          await this.graph.addDependency(fileTask.id, dep.id);
          changes++;
          log('debug', `Added dependency: ${fileTask.id} -> ${dep.id}`);
        } catch (error) {
          log('warn', `Failed to add dependency ${fileTask.id} -> ${dep.id}: ${error.message}`);
        }
      }
    }

    // Remove dependencies not in file
    for (const currentDep of currentDeps) {
      if (!fileDepIds.has(currentDep.id)) {
        try {
          await this.removeDependency(fileTask.id, currentDep.id);
          changes++;
          log('debug', `Removed dependency: ${fileTask.id} -> ${currentDep.id}`);
        } catch (error) {
          log('warn', `Failed to remove dependency: ${error.message}`);
        }
      }
    }

    return changes;
  }

  /**
   * Remove a dependency relationship
   */
  async removeDependency(fromId, toId) {
    const query = `
      MATCH (t1:Task {id: $fromId})-[d:DEPENDS_ON]->(t2:Task {id: $toId})
      DELETE d
    `;

    await this.graph.execute(query, { fromId, toId });
  }

  /**
   * Sync subtasks for a task
   */
  async syncSubtasks(fileTask) {
    if (!fileTask.subtasks || fileTask.subtasks.length === 0) {
      // Remove all subtasks if none in file
      await this.graph.execute(
        `
        MATCH (parent:Task {id: $parentId})-[rel:PARENT_CHILD]->(child:Task)
        WHERE rel.relationship_type = 'subtask'
        DELETE child
      `,
        { parentId: fileTask.id }
      );
      return;
    }

    // Get current subtasks from graph
    const currentSubtasks = await this.graph.execute(
      `
      MATCH (parent:Task {id: $parentId})-[rel:PARENT_CHILD]->(child:Task)
      WHERE rel.relationship_type = 'subtask'
      RETURN child
      ORDER BY child.id
    `,
      { parentId: fileTask.id }
    );

    const currentSubtaskIds = new Set(currentSubtasks.map(r => r.child.id));

    // Sync each subtask
    for (let i = 0; i < fileTask.subtasks.length; i++) {
      const subtask = fileTask.subtasks[i];
      const subtaskId = `${fileTask.id}-${i + 1}`;

      if (!currentSubtaskIds.has(subtaskId)) {
        // Create subtask node
        await this.graph.createTask({
          id: subtaskId,
          title: subtask.title,
          status: subtask.is_complete ? 'done' : 'pending',
          priority: fileTask.priority,
          file_path: fileTask.file_path,
        });

        // Create unified PARENT_CHILD relationship for subtask
        await this.graph.createUnifiedParentChildRelationship(fileTask.id, subtaskId, 'subtask', {
          position: i,
          is_complete: subtask.is_complete || false,
        });
      } else {
        // Update existing subtask
        await this.graph.updateTask(subtaskId, {
          title: subtask.title,
          status: subtask.is_complete ? 'done' : 'pending',
        });

        // Update relationship
        await this.graph.execute(
          `
          MATCH (parent:Task {id: $parentId})-[r:PARENT_CHILD]->(child:Task {id: $childId})
          SET r.is_complete = $isComplete
        `,
          {
            parentId: fileTask.id,
            childId: subtaskId,
            isComplete: subtask.is_complete || false,
          }
        );
      }
    }

    // Remove extra subtasks
    for (const row of currentSubtasks) {
      const subtaskId = row.child.id;
      const index = parseInt(subtaskId.split('-').pop()) - 1;
      if (index >= fileTask.subtasks.length) {
        await this.graph.execute(
          `
          MATCH (t:Task {id: $id})
          DELETE t
        `,
          { id: subtaskId }
        );
      }
    }
  }

  /**
   * Verify sync status between files and graph
   */
  async verifySyncStatus() {
    try {
      // Count tasks in files
      const fileTasks = await this.files.listAllTasks();
      const fileCount = fileTasks.length;

      // Count tasks in graph (excluding subtasks)
      const graphResult = await this.graph.execute(`
        MATCH (t:Task)
        WHERE NOT EXISTS {
          MATCH (parent:Task)-[rel:PARENT_CHILD]->(t)
          WHERE rel.relationship_type = 'subtask'
        }
        RETURN count(t) as count
      `);
      const graphCount = graphResult[0]?.count || 0;

      const inSync = fileCount === graphCount;

      return {
        in_sync: inSync,
        file_count: fileCount,
        graph_count: graphCount,
        difference: fileCount - graphCount,
      };
    } catch (error) {
      log('error', `Failed to verify sync status: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sync a single task from file to graph
   */
  async syncTaskToGraph(taskId) {
    try {
      // Read task from file
      const task = await this.files.readTaskFile(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found in files`);
      }

      // Check if exists in graph
      const existing = await this.graph.getTask(taskId);

      if (existing) {
        // Update existing
        await this.graph.updateTask(taskId, {
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          file_path: task.file_path,
        });

        // Update dependencies (remove old, add new)
        await this.graph.execute(
          `
          MATCH (t:Task {id: $id})-[d:DEPENDS_ON]->()
          DELETE d
        `,
          { id: taskId }
        );

        if (task.dependencies) {
          for (const dep of task.dependencies) {
            await this.graph.addDependency(taskId, dep.id);
          }
        }
      } else {
        // Create new
        await this.graph.createTask(task);

        // Add dependencies
        if (task.dependencies) {
          for (const dep of task.dependencies) {
            await this.graph.addDependency(taskId, dep.id);
          }
        }
      }

      log('info', `Synced task ${taskId} to graph`);

      return { task_id: taskId, synced: true };
    } catch (error) {
      log('error', `Failed to sync task ${taskId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clear all data from graph
   */
  async clearGraph() {
    try {
      // Delete all DEPENDS_ON relationships
      await this.graph.execute('MATCH (a:Task)-[r:DEPENDS_ON]->(b:Task) DELETE r');

      // Delete all parent-child relationships
      await this.graph.execute('MATCH (a:Task)-[r:PARENT_CHILD]->(b:Task) DELETE r');

      // Then delete all Task nodes
      await this.graph.execute('MATCH (n:Task) DELETE n');

      log('info', 'Cleared all graph data');
    } catch (error) {
      log('error', `Failed to clear graph: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clear sync cache (useful after major operations)
   */
  clearCache() {
    this.syncCache.clear();
    this.lastSyncTime = null;
    log('debug', 'Sync cache cleared');
  }

  /**
   * Repair broken dependencies
   */
  async repairDependencies() {
    try {
      const issues = [];

      // Find dependencies pointing to non-existent tasks
      const missingDeps = await this.graph.execute(`
        MATCH (t1:Task)-[d:DEPENDS_ON]->(t2:Task)
        WHERE t2 IS NULL
        RETURN t1.id as task_id, d as dependency
      `);

      // Remove broken dependencies
      for (const row of missingDeps) {
        issues.push({
          type: 'missing_dependency',
          task_id: row.task_id,
          action: 'removed',
        });

        await this.graph.execute(
          `
          MATCH (t:Task {id: $id})-[d:DEPENDS_ON]->()
          WHERE NOT EXISTS { MATCH (t)-[d]->(t2:Task) }
          DELETE d
        `,
          { id: row.task_id }
        );
      }

      // Find and fix circular dependencies
      const circles = await this.graph.detectCircularDependencies();

      for (const circle of circles) {
        issues.push({
          type: 'circular_dependency',
          task_id: circle.task_id,
          cycle: circle.cycle,
          action: 'breaking_cycle',
        });

        // Break the cycle by removing the last dependency
        const lastId = circle.cycle[circle.cycle.length - 1];
        const firstId = circle.cycle[0];

        await this.graph.execute(
          `
          MATCH (t1:Task {id: $lastId})-[d:DEPENDS_ON]->(t2:Task {id: $firstId})
          DELETE d
        `,
          { lastId, firstId }
        );
      }

      log('info', `Repaired ${issues.length} dependency issues`);

      return { issues_fixed: issues.length, details: issues };
    } catch (error) {
      log('error', `Failed to repair dependencies: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sync parent-child relationship for decomposed tasks
   */
  async syncParentChildRelationship(fileTask) {
    if (!fileTask.parent_id) return;

    try {
      // Check if relationship already exists
      const existing = await this.graph.execute(
        `
        MATCH (parent:Task {id: $parentId})-[r:PARENT_CHILD]->(child:Task {id: $childId})
        RETURN r
      `,
        { parentId: fileTask.parent_id, childId: fileTask.id }
      );

      if (existing.length === 0) {
        // Create the relationship
        await this.graph.createUnifiedParentChildRelationship(
          fileTask.parent_id,
          fileTask.id,
          'decomposition',
          {
            decomposition_type: 'automatic',
            created_at: new Date().toISOString(),
          }
        );

        log('debug', `Created parent-child relationship: ${fileTask.parent_id} -> ${fileTask.id}`);
      }
    } catch (error) {
      log('error', `Failed to sync parent-child relationship: ${error.message}`);
      throw error;
    }
  }

  /**
   * Record a change made by MCP operation
   */
  recordMcpChange(taskId, changeType = 'updated') {
    this.mcpChanges.add(taskId);
    log('debug', `Recorded MCP change: ${taskId} (${changeType})`);
  }

  /**
   * Sync a single task immediately after creation
   */
  async syncNewTask(task) {
    try {
      // Create in graph
      await this.graph.createTask(task);

      // Add dependencies
      if (task.dependencies && task.dependencies.length > 0) {
        for (const dep of task.dependencies) {
          // Handle both string and object dependencies
          const depId = typeof dep === 'string' ? dep : dep.id;
          await this.graph.addDependency(task.id, depId);
        }
      }

      // Record that we synced this
      this.recordMcpChange(task.id, 'created');

      log('debug', `Synced new task ${task.id} to graph`);
    } catch (error) {
      log('error', `Failed to sync new task ${task.id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sync task update immediately
   */
  async syncTaskUpdate(taskId, updates) {
    try {
      await this.graph.updateTask(taskId, updates);
      this.recordMcpChange(taskId, 'updated');

      log('debug', `Synced task update ${taskId} to graph`);
    } catch (error) {
      log('error', `Failed to sync task update ${taskId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Detect files that have been modified externally
   */
  async detectExternalChanges() {
    try {
      const changes = [];
      const now = Date.now();

      // Quick check: if we just scanned, skip
      if (now - this.lastFullScan < 5000) {
        return changes;
      }

      // Scan all task files
      const allTasks = await this.files.listAllTasks();

      for (const task of allTasks) {
        const filePath = task.file_path;
        const stats = await fs.stat(filePath);
        const lastKnownTime = this.fileTimestamps.get(filePath);

        // Check if file is new or modified
        if (!lastKnownTime || stats.mtimeMs > lastKnownTime) {
          // Only count as external change if we didn't just modify it
          if (!this.mcpChanges.has(task.id)) {
            changes.push({
              taskId: task.id,
              filePath: filePath,
              type: lastKnownTime ? 'modified' : 'created',
            });
          }

          // Update our timestamp record
          this.fileTimestamps.set(filePath, stats.mtimeMs);
        }
      }

      this.lastFullScan = now;
      return changes;
    } catch (error) {
      log('error', `Failed to detect external changes: ${error.message}`);
      return [];
    }
  }

  /**
   * Sync only changed files
   */
  async syncChangedFiles() {
    const changes = await this.detectExternalChanges();

    if (changes.length === 0) {
      log('debug', 'No external changes detected');
      return { changes: 0 };
    }

    log('info', `Syncing ${changes.length} external changes`);

    for (const change of changes) {
      try {
        const task = await this.files.readTaskFile(change.taskId);
        if (task) {
          await this.syncTaskToGraph(change.taskId);
        }
      } catch (error) {
        log('error', `Failed to sync changed file ${change.taskId}: ${error.message}`);
      }
    }

    // Clear MCP changes after successful sync
    this.mcpChanges.clear();

    return { changes: changes.length };
  }

  /**
   * Smart sync that handles both MCP and external changes
   */
  async smartSync(priority = 'medium') {
    try {
      // High priority always checks for changes
      if (priority === 'high') {
        return await this.syncChangedFiles();
      }

      // Medium priority checks if not recent
      if (priority === 'medium') {
        const timeSinceLastScan = Date.now() - this.lastFullScan;
        if (timeSinceLastScan > 30000) {
          // 30 seconds
          return await this.syncChangedFiles();
        }
      }

      // Low priority uses cache
      return { changes: 0, cached: true };
    } catch (error) {
      log('error', `Smart sync failed: ${error.message}`);
      return { changes: 0, error: error.message };
    }
  }
}

export default SyncEngine;
