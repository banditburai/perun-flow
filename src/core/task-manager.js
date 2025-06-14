import crypto from 'crypto';
import { log } from '../utils/logger.js';
import { SyncEngine } from './sync-engine.js';
import { SimpleJournal } from './journal.js';
import { TaskDecompositionService } from './llm-service.js';
import { SmartTaskSelector } from './task-selector.js';

/**
 * Core task management logic combining file storage and graph operations
 */
export class TaskManager {
  constructor(fileStorage, graphConnection, options = {}) {
    this.files = fileStorage;
    this.graph = graphConnection;
    this.sync = new SyncEngine(fileStorage, graphConnection);
    this.journal = new SimpleJournal(fileStorage.tasksDir);
    this.decomposition = new TaskDecompositionService(options.decomposition);
    this.taskSelector = new SmartTaskSelector(graphConnection, options.taskSelection);
  }

  /**
   * Initialize both storage systems
   */
  async initialize() {
    await this.files.initialize();
    await this.graph.initialize();
    await this.journal.initialize();

    // Initial sync on startup
    const syncResult = await this.sync.ensureSynced();

    // Log the sync operation
    if (syncResult.changes > 0) {
      await this.journal.logSyncPerformed(syncResult);
    }

    log('info', 'Task Manager initialized');
  }

  /**
   * Generate a unique task ID from title
   */
  generateTaskId(title) {
    const timestamp = Date.now().toString(36);
    const hash = crypto.createHash('md5').update(title).digest('hex').substring(0, 6);

    return `${timestamp}-${hash}`;
  }

  /**
   * Detect stream from task title and description
   */
  detectStream(title, description = '') {
    const text = `${title} ${description}`.toLowerCase();

    // Check for specific keywords (order matters - more specific first)
    if (text.includes('test') || text.includes('spec') || text.includes('testing')) return 'TEST';
    if (text.includes('sync') || text.includes('synchron')) return 'SYNC';
    if (text.includes('deploy') || text.includes('release') || text.includes('publish'))
      return 'DEPLOY';
    if (text.includes('git') || text.includes('version control') || text.includes('commit'))
      return 'GIT';
    if (text.includes('doc') || text.includes('guide') || text.includes('readme')) return 'DOC';
    if (text.includes('api') || text.includes('endpoint') || text.includes('route')) return 'API';
    if (text.includes('auth') || text.includes('security') || text.includes('login')) return 'AUTH';
    if (text.includes('data') || text.includes('database') || text.includes('schema'))
      return 'DATA';
    if (text.includes('ui') || text.includes('interface') || text.includes('frontend')) return 'UI';

    return 'TASK'; // Generic fallback
  }

  /**
   * Calculate phase based on dependencies
   */
  async calculatePhase(dependencies) {
    if (!dependencies || dependencies.length === 0) {
      return 1; // Base phase for tasks with no dependencies
    }

    let maxPhase = 1; // Start with phase 1 as minimum
    let hasSemanticDeps = false;

    // Find the highest phase among dependencies
    for (const depId of dependencies) {
      try {
        const depTask = await this.files.readTaskFile(depId);
        if (depTask && depTask.semantic_id) {
          // Extract phase from semantic ID (e.g., "SYNC-2.01" -> 2)
          const match = depTask.semantic_id.match(/[A-Z]+-(\d+)\./);
          if (match) {
            const phase = parseInt(match[1]);
            maxPhase = Math.max(maxPhase, phase);
            hasSemanticDeps = true;
          }
        }
      } catch (error) {
        // Ignore errors for missing dependencies
      }
    }

    // If we found semantic dependencies, increment the phase
    // Otherwise, stay at phase 1
    return hasSemanticDeps ? maxPhase + 1 : 1;
  }

  /**
   * Get next sequence number for stream-phase combination
   */
  async getNextSequence(stream, phase) {
    const tasks = await this.files.listAllTasks();
    let maxSequence = 0;

    // Find highest sequence for this stream-phase
    for (const task of tasks) {
      if (task.semantic_id) {
        const match = task.semantic_id.match(new RegExp(`^${stream}-(\\d+)\\.(\\d+)$`));
        if (match && parseInt(match[1]) === phase) {
          const sequence = parseInt(match[2]);
          maxSequence = Math.max(maxSequence, sequence);
        }
      }
    }

    return String(maxSequence + 1).padStart(2, '0');
  }

  /**
   * Generate semantic ID for a task
   */
  async generateSemanticId(title, description, dependencies) {
    const stream = this.detectStream(title, description);
    const phase = await this.calculatePhase(dependencies);
    const sequence = await this.getNextSequence(stream, phase);

    return `${stream}-${phase}.${sequence}`;
  }

  /**
   * Create a new task
   */
  async createTask({ title, description, priority = 'medium', dependencies = [], parent_id }) {
    try {
      // Validate required fields
      if (title === undefined || title === null) {
        throw new Error('Title is required');
      }

      if (typeof title !== 'string' || title.trim() === '') {
        throw new Error('Title cannot be empty');
      }

      // Validate priority
      const validPriorities = ['high', 'medium', 'low'];
      if (!validPriorities.includes(priority)) {
        throw new Error(
          `Invalid priority: ${priority}. Must be one of: ${validPriorities.join(', ')}`
        );
      }

      // Validate dependencies is an array
      if (!Array.isArray(dependencies)) {
        throw new Error('Dependencies must be an array');
      }

      // Generate unique ID
      const id = this.generateTaskId(title);

      // Generate semantic ID
      const semantic_id = await this.generateSemanticId(title, description, dependencies);

      const task = {
        id,
        semantic_id,
        title,
        description,
        priority,
        status: 'pending',
        created_at: new Date().toISOString(),
        dependencies: dependencies.map(depId => ({ id: depId, status: 'unknown' })),
        subtasks: [],
        files: [],
        notes: [],
      };

      // Add parent_id if provided
      if (parent_id) {
        task.parent_id = parent_id;
      }

      // Create file first
      const filePath = await this.files.createTaskFile(task);
      task.file_path = filePath;

      // Immediate sync: create in graph right away
      await this.sync.syncNewTask(task);

      // Journal the creation
      await this.journal.logTaskCreated(task);

      log('info', `Created task: ${semantic_id} (${id}) - ${title}`);

      return { id, semantic_id, title, file_path: filePath };
    } catch (error) {
      log('error', `Failed to create task: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a task by ID
   */
  async getTask(taskId) {
    try {
      // Medium priority sync: single task lookup
      await this.sync.smartSync('medium');

      // Read from file (source of truth for content)
      const fileTask = await this.files.readTaskFile(taskId);
      if (!fileTask) {
        return null;
      }

      // Get dependencies from graph
      const dependencies = await this.graph.getDependencies(taskId);
      fileTask.dependencies = dependencies;

      return fileTask;
    } catch (error) {
      log('error', `Failed to get task ${taskId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update task status
   */
  async updateTaskStatus(taskId, newStatus) {
    try {
      // Validate status
      const validStatuses = ['pending', 'in-progress', 'done', 'archive'];
      if (!validStatuses.includes(newStatus)) {
        throw new Error(`Invalid status: ${newStatus}`);
      }

      // Get current status for journaling
      const currentTask = await this.files.readTaskFile(taskId);
      const oldStatus = currentTask?.status || 'unknown';

      // Update in file system (moves file)
      const newPath = await this.files.updateTaskStatus(taskId, newStatus);

      // Update in graph
      // Immediate sync: update graph right away
      await this.sync.syncTaskUpdate(taskId, {
        status: newStatus,
        file_path: newPath,
      });

      // Journal the status change
      await this.journal.logTaskStatusUpdated(taskId, oldStatus, newStatus);

      log('info', `Updated task ${taskId} status to ${newStatus}`);

      return { id: taskId, status: newStatus, file_path: newPath };
    } catch (error) {
      log('error', `Failed to update task status: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add a progress note to a task
   */
  async addNote(taskId, noteContent) {
    try {
      // Add to file
      await this.files.addNote(taskId, noteContent);

      // Immediate sync: update graph right away
      await this.sync.syncTaskUpdate(taskId, {
        updated_at: new Date().toISOString(),
      });

      // Journal the note addition
      await this.journal.logNoteAdded(taskId, noteContent);

      log('info', `Added note to task ${taskId}`);

      return { id: taskId, note_added: true };
    } catch (error) {
      log('error', `Failed to add note: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find the next actionable task
   */
  async findNextTask(context = {}) {
    try {
      // High priority sync: finding next task needs accurate data
      await this.sync.smartSync('high');

      // Use smart task selector if available, otherwise fallback to simple
      const nextTask = this.taskSelector
        ? await this.taskSelector.findNextTask(context)
        : await this.graph.findNextTask();

      if (!nextTask) {
        log('info', 'No actionable tasks found');
        return null;
      }

      // Get full task details from file
      const fullTask = await this.getTask(nextTask.id);

      return fullTask;
    } catch (error) {
      log('error', `Failed to find next task: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find next task with explanation of why it was selected
   */
  async findNextTaskWithReason(options = {}) {
    try {
      await this.sync.smartSync('high');

      const context = options.context || {};
      const task = await this.findNextTask(context);

      if (!task) {
        return { task: null, reason: 'No actionable tasks found' };
      }

      // Get selection reason if task selector is available
      const reason = this.taskSelector
        ? await this.taskSelector.getSelectionReason(task, context)
        : 'Selected by priority and creation time';

      // Get parent task info if this is a subtask
      let parentTask = null;
      if (task.parent_id) {
        parentTask = await this.getTask(task.parent_id);
      }

      return { task, reason, parentTask };
    } catch (error) {
      log('error', `Failed to find next task with reason: ${error.message}`);
      throw error;
    }
  }

  /**
   * List all tasks
   */
  async listTasks(filters = {}) {
    try {
      // Get all tasks from files
      const tasks = await this.files.listAllTasks();

      // Apply filters
      let filtered = tasks;

      if (filters.status) {
        filtered = filtered.filter(t => t.status === filters.status);
      }

      if (filters.priority) {
        filtered = filtered.filter(t => t.priority === filters.priority);
      }

      // Sort by priority and creation date
      const priorityOrder = { high: 1, medium: 2, low: 3 };
      filtered.sort((a, b) => {
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;

        return new Date(a.created_at) - new Date(b.created_at);
      });

      return filtered;
    } catch (error) {
      log('error', `Failed to list tasks: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check task dependencies
   */
  async checkDependencies(taskId) {
    try {
      // High priority sync: dependency checks are critical
      await this.sync.smartSync('high');

      // Get task dependencies
      const dependencies = await this.graph.getDependencies(taskId);

      // Check for circular dependencies
      const circles = await this.graph.detectCircularDependencies();
      const hasCircular = circles.some(c => c.task_id === taskId);

      // Check which dependencies are blocking
      const blocking = dependencies.filter(dep => dep.status !== 'done');

      return {
        task_id: taskId,
        dependencies: dependencies,
        blocking: blocking,
        has_circular: hasCircular,
        ready: blocking.length === 0,
      };
    } catch (error) {
      log('error', `Failed to check dependencies: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get tasks that depend on this task (bidirectional tracking)
   */
  async getDependents(taskId) {
    try {
      // Medium priority sync: dependency queries
      await this.sync.smartSync('medium');

      const dependents = await this.graph.getDependents(taskId);

      // Check impact - which dependents would be blocked
      const impacted = dependents.filter(
        dep => dep.status === 'pending' || dep.status === 'in-progress'
      );

      return {
        task_id: taskId,
        dependents: dependents,
        impacted: impacted,
        total_dependents: dependents.length,
        blocked_count: impacted.length,
      };
    } catch (error) {
      log('error', `Failed to get dependents: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get full dependency graph for a task (both directions)
   */
  async getFullDependencyGraph(taskId) {
    try {
      // High priority sync: full dependency graph needs complete data
      await this.sync.smartSync('high');

      const [dependencies, dependents] = await Promise.all([
        this.graph.getDependencies(taskId),
        this.graph.getDependents(taskId),
      ]);

      const task = await this.getTask(taskId);

      return {
        task: {
          id: task.id,
          title: task.title,
          status: task.status,
        },
        dependencies: dependencies,
        dependents: dependents,
        statistics: {
          total_dependencies: dependencies.length,
          completed_dependencies: dependencies.filter(d => d.status === 'done').length,
          total_dependents: dependents.length,
          blocked_dependents: dependents.filter(d => d.status !== 'done').length,
        },
      };
    } catch (error) {
      log('error', `Failed to get dependency graph: ${error.message}`);
      throw error;
    }
  }

  /**
   * Break down a task into subtasks
   */
  async breakdownTask(taskId, subtasks) {
    try {
      const task = await this.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      // Add subtasks to task
      task.subtasks = subtasks.map((title, index) => ({
        id: `${taskId}-${index + 1}`,
        title,
        is_complete: false,
      }));

      // Update file
      await this.files.createTaskFile(task);

      // Create subtask relationships in graph immediately
      for (const subtask of task.subtasks) {
        // Create subtask as a task node
        await this.graph.createTask({
          id: subtask.id,
          title: subtask.title,
          status: 'pending',
          priority: task.priority,
          file_path: task.file_path, // Same file as parent
        });

        // Create unified PARENT_CHILD relationship for subtask
        await this.graph.createUnifiedParentChildRelationship(taskId, subtask.id, 'subtask', {
          position: task.subtasks.indexOf(subtask),
          is_complete: false,
        });
      }

      // Record the change
      this.sync.recordMcpChange(taskId, 'updated');

      // Journal the subtask creation
      await this.journal.logSubtasksAdded(taskId, subtasks.length);

      log('info', `Broke down task ${taskId} into ${subtasks.length} subtasks`);

      return { task_id: taskId, subtasks: task.subtasks };
    } catch (error) {
      log('error', `Failed to breakdown task: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId) {
    try {
      // Get task info for journaling
      const task = await this.files.readTaskFile(taskId);
      const title = task?.title || 'Unknown';

      // Delete from file system
      await this.files.deleteTaskFile(taskId);

      // Delete from graph immediately (relationships are automatically deleted)
      await this.graph.execute(
        `
        MATCH (t:Task {id: $id})
        DELETE t
      `,
        { id: taskId }
      );

      // Record the deletion
      this.sync.recordMcpChange(taskId, 'deleted');

      // Journal the deletion
      await this.journal.logTaskDeleted(taskId, title);

      log('info', `Deleted task ${taskId}`);

      return { id: taskId, deleted: true };
    } catch (error) {
      log('error', `Failed to delete task: ${error.message}`);
      throw error;
    }
  }

  /**
   * Analyze task complexity and determine if it needs decomposition
   * @param {string} taskId - Task ID to analyze
   * @returns {Object} Analysis result with complexity score and recommendation
   */
  async analyzeTaskComplexity(taskId) {
    try {
      const task = await this.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      const analysis = this.decomposition.analyzeComplexity(task);

      // Update task in graph with complexity metadata
      await this.graph.execute(
        `
        MATCH (t:Task {id: $id})
        SET t.complexity_score = $score, t.is_atomic = $isAtomic
      `,
        {
          id: taskId,
          score: analysis.complexityScore,
          isAtomic: analysis.isAtomic,
        }
      );

      log('info', `Analyzed complexity for task ${taskId}: ${analysis.complexityScore}`);
      return analysis;
    } catch (error) {
      log('error', `Failed to analyze task complexity: ${error.message}`);
      throw error;
    }
  }

  /**
   * Decompose a complex task into subtasks
   * @param {string} taskId - Parent task ID to decompose
   * @param {Object} options - Decomposition options
   * @returns {Object} Decomposition result with created subtasks
   */
  async decomposeTask(taskId, options = {}) {
    try {
      // High priority sync: decomposition needs to know all existing tasks
      await this.sync.smartSync('high');

      const parentTask = await this.getTask(taskId);
      if (!parentTask) {
        throw new Error(`Task ${taskId} not found`);
      }

      // Check if already has children
      const hasChildren = await this.graph.hasChildren(taskId);
      if (hasChildren) {
        throw new Error(`Task ${taskId} already has subtasks`);
      }

      // Analyze complexity first
      const analysis = await this.analyzeTaskComplexity(taskId);
      if (!analysis.needsDecomposition && !options.force) {
        return {
          decomposed: false,
          reason: 'Task does not need decomposition',
          analysis,
          subtasks: [],
        };
      }

      // Generate subtasks
      const subtaskSpecs = this.decomposition.decomposeTask(parentTask, options);
      const createdSubtasks = [];

      // Create each subtask
      for (const spec of subtaskSpecs) {
        const subtask = await this.createTask({
          title: spec.title,
          description: spec.description,
          priority: spec.priority || parentTask.priority,
          dependencies: [], // Initially no dependencies between subtasks
          parent_id: taskId,
        });

        // Create unified parent-child relationship
        await this.graph.createUnifiedParentChildRelationship(taskId, subtask.id, 'decomposition', {
          decomposition_type: options.decompositionType || 'automatic',
        });

        createdSubtasks.push(subtask);
      }

      // Mark parent as having children
      await this.graph.execute(
        `
        MATCH (t:Task {id: $id})
        SET t.has_children = true
      `,
        { id: taskId }
      );

      // Journal the decomposition
      await this.journal.logOperation('task.decomposed', {
        parent_task_id: taskId,
        subtask_count: createdSubtasks.length,
        decomposition_type: options.decompositionType || 'automatic',
      });

      log('info', `Decomposed task ${taskId} into ${createdSubtasks.length} subtasks`);

      return {
        decomposed: true,
        parentTask,
        subtasks: createdSubtasks,
        analysis,
      };
    } catch (error) {
      log('error', `Failed to decompose task: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get task hierarchy (children) for a task
   * @param {string} taskId - Parent task ID
   * @returns {Array} Array of child tasks
   */
  async getTaskChildren(taskId) {
    try {
      // Medium priority sync: hierarchy queries
      await this.sync.smartSync('medium');

      const children = await this.graph.getChildren(taskId);
      return children.map(result => ({
        ...result.child,
        decomposed_at: result.decomposed_at,
        decomposition_type: result.decomposition_type,
        relationship_type: result.relationship_type,
        position: result.position,
        is_complete: result.is_complete,
      }));
    } catch (error) {
      log('error', `Failed to get task children: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get parent task for a subtask
   * @param {string} taskId - Child task ID
   * @returns {Object|null} Parent task or null if no parent
   */
  async getTaskParent(taskId) {
    try {
      // Medium priority sync: hierarchy queries
      await this.sync.smartSync('medium');

      const result = await this.graph.getParent(taskId);
      if (!result) return null;

      return {
        ...result.parent,
        decomposed_at: result.decomposed_at,
        decomposition_type: result.decomposition_type,
      };
    } catch (error) {
      log('error', `Failed to get task parent: ${error.message}`);
      throw error;
    }
  }

  /**
   * Close connections
   */
  async close() {
    await this.graph.close();
    log('info', 'Task Manager closed');
  }
}

export default TaskManager;
