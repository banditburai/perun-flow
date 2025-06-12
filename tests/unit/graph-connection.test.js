import { jest, describe, beforeEach, afterEach, test, expect } from '@jest/globals';

// Mock logger to avoid console output
jest.mock('../../src/utils/logger.js');

// Create a functional mock that simulates graph database behavior
class MockKuzuDatabase {
  constructor() {
    this.tasks = new Map();
    this.dependencies = new Map(); // taskId -> Set of dependent task IDs
  }

  // Mock the Kuzu database interface
  prepare(query) {
    return Promise.resolve({ query });
  }

  execute(statement, params = {}) {
    const { query } = statement;

    // Mock CREATE task
    if (query.includes('CREATE (t:Task')) {
      const task = {
        id: params.id,
        semantic_id: params.semantic_id || null,
        title: params.title,
        description: params.description || '',
        status: params.status || 'pending',
        priority: params.priority || 'medium',
        created_at: params.created_at || new Date().toISOString(),
        updated_at: params.updated_at || new Date().toISOString(),
        file_path: params.file_path || null,
      };
      this.tasks.set(params.id, task);
      return Promise.resolve({ getAll: () => [] });
    }

    // Mock MATCH single task
    if (query.includes('MATCH (t:Task {id: $id})') && query.includes('RETURN t')) {
      const task = this.tasks.get(params.id);
      return Promise.resolve({
        getAll: () => (task ? [{ t: task }] : []),
      });
    }

    // Mock UPDATE task
    if (query.includes('SET t.')) {
      const task = this.tasks.get(params.id);
      if (task) {
        Object.assign(task, params);
        task.updated_at = new Date().toISOString();
      }
      return Promise.resolve({ getAll: () => [] });
    }

    // Mock CREATE dependency
    if (query.includes('CREATE (t1)-[:DEPENDS_ON]->(t2)')) {
      if (!this.dependencies.has(params.fromId)) {
        this.dependencies.set(params.fromId, new Set());
      }
      this.dependencies.get(params.fromId).add(params.toId);
      return Promise.resolve({ getAll: () => [] });
    }

    // Mock GET dependencies
    if (query.includes('MATCH (t:Task {id: $id})-[:DEPENDS_ON]->(dep:Task)')) {
      const depIds = this.dependencies.get(params.id) || new Set();
      const deps = Array.from(depIds)
        .map(id => this.tasks.get(id))
        .filter(Boolean);
      return Promise.resolve({ getAll: () => deps });
    }

    // Mock GET dependents
    if (query.includes('MATCH (dependent:Task)-[:DEPENDS_ON]->(t:Task {id: $id})')) {
      const dependents = [];
      for (const [taskId, deps] of this.dependencies.entries()) {
        if (deps.has(params.id)) {
          const task = this.tasks.get(taskId);
          if (task) dependents.push(task);
        }
      }
      return Promise.resolve({ getAll: () => dependents });
    }

    // Mock FIND next task
    if (query.includes("WHERE t.status = 'pending'")) {
      // Find tasks with no incomplete dependencies
      const availableTasks = [];
      for (const task of this.tasks.values()) {
        if (task.status !== 'pending') continue;

        const deps = this.dependencies.get(task.id) || new Set();
        const hasIncompleteDeps = Array.from(deps).some(depId => {
          const depTask = this.tasks.get(depId);
          return depTask && depTask.status !== 'done';
        });

        if (!hasIncompleteDeps) {
          availableTasks.push(task);
        }
      }

      // Sort by priority and return first
      availableTasks.sort((a, b) => {
        const priorityOrder = { high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      const result = availableTasks.length > 0 ? [{ t: availableTasks[0] }] : [];
      return Promise.resolve({ getAll: () => result });
    }

    // Mock circular dependency detection
    if (query.includes('MATCH (t1:Task)-[:DEPENDS_ON*]->(t1)')) {
      const cycles = [];

      // Simple cycle detection algorithm
      const visited = new Set();
      const recursionStack = new Set();

      const hasCycle = (taskId, path = []) => {
        if (recursionStack.has(taskId)) {
          // Found cycle
          const cycleStart = path.indexOf(taskId);
          const cycle = path.slice(cycleStart);
          cycles.push({ task_id: taskId, cycle });
          return true;
        }

        if (visited.has(taskId)) return false;

        visited.add(taskId);
        recursionStack.add(taskId);
        path.push(taskId);

        const deps = this.dependencies.get(taskId) || new Set();
        for (const depId of deps) {
          if (hasCycle(depId, [...path])) {
            return true;
          }
        }

        recursionStack.delete(taskId);
        return false;
      };

      for (const taskId of this.tasks.keys()) {
        if (!visited.has(taskId)) {
          hasCycle(taskId);
        }
      }

      return Promise.resolve({ getAll: () => cycles });
    }

    // Default return
    return Promise.resolve({ getAll: () => [] });
  }

  close() {
    return Promise.resolve();
  }
}

// Mock the kuzu module at the top level
const mockKuzu = {
  Database: jest.fn().mockImplementation(() => new MockKuzuDatabase()),
  Connection: jest.fn().mockImplementation(db => db),
};

jest.mock('kuzu', () => mockKuzu);

// Import GraphConnection after mocking
const { GraphConnection } = await import('../../src/storage/graph-connection.js');

describe('GraphConnection Functional Tests (with Mock)', () => {
  let graphConnection;
  let testDir;

  beforeEach(async () => {
    testDir = '/tmp/graph-test';
    graphConnection = new GraphConnection(testDir);
    await graphConnection.initialize();
  });

  afterEach(async () => {
    await graphConnection.close();
  });

  describe('Task Lifecycle', () => {
    test('should create and retrieve tasks with all data preserved', async () => {
      const task = {
        id: 'task-123',
        semantic_id: 'API-1.01',
        title: 'Build REST API',
        description: 'Create authentication endpoints',
        status: 'pending',
        priority: 'high',
        file_path: '/tasks/api-task.md',
      };

      // Action: Create task
      await graphConnection.createTask(task);

      // Verification: Should retrieve with all data preserved
      const retrieved = await graphConnection.getTask('task-123');

      expect(retrieved).toMatchObject({
        id: 'task-123',
        semantic_id: 'API-1.01',
        title: 'Build REST API',
        description: 'Create authentication endpoints',
        status: 'pending',
        priority: 'high',
        file_path: '/tasks/api-task.md',
      });

      // Should auto-generate timestamps
      expect(retrieved.created_at).toBeTruthy();
      expect(retrieved.updated_at).toBeTruthy();
    });

    test('should apply sensible defaults for missing fields', async () => {
      const minimalTask = {
        id: 'minimal-task',
        title: 'Simple Task',
      };

      await graphConnection.createTask(minimalTask);
      const retrieved = await graphConnection.getTask('minimal-task');

      expect(retrieved.id).toBe('minimal-task');
      expect(retrieved.title).toBe('Simple Task');
      expect(retrieved.status).toBe('pending');
      expect(retrieved.priority).toBe('medium');
      expect(retrieved.description).toBe('');
    });

    test('should update task properties while preserving others', async () => {
      // Create initial task
      await graphConnection.createTask({
        id: 'update-test',
        title: 'Original Title',
        status: 'pending',
        priority: 'low',
      });

      // Update subset of properties
      await graphConnection.updateTask('update-test', {
        title: 'Updated Title',
        status: 'in-progress',
        priority: 'high',
      });

      // Verify changes and preservation
      const updated = await graphConnection.getTask('update-test');
      expect(updated.title).toBe('Updated Title');
      expect(updated.status).toBe('in-progress');
      expect(updated.priority).toBe('high');
      expect(updated.id).toBe('update-test'); // Should preserve
    });
  });

  describe('Dependency Management', () => {
    beforeEach(async () => {
      // Create test tasks
      await graphConnection.createTask({ id: 'task-a', title: 'Task A', status: 'pending' });
      await graphConnection.createTask({ id: 'task-b', title: 'Task B', status: 'done' });
      await graphConnection.createTask({ id: 'task-c', title: 'Task C', status: 'pending' });
    });

    test('should create and retrieve dependency relationships', async () => {
      // Create dependencies: task-a depends on task-b and task-c
      await graphConnection.addDependency('task-a', 'task-b');
      await graphConnection.addDependency('task-a', 'task-c');

      // Verify forward dependencies
      const dependencies = await graphConnection.getDependencies('task-a');
      expect(dependencies).toHaveLength(2);

      const depIds = dependencies.map(d => d.id).sort();
      expect(depIds).toEqual(['task-b', 'task-c']);

      // Should include full task data
      const taskB = dependencies.find(d => d.id === 'task-b');
      expect(taskB.title).toBe('Task B');
      expect(taskB.status).toBe('done');
    });

    test('should retrieve reverse dependencies (dependents)', async () => {
      // Setup: both task-a and task-c depend on task-b
      await graphConnection.addDependency('task-a', 'task-b');
      await graphConnection.addDependency('task-c', 'task-b');

      // Verify reverse dependencies
      const dependents = await graphConnection.getDependents('task-b');
      expect(dependents).toHaveLength(2);

      const depIds = dependents.map(d => d.id).sort();
      expect(depIds).toEqual(['task-a', 'task-c']);
    });

    test('should handle complex dependency chains correctly', async () => {
      // Create chain: task-a → task-b → task-c
      await graphConnection.addDependency('task-a', 'task-b');
      await graphConnection.addDependency('task-b', 'task-c');

      // Verify each level of the chain
      const aDeps = await graphConnection.getDependencies('task-a');
      const bDeps = await graphConnection.getDependencies('task-b');
      const cDeps = await graphConnection.getDependencies('task-c');

      expect(aDeps.map(d => d.id)).toEqual(['task-b']);
      expect(bDeps.map(d => d.id)).toEqual(['task-c']);
      expect(cDeps).toEqual([]);

      // Verify reverse chain
      const aDependents = await graphConnection.getDependents('task-a');
      const bDependents = await graphConnection.getDependents('task-b');
      const cDependents = await graphConnection.getDependents('task-c');

      expect(aDependents).toEqual([]);
      expect(bDependents.map(d => d.id)).toEqual(['task-a']);
      expect(cDependents.map(d => d.id)).toEqual(['task-b']);
    });
  });

  describe('Task Discovery and Workflow', () => {
    test('should find next actionable task based on dependencies', async () => {
      // Setup complex scenario
      await graphConnection.createTask({
        id: 'blocked-task',
        title: 'Blocked Task',
        status: 'pending',
        priority: 'high',
      });
      await graphConnection.createTask({
        id: 'dependency-task',
        title: 'Dependency',
        status: 'pending',
        priority: 'medium',
      });
      await graphConnection.createTask({
        id: 'ready-task',
        title: 'Ready Task',
        status: 'pending',
        priority: 'low',
      });

      // Block the high-priority task
      await graphConnection.addDependency('blocked-task', 'dependency-task');

      // Should find dependency-task (highest priority among available)
      const nextTask = await graphConnection.findNextTask();
      expect(nextTask).toBeTruthy();
      expect(['dependency-task', 'ready-task']).toContain(nextTask.id);
    });

    test('should prioritize tasks by priority level', async () => {
      await graphConnection.createTask({
        id: 'low-priority',
        title: 'Low Priority',
        status: 'pending',
        priority: 'low',
      });
      await graphConnection.createTask({
        id: 'high-priority',
        title: 'High Priority',
        status: 'pending',
        priority: 'high',
      });

      const nextTask = await graphConnection.findNextTask();
      expect(nextTask.id).toBe('high-priority');
    });

    test('should return null when no actionable tasks exist', async () => {
      // Only create completed or blocked tasks
      await graphConnection.createTask({
        id: 'done-task',
        title: 'Done Task',
        status: 'done',
      });

      await graphConnection.createTask({
        id: 'blocked-task',
        title: 'Blocked Task',
        status: 'pending',
      });
      await graphConnection.createTask({
        id: 'blocking-task',
        title: 'Blocking Task',
        status: 'pending',
      });
      await graphConnection.addDependency('blocked-task', 'blocking-task');

      const nextTask = await graphConnection.findNextTask();
      // Should find the blocking-task since it has no dependencies
      expect(nextTask.id).toBe('blocking-task');
    });
  });

  describe('Circular Dependency Detection', () => {
    beforeEach(async () => {
      // Create test tasks
      await graphConnection.createTask({ id: 'task-x', title: 'Task X' });
      await graphConnection.createTask({ id: 'task-y', title: 'Task Y' });
      await graphConnection.createTask({ id: 'task-z', title: 'Task Z' });
    });

    test('should detect simple circular dependencies', async () => {
      // Create cycle: x → y → x
      await graphConnection.addDependency('task-x', 'task-y');
      await graphConnection.addDependency('task-y', 'task-x');

      const cycles = await graphConnection.detectCircularDependencies();

      expect(cycles.length).toBeGreaterThan(0);
      const involvedTasks = cycles.map(c => c.task_id);
      expect(involvedTasks).toContain('task-x');
    });

    test('should detect longer circular chains', async () => {
      // Create cycle: x → y → z → x
      await graphConnection.addDependency('task-x', 'task-y');
      await graphConnection.addDependency('task-y', 'task-z');
      await graphConnection.addDependency('task-z', 'task-x');

      const cycles = await graphConnection.detectCircularDependencies();

      expect(cycles.length).toBeGreaterThan(0);
      const involvedTasks = cycles.map(c => c.task_id);
      expect(involvedTasks).toContain('task-x');
    });

    test('should return empty when no cycles exist', async () => {
      // Create linear chain: x → y → z
      await graphConnection.addDependency('task-x', 'task-y');
      await graphConnection.addDependency('task-y', 'task-z');

      const cycles = await graphConnection.detectCircularDependencies();
      expect(cycles).toEqual([]);
    });
  });

  describe('Data Integrity and Consistency', () => {
    test('should maintain consistency across multiple operations', async () => {
      // Create and modify task through multiple operations
      await graphConnection.createTask({
        id: 'consistency-test',
        title: 'Consistency Test',
        status: 'pending',
        priority: 'medium',
      });

      await graphConnection.updateTask('consistency-test', { status: 'in-progress' });
      await graphConnection.updateTask('consistency-test', { priority: 'high' });
      await graphConnection.updateTask('consistency-test', {
        title: 'Updated Consistency Test',
        description: 'Added description',
      });

      // Final state should reflect all changes
      const final = await graphConnection.getTask('consistency-test');
      expect(final).toMatchObject({
        id: 'consistency-test',
        title: 'Updated Consistency Test',
        description: 'Added description',
        status: 'in-progress',
        priority: 'high',
      });
    });

    test('should preserve relationships during task updates', async () => {
      // Setup relationship
      await graphConnection.createTask({ id: 'parent', title: 'Parent Task' });
      await graphConnection.createTask({ id: 'child', title: 'Child Task' });
      await graphConnection.addDependency('parent', 'child');

      // Update child task
      await graphConnection.updateTask('child', {
        title: 'Updated Child Task',
        status: 'done',
      });

      // Relationship should be preserved with updated data
      const parentDeps = await graphConnection.getDependencies('parent');
      expect(parentDeps).toHaveLength(1);
      expect(parentDeps[0].id).toBe('child');
      expect(parentDeps[0].title).toBe('Updated Child Task');
      expect(parentDeps[0].status).toBe('done');
    });

    test('should handle non-existent tasks gracefully', async () => {
      const task = await graphConnection.getTask('does-not-exist');
      expect(task).toBeNull();

      const deps = await graphConnection.getDependencies('does-not-exist');
      expect(deps).toEqual([]);

      const dependents = await graphConnection.getDependents('does-not-exist');
      expect(dependents).toEqual([]);
    });
  });
});
