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
      if (!await this.needsSync()) {
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
      dependencies: 0
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
      
      log('info', `Sync completed: ${changes.created} created, ${changes.updated} updated, ${changes.deleted} deleted`);
      
      return {
        status: 'synced',
        changes: changes.created + changes.updated + changes.deleted,
        details: changes
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
      file_path: fileTask.file_path
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
      file_path: fileTask.file_path
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
      const removed = await this.graph.execute(`
        MATCH (t:Task {id: $id})-[d:DEPENDS_ON]->()
        DELETE d
        RETURN count(d) as count
      `, { id: fileTask.id });
      
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
      await this.graph.execute(`
        MATCH (parent:Task {id: $parentId})-[:HAS_SUBTASK]->(child:Task)
        DELETE child
      `, { parentId: fileTask.id });
      return;
    }
    
    // Get current subtasks from graph
    const currentSubtasks = await this.graph.execute(`
      MATCH (parent:Task {id: $parentId})-[:HAS_SUBTASK]->(child:Task)
      RETURN child
      ORDER BY child.id
    `, { parentId: fileTask.id });
    
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
          file_path: fileTask.file_path
        });
        
        // Create HAS_SUBTASK relationship
        await this.graph.execute(`
          MATCH (parent:Task {id: $parentId}), (child:Task {id: $childId})
          CREATE (parent)-[:HAS_SUBTASK {position: $position, is_complete: $isComplete}]->(child)
        `, {
          parentId: fileTask.id,
          childId: subtaskId,
          position: i,
          isComplete: subtask.is_complete || false
        });
      } else {
        // Update existing subtask
        await this.graph.updateTask(subtaskId, {
          title: subtask.title,
          status: subtask.is_complete ? 'done' : 'pending'
        });
        
        // Update relationship
        await this.graph.execute(`
          MATCH (parent:Task {id: $parentId})-[r:HAS_SUBTASK]->(child:Task {id: $childId})
          SET r.is_complete = $isComplete
        `, {
          parentId: fileTask.id,
          childId: subtaskId,
          isComplete: subtask.is_complete || false
        });
      }
    }
    
    // Remove extra subtasks
    for (const row of currentSubtasks) {
      const subtaskId = row.child.id;
      const index = parseInt(subtaskId.split('-').pop()) - 1;
      if (index >= fileTask.subtasks.length) {
        await this.graph.execute(`
          MATCH (t:Task {id: $id})
          DELETE t
        `, { id: subtaskId });
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
          MATCH (parent:Task)-[:HAS_SUBTASK]->(t)
        }
        RETURN count(t) as count
      `);
      const graphCount = graphResult[0]?.count || 0;
      
      const inSync = fileCount === graphCount;
      
      return {
        in_sync: inSync,
        file_count: fileCount,
        graph_count: graphCount,
        difference: fileCount - graphCount
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
          file_path: task.file_path
        });
        
        // Update dependencies (remove old, add new)
        await this.graph.execute(`
          MATCH (t:Task {id: $id})-[d:DEPENDS_ON]->()
          DELETE d
        `, { id: taskId });
        
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
      
      // Delete all HAS_SUBTASK relationships
      await this.graph.execute('MATCH (a:Task)-[r:HAS_SUBTASK]->(b:Task) DELETE r');
      
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
          action: 'removed'
        });
        
        await this.graph.execute(`
          MATCH (t:Task {id: $id})-[d:DEPENDS_ON]->()
          WHERE NOT EXISTS { MATCH (t)-[d]->(t2:Task) }
          DELETE d
        `, { id: row.task_id });
      }
      
      // Find and fix circular dependencies
      const circles = await this.graph.detectCircularDependencies();
      
      for (const circle of circles) {
        issues.push({
          type: 'circular_dependency',
          task_id: circle.task_id,
          cycle: circle.cycle,
          action: 'breaking_cycle'
        });
        
        // Break the cycle by removing the last dependency
        const lastId = circle.cycle[circle.cycle.length - 1];
        const firstId = circle.cycle[0];
        
        await this.graph.execute(`
          MATCH (t1:Task {id: $lastId})-[d:DEPENDS_ON]->(t2:Task {id: $firstId})
          DELETE d
        `, { lastId, firstId });
      }
      
      log('info', `Repaired ${issues.length} dependency issues`);
      
      return { issues_fixed: issues.length, details: issues };
    } catch (error) {
      log('error', `Failed to repair dependencies: ${error.message}`);
      throw error;
    }
  }
}

export default SyncEngine;