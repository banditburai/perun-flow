export class GraphConnection {
  constructor(tasksDir) {
    this.tasksDir = tasksDir;
    this.db = null;
    this.conn = null;
    this.initialized = false;
    this.tasks = new Map();
    this.dependencies = new Map();
  }

  async initialize() {
    this.initialized = true;
    return true;
  }

  async close() {
    this.initialized = false;
  }

  async execute(query, params = {}) {
    return { table: [] };
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
      completed_at: task.completed_at || null
    };
    
    this.tasks.set(task.id, taskData);
    
    // Store dependencies
    if (task.dependencies && task.dependencies.length > 0) {
      this.dependencies.set(task.id, task.dependencies);
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
      subtasks: JSON.parse(task.subtasks)
    };
  }

  async getAllTasks() {
    return Array.from(this.tasks.values()).map(task => ({
      ...task,
      notes: JSON.parse(task.notes),
      subtasks: JSON.parse(task.subtasks)
    }));
  }

  async deleteTask(taskId) {
    this.tasks.delete(taskId);
    this.dependencies.delete(taskId);
  }

  async getTaskDependencies(taskId) {
    const deps = this.dependencies.get(taskId) || [];
    const dependencyTasks = [];
    
    for (const depId of deps) {
      const depTask = this.tasks.get(depId);
      if (depTask) {
        dependencyTasks.push({
          ...depTask,
          notes: JSON.parse(depTask.notes),
          subtasks: JSON.parse(depTask.subtasks)
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
            subtasks: JSON.parse(task.subtasks)
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
    if (!deps.includes(dependencyId)) {
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
    const checkDeps = (id) => {
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
  }

  async findNextTask() {
    // Find tasks with no incomplete dependencies
    const allTasks = Array.from(this.tasks.values());
    const pendingTasks = allTasks.filter(task => task.status === 'pending');
    
    for (const task of pendingTasks) {
      const deps = this.dependencies.get(task.id) || [];
      let canWork = true;
      
      for (const depId of deps) {
        const depTask = this.tasks.get(depId);
        if (depTask && depTask.status !== 'done') {
          canWork = false;
          break;
        }
      }
      
      if (canWork) {
        return {
          ...task,
          notes: JSON.parse(task.notes),
          subtasks: JSON.parse(task.subtasks)
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
            cycle: path.slice(cycleStart).concat(id)
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
}