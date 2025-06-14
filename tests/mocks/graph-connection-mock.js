export class GraphConnection {
  constructor(tasksDir) {
    this.tasksDir = tasksDir;
    this.db = null;
    this.conn = null;
    this.initialized = false;
    this.tasks = new Map();
    this.dependencies = new Map();
    this.parentChild = new Map(); // parent_id -> [child_ids]
    this.childParent = new Map(); // child_id -> parent_id
  }

  async initialize() {
    this.initialized = true;
    return true;
  }

  async close() {
    this.initialized = false;
  }

  async execute(query, _params = {}) {
    // Return empty array to match what sync engine expects
    return [];
  }

  async createTask(task) {
    const taskData = {
      id: task.id,
      title: task.title,
      description: task.description || '',
      status: task.status || 'pending',
      priority: task.priority || 'medium',
      estimated_hours: task.estimated_hours || 0,
      notes: JSON.stringify(task.notes || []),
      subtasks: JSON.stringify(task.subtasks || []),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: task.completed_at || null,
      parent_id: task.parent_id || null,
      has_children: false,
    };

    this.tasks.set(task.id, taskData);

    // Store dependencies (extract IDs if objects are passed)
    if (task.dependencies && task.dependencies.length > 0) {
      const depIds = task.dependencies.map(dep => {
        if (typeof dep === 'string') return dep;
        if (typeof dep === 'object' && dep.id) return dep.id;
        return dep;
      });
      this.dependencies.set(task.id, depIds);
    }

    // Store parent-child relationships
    if (task.parent_id) {
      this.childParent.set(task.id, task.parent_id);

      // Update parent's children list
      if (!this.parentChild.has(task.parent_id)) {
        this.parentChild.set(task.parent_id, []);
      }
      this.parentChild.get(task.parent_id).push(task.id);

      // Mark parent as having children
      const parent = this.tasks.get(task.parent_id);
      if (parent) {
        parent.has_children = true;
      }
    }

    return taskData;
  }

  async updateTask(taskId, updates) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    Object.assign(task, updates);
    task.updated_at = new Date().toISOString();

    return task;
  }

  async getTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    return {
      ...task,
      notes: JSON.parse(task.notes),
      subtasks: JSON.parse(task.subtasks),
    };
  }

  async getAllTasks() {
    return Array.from(this.tasks.values()).map(task => ({
      ...task,
      notes: JSON.parse(task.notes),
      subtasks: JSON.parse(task.subtasks),
    }));
  }

  async deleteTask(taskId) {
    this.tasks.delete(taskId);
    this.dependencies.delete(taskId);

    // Clean up parent-child relationships
    const parentId = this.childParent.get(taskId);
    if (parentId) {
      const siblings = this.parentChild.get(parentId) || [];
      const index = siblings.indexOf(taskId);
      if (index > -1) {
        siblings.splice(index, 1);
      }
      // Update parent's has_children flag if no children left
      if (siblings.length === 0) {
        const parent = this.tasks.get(parentId);
        if (parent) {
          parent.has_children = false;
        }
      }
    }

    // Clean up children
    const childIds = this.parentChild.get(taskId) || [];
    for (const childId of childIds) {
      this.childParent.delete(childId);
    }
    this.parentChild.delete(taskId);
    this.childParent.delete(taskId);
  }

  async getTaskDependencies(taskId) {
    const deps = this.dependencies.get(taskId) || [];
    const dependencyTasks = [];

    for (const dep of deps) {
      // Handle both string IDs and dependency objects
      const depId = typeof dep === 'string' ? dep : dep.id;
      const depTask = this.tasks.get(depId);
      if (depTask) {
        dependencyTasks.push({
          ...depTask,
          notes: JSON.parse(depTask.notes),
          subtasks: JSON.parse(depTask.subtasks),
        });
      }
    }

    return dependencyTasks;
  }

  // Alias for getTaskDependencies
  async getDependencies(taskId) {
    return this.getTaskDependencies(taskId);
  }

  async getTaskDependents(taskId) {
    const dependents = [];

    for (const [id, deps] of this.dependencies.entries()) {
      if (deps.includes(taskId)) {
        const task = this.tasks.get(id);
        if (task) {
          dependents.push({
            ...task,
            notes: JSON.parse(task.notes),
            subtasks: JSON.parse(task.subtasks),
          });
        }
      }
    }

    return dependents;
  }

  // Alias for getTaskDependents
  async getDependents(taskId) {
    return this.getTaskDependents(taskId);
  }

  async addDependency(taskId, dependencyId) {
    const deps = this.dependencies.get(taskId) || [];
    // Check if dependency already exists (could be string or object with id)
    const exists = deps.some(dep => {
      if (typeof dep === 'string') return dep === dependencyId;
      if (typeof dep === 'object' && dep.id) return dep.id === dependencyId;
      return false;
    });

    if (!exists) {
      deps.push(dependencyId);
      this.dependencies.set(taskId, deps);
    }
  }

  async removeDependency(taskId, dependencyId) {
    const deps = this.dependencies.get(taskId) || [];
    const index = deps.indexOf(dependencyId);
    if (index > -1) {
      deps.splice(index, 1);
      this.dependencies.set(taskId, deps);
    }
  }

  async hasCircularDependency(taskId, dependencyId) {
    // Simple check - would dependencyId depend on taskId?
    const visited = new Set();
    const checkDeps = id => {
      if (visited.has(id)) return false;
      visited.add(id);

      if (id === taskId) return true;

      const deps = this.dependencies.get(id) || [];
      for (const depId of deps) {
        if (checkDeps(depId)) return true;
      }

      return false;
    };

    return checkDeps(dependencyId);
  }

  async clearDatabase() {
    this.tasks.clear();
    this.dependencies.clear();
    this.parentChild.clear();
    this.childParent.clear();
  }

  async findNextTask() {
    const allTasks = Array.from(this.tasks.values());
    const pendingTasks = allTasks.filter(task => task.status === 'pending');
    const inProgressTasks = allTasks.filter(task => task.status === 'in-progress');

    // Helper to check if task has no incomplete dependencies
    const hasNoBlockingDeps = taskId => {
      const deps = this.dependencies.get(taskId) || [];
      for (const dep of deps) {
        // Handle both string IDs and dependency objects
        const depId = typeof dep === 'string' ? dep : dep.id;
        const depTask = this.tasks.get(depId);
        if (depTask && depTask.status !== 'done') {
          return false;
        }
      }
      return true;
    };

    // Helper to check if task is a leaf (no children)
    const isLeafTask = taskId => {
      return !this.parentChild.has(taskId) || this.parentChild.get(taskId).length === 0;
    };

    // 1. First check for actionable subtasks of in-progress parent tasks
    for (const parentTask of inProgressTasks) {
      const childIds = this.parentChild.get(parentTask.id) || [];
      for (const childId of childIds) {
        const childTask = this.tasks.get(childId);
        if (
          childTask &&
          childTask.status === 'pending' &&
          hasNoBlockingDeps(childId) &&
          isLeafTask(childId)
        ) {
          return {
            ...childTask,
            notes: JSON.parse(childTask.notes),
            subtasks: JSON.parse(childTask.subtasks),
          };
        }
      }
    }

    // 2. Check for actionable subtasks of decomposed pending parent tasks
    for (const parentTask of pendingTasks) {
      if (parentTask.has_children) {
        const childIds = this.parentChild.get(parentTask.id) || [];
        for (const childId of childIds) {
          const childTask = this.tasks.get(childId);
          if (
            childTask &&
            childTask.status === 'pending' &&
            hasNoBlockingDeps(childId) &&
            isLeafTask(childId)
          ) {
            return {
              ...childTask,
              notes: JSON.parse(childTask.notes),
              subtasks: JSON.parse(childTask.subtasks),
            };
          }
        }
      }
    }

    // 3. Find top-level tasks without children
    for (const task of pendingTasks) {
      if (
        !task.has_children &&
        !this.childParent.has(task.id) && // Not a subtask
        hasNoBlockingDeps(task.id)
      ) {
        return {
          ...task,
          notes: JSON.parse(task.notes),
          subtasks: JSON.parse(task.subtasks),
        };
      }
    }

    return null;
  }

  async detectCircularDependencies(taskId) {
    const circles = [];
    const visited = new Set();
    const stack = new Set();

    const hasCycle = (id, path = []) => {
      if (stack.has(id)) {
        // Found a cycle
        const cycleStart = path.indexOf(id);
        if (cycleStart !== -1) {
          circles.push({
            task_id: id,
            cycle: path.slice(cycleStart).concat(id),
          });
        }
        return true;
      }
      if (visited.has(id)) return false;

      visited.add(id);
      stack.add(id);
      path.push(id);

      const deps = this.dependencies.get(id) || [];
      for (const depId of deps) {
        if (hasCycle(depId, [...path])) {
          // Don't return true here, continue checking other paths
        }
      }

      stack.delete(id);
      path.pop();
      return false;
    };

    if (taskId) {
      hasCycle(taskId);
    } else {
      // Check all tasks
      for (const id of this.tasks.keys()) {
        if (!visited.has(id)) {
          hasCycle(id);
        }
      }
    }

    return circles;
  }

  async hasChildren(taskId) {
    const children = this.parentChild.get(taskId) || [];
    return children.length > 0;
  }

  async getChildren(taskId) {
    const childIds = this.parentChild.get(taskId) || [];
    const children = [];

    for (const childId of childIds) {
      const child = this.tasks.get(childId);
      if (child) {
        children.push({
          child: {
            ...child,
            notes: JSON.parse(child.notes),
            subtasks: JSON.parse(child.subtasks),
          },
          relationship_type: 'decomposition',
          decomposition_type: 'automatic',
          position: childIds.indexOf(childId),
          is_complete: false,
        });
      }
    }

    return children;
  }

  async getParent(taskId) {
    const parentId = this.childParent.get(taskId);
    if (!parentId) return null;

    const parent = this.tasks.get(parentId);
    if (!parent) return null;

    return {
      parent: {
        ...parent,
        notes: JSON.parse(parent.notes),
        subtasks: JSON.parse(parent.subtasks),
      },
      decomposed_at: parent.created_at,
      decomposition_type: 'automatic',
    };
  }

  async createUnifiedParentChildRelationship(parentId, childId, relationshipType, _metadata = {}) {
    // Store the relationship
    if (!this.parentChild.has(parentId)) {
      this.parentChild.set(parentId, []);
    }
    this.parentChild.get(parentId).push(childId);
    this.childParent.set(childId, parentId);

    // Mark parent as having children
    const parent = this.tasks.get(parentId);
    if (parent) {
      parent.has_children = true;
    }

    return true;
  }

  // Add missing method that SmartTaskSelector checks for
  isExecuteSupported() {
    return false; // Mock doesn't support complex execute queries
  }
}
