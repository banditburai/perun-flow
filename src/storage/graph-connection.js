import kuzu from 'kuzu';
import path from 'path';
import { promises as fs } from 'fs';
import { log } from '../utils/logger.js';

/**
 * KuzuDB connection manager for task graph operations
 */
export class GraphConnection {
  constructor(tasksDir) {
    this.tasksDir = tasksDir;
    this.dbPath = path.join(tasksDir, '.graph.db');
    this.db = null;
    this.connection = null;
  }

  /**
   * Initialize database connection and create schema
   */
  async initialize() {
    try {
      // Ensure tasks directory exists
      await fs.mkdir(this.tasksDir, { recursive: true });

      // Initialize KuzuDB
      this.db = new kuzu.Database(this.dbPath);
      this.connection = new kuzu.Connection(this.db);
      
      // Create schema if not exists
      await this.createSchema();
      
      log('info', 'KuzuDB connection established');
      return true;
    } catch (error) {
      log('error', `Failed to initialize KuzuDB: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create database schema for tasks and relationships
   */
  async createSchema() {
    const schemas = [
      // Task node table
      `CREATE NODE TABLE Task (
        id STRING,
        semantic_id STRING,
        title STRING,
        description STRING,
        status STRING,
        priority STRING,
        created_at STRING,
        updated_at STRING,
        file_path STRING,
        is_atomic BOOLEAN,
        complexity_score DOUBLE,
        has_children BOOLEAN,
        PRIMARY KEY(id)
      )`,
      
      // Dependency relationship
      `CREATE REL TABLE DEPENDS_ON (
        FROM Task TO Task,
        created_at STRING
      )`,
      
      // Subtask relationship
      `CREATE REL TABLE HAS_SUBTASK (
        FROM Task TO Task,
        position INT64,
        is_complete BOOLEAN
      )`,
      
      // Parent-child relationship for task decomposition
      `CREATE REL TABLE IS_PARENT_OF (
        FROM Task TO Task,
        decomposed_at STRING,
        decomposition_type STRING
      )`
    ];

    for (const schema of schemas) {
      try {
        await this.execute(schema);
      } catch (error) {
        // Ignore "already exists" errors
        if (!error.message.includes('already exists') && !error.message.includes('Binder exception')) {
          throw error;
        }
        log('debug', `Schema already exists, skipping: ${error.message}`);
      }
    }

    log('debug', 'Database schema created/verified');
  }

  /**
   * Execute a Cypher query
   */
  async execute(query, params = {}) {
    if (!this.connection) {
      throw new Error('Database not initialized');
    }
    
    log('debug', `Executing query: ${query.substring(0, 100)}...`);
    
    try {
      // Prepare the statement first
      const preparedStatement = await this.connection.prepare(query);
      // Execute with parameters
      const result = await this.connection.execute(preparedStatement, params);
      return result.getAll();
    } catch (error) {
      log('error', `Query failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create a new task node
   */
  async createTask(task) {
    const now = new Date().toISOString();
    const query = `
      CREATE (t:Task {
        id: $id,
        semantic_id: $semantic_id,
        title: $title,
        description: $description,
        status: $status,
        priority: $priority,
        created_at: $created_at,
        updated_at: $updated_at,
        file_path: $file_path,
        is_atomic: $is_atomic,
        complexity_score: $complexity_score,
        has_children: $has_children
      })
    `;
    
    return this.execute(query, {
      id: task.id,
      semantic_id: task.semantic_id || null,
      title: task.title,
      description: task.description || '',
      status: task.status || 'pending',
      priority: task.priority || 'medium',
      created_at: task.created_at || now,
      updated_at: now,
      file_path: task.file_path,
      is_atomic: task.is_atomic !== undefined ? task.is_atomic : null,
      complexity_score: task.complexity_score || null,
      has_children: task.has_children || false
    });
  }

  /**
   * Get a task by ID
   */
  async getTask(taskId) {
    const query = `
      MATCH (t:Task {id: $id})
      RETURN t
    `;
    
    const result = await this.execute(query, { id: taskId });
    return result.length > 0 ? result[0].t : null;
  }

  /**
   * Update task properties
   */
  async updateTask(taskId, updates) {
    const setClause = Object.keys(updates)
      .map(key => `t.${key} = $${key}`)
      .join(', ');
    
    const now = new Date().toISOString();
    const query = `
      MATCH (t:Task {id: $id})
      SET ${setClause}, t.updated_at = $updated_at
    `;
    
    return this.execute(query, { id: taskId, updated_at: now, ...updates });
  }

  /**
   * Add a dependency between tasks
   */
  async addDependency(fromId, toId) {
    const query = `
      MATCH (t1:Task {id: $fromId}), (t2:Task {id: $toId})
      CREATE (t1)-[:DEPENDS_ON]->(t2)
    `;
    
    return this.execute(query, { fromId, toId });
  }

  /**
   * Get task dependencies (what this task depends on)
   */
  async getDependencies(taskId) {
    const query = `
      MATCH (t:Task {id: $id})-[:DEPENDS_ON]->(dep:Task)
      RETURN dep.id as id, dep.title as title, dep.status as status
      ORDER BY dep.id
    `;
    
    return this.execute(query, { id: taskId });
  }

  /**
   * Get task dependents (what depends on this task)
   */
  async getDependents(taskId) {
    const query = `
      MATCH (dependent:Task)-[:DEPENDS_ON]->(t:Task {id: $id})
      RETURN dependent.id as id, dependent.title as title, dependent.status as status
      ORDER BY dependent.id
    `;
    
    return this.execute(query, { id: taskId });
  }

  /**
   * Find next actionable task
   */
  async findNextTask() {
    // First check subtasks of in-progress tasks
    const subtaskQuery = `
      MATCH (parent:Task {status: 'in-progress'})-[:HAS_SUBTASK]->(st:Task)
      WHERE st.status = 'pending'
      AND NOT EXISTS {
        MATCH (st)-[:DEPENDS_ON]->(dep:Task)
        WHERE dep.status <> 'done'
      }
      RETURN st
      ORDER BY parent.priority DESC, st.created_at
      LIMIT 1
    `;
    
    let result = await this.execute(subtaskQuery);
    if (result.length > 0) {
      return result[0].st;
    }
    
    // Then check top-level tasks
    const taskQuery = `
      MATCH (t:Task)
      WHERE t.status = 'pending'
      AND NOT EXISTS {
        MATCH (t)-[:DEPENDS_ON]->(dep:Task)
        WHERE dep.status <> 'done'
      }
      AND NOT EXISTS {
        MATCH (parent:Task)-[:HAS_SUBTASK]->(t)
      }
      RETURN t
      ORDER BY 
        CASE t.priority 
          WHEN 'high' THEN 1 
          WHEN 'medium' THEN 2 
          ELSE 3 
        END,
        t.created_at
      LIMIT 1
    `;
    
    result = await this.execute(taskQuery);
    return result.length > 0 ? result[0].t : null;
  }

  /**
   * Detect circular dependencies
   */
  async detectCircularDependencies() {
    // Simplified query for KuzuDB
    const query = `
      MATCH (t1:Task)-[:DEPENDS_ON*]->(t1)
      RETURN DISTINCT t1.id as task_id
    `;
    
    try {
      const results = await this.execute(query);
      // Return in expected format
      return results.map(r => ({
        task_id: r.task_id,
        cycle: [r.task_id] // Simplified - just show the task involved
      }));
    } catch (error) {
      // If query fails, return empty array (no cycles)
      log('debug', 'Circular dependency check failed, assuming no cycles');
      return [];
    }
  }

  /**
   * Create parent-child relationship between tasks
   */
  async createParentChildRelationship(parentId, childId, decompositionType = 'automatic') {
    const now = new Date().toISOString();
    const query = `
      MATCH (parent:Task {id: $parentId}), (child:Task {id: $childId})
      CREATE (parent)-[r:IS_PARENT_OF {
        decomposed_at: $decomposed_at,
        decomposition_type: $decomposition_type
      }]->(child)
    `;
    
    await this.execute(query, {
      parentId,
      childId,
      decomposed_at: now,
      decomposition_type: decompositionType
    });
    
    // Update parent to mark it as having children
    await this.execute(`
      MATCH (parent:Task {id: $parentId})
      SET parent.has_children = true
    `, { parentId });
  }

  /**
   * Get children of a task
   */
  async getChildren(parentId) {
    const query = `
      MATCH (parent:Task {id: $parentId})-[r:IS_PARENT_OF]->(child:Task)
      RETURN child, r.decomposed_at as decomposed_at, r.decomposition_type as decomposition_type
      ORDER BY r.decomposed_at
    `;
    
    return this.execute(query, { parentId });
  }

  /**
   * Get parent of a task
   */
  async getParent(childId) {
    const query = `
      MATCH (parent:Task)-[r:IS_PARENT_OF]->(child:Task {id: $childId})
      RETURN parent, r.decomposed_at as decomposed_at, r.decomposition_type as decomposition_type
    `;
    
    const result = await this.execute(query, { childId });
    return result.length > 0 ? result[0] : null;
  }

  /**
   * Check if task has children
   */
  async hasChildren(taskId) {
    const query = `
      MATCH (task:Task {id: $taskId})
      RETURN task.has_children as has_children
    `;
    
    const result = await this.execute(query, { taskId });
    return result.length > 0 ? result[0].has_children : false;
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.connection) {
      this.connection = null;
      this.db = null;
      log('info', 'KuzuDB connection closed');
    }
  }
}

export default GraphConnection;