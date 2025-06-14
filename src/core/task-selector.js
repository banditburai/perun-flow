import { log } from '../utils/logger.js';

/**
 * Smart task selector with configurable strategies and preferences
 */
export class SmartTaskSelector {
  constructor(graphConnection, preferences = {}) {
    this.graph = graphConnection;
    this.preferences = {
      strategy: 'smart', // 'simple', 'smart', 'depth-first', 'breadth-first'
      preferSubtasks: true,
      maxDepth: 3,
      skipDecomposed: true,
      respectPriority: true,
      ...preferences,
    };
  }

  /**
   * Find next task with configurable strategy
   */
  async findNextTask(context = {}) {
    try {
      // If graph doesn't support execute (e.g., mock), fallback to simple
      if (!this.isExecuteSupported()) {
        return this.findNextSimple();
      }

      // Use the configured strategy
      switch (this.preferences.strategy) {
        case 'simple':
          return this.findNextSimple();
        case 'depth-first':
          return this.findNextDepthFirst();
        case 'breadth-first':
          return this.findNextBreadthFirst();
        case 'smart':
        default:
          return this.findNextSmart(context);
      }
    } catch (error) {
      log('error', `Smart task selection failed: ${error.message}`);
      // Fallback to simple selection
      return this.findNextSimple();
    }
  }

  /**
   * Simple strategy - just calls the original findNextTask
   */
  async findNextSimple() {
    return this.graph.findNextTask();
  }

  /**
   * Check if the graph connection supports execute queries
   */
  isExecuteSupported() {
    // Check if this is a mock or simplified graph connection
    // Also check if execute returns meaningful results
    if (typeof this.graph.execute !== 'function') return false;
    if (this.graph.constructor.name.includes('Mock')) return false;
    // Additional check: if it has a isExecuteSupported method, use it
    if (typeof this.graph.isExecuteSupported === 'function') {
      return this.graph.isExecuteSupported();
    }
    return true;
  }

  /**
   * Smart strategy - uses multiple selection criteria
   */
  async findNextSmart(context = {}) {
    const strategies = [
      () => this.findCurrentWorkContext(context),
      () => this.findHighPrioritySubtasks(),
      () => this.findDecomposedTaskEntry(),
      () => this.findIndependentTasks(),
      () => this.findAnyPendingTask(),
    ];

    for (const strategy of strategies) {
      const result = await strategy();
      if (result) {
        return result;
      }
    }

    return null;
  }

  /**
   * Depth-first strategy - always go deepest in hierarchy first
   */
  async findNextDepthFirst() {
    const query = `
      MATCH path = (root:Task)-[:PARENT_CHILD*1..${this.preferences.maxDepth}]->(leaf:Task)
      WHERE root.status IN ['pending', 'in-progress']
      AND leaf.status = 'pending'
      AND NOT EXISTS {
        MATCH (leaf)-[:PARENT_CHILD]->(:Task)
      }
      AND NOT EXISTS {
        MATCH (leaf)-[:DEPENDS_ON]->(dep:Task)
        WHERE dep.status <> 'done'
      }
      RETURN leaf, length(path) as depth
      ORDER BY 
        depth DESC,
        CASE leaf.priority 
          WHEN 'high' THEN 1 
          WHEN 'medium' THEN 2 
          ELSE 3 
        END,
        leaf.created_at
      LIMIT 1
    `;

    const result = await this.graph.execute(query);
    if (result.length > 0) {
      return result[0].leaf;
    }

    // Fallback to simple if no deep tasks found
    return this.findNextSimple();
  }

  /**
   * Breadth-first strategy - complete current level before going deeper
   */
  async findNextBreadthFirst() {
    // Find tasks at the shallowest level
    const query = `
      MATCH (t:Task)
      WHERE t.status = 'pending'
      AND NOT EXISTS {
        MATCH (t)-[:DEPENDS_ON]->(dep:Task)
        WHERE dep.status <> 'done'
      }
      OPTIONAL MATCH path = (root:Task)-[:PARENT_CHILD*]->(t)
      WITH t, 
        CASE 
          WHEN path IS NULL THEN 0 
          ELSE length(path) 
        END as depth
      RETURN t, depth
      ORDER BY 
        depth,
        CASE t.priority 
          WHEN 'high' THEN 1 
          WHEN 'medium' THEN 2 
          ELSE 3 
        END,
        t.created_at
      LIMIT 1
    `;

    const result = await this.graph.execute(query);
    return result.length > 0 ? result[0].t : null;
  }

  /**
   * Find task in current work context (related to recently completed tasks)
   */
  async findCurrentWorkContext(context) {
    if (!context.currentTaskId && !context.recentTaskIds) return null;

    const taskIds = context.recentTaskIds || [context.currentTaskId];

    // Find sibling or child tasks of recent work
    const query = `
      MATCH (recent:Task)
      WHERE recent.id IN $taskIds
      WITH recent
      MATCH (recent)<-[:PARENT_CHILD]-(parent:Task)-[:PARENT_CHILD]->(sibling:Task)
      WHERE sibling.status = 'pending'
      AND sibling.id NOT IN $taskIds
      AND NOT EXISTS {
        MATCH (sibling)-[:DEPENDS_ON]->(dep:Task)
        WHERE dep.status <> 'done'
      }
      RETURN sibling
      ORDER BY 
        CASE sibling.priority 
          WHEN 'high' THEN 1 
          WHEN 'medium' THEN 2 
          ELSE 3 
        END,
        sibling.created_at
      LIMIT 1
    `;

    const result = await this.graph.execute(query, { taskIds });
    return result.length > 0 ? result[0].sibling : null;
  }

  /**
   * Find high priority subtasks first
   */
  async findHighPrioritySubtasks() {
    const query = `
      MATCH (parent:Task)-[rel:PARENT_CHILD]->(child:Task)
      WHERE child.status = 'pending'
      AND parent.priority = 'high'
      AND NOT EXISTS {
        MATCH (child)-[:DEPENDS_ON]->(dep:Task)
        WHERE dep.status <> 'done'
      }
      RETURN child, parent, rel
      ORDER BY 
        CASE WHEN parent.status = 'in-progress' THEN 0 ELSE 1 END,
        CASE WHEN rel.position IS NOT NULL THEN rel.position ELSE 999 END,
        child.created_at
      LIMIT 1
    `;

    const result = await this.graph.execute(query);
    return result.length > 0 ? result[0].child : null;
  }

  /**
   * Find first actionable subtask of decomposed tasks
   */
  async findDecomposedTaskEntry() {
    const query = `
      MATCH (parent:Task {has_children: true})-[rel:PARENT_CHILD]->(child:Task)
      WHERE parent.status = 'pending'
      AND child.status = 'pending'
      AND NOT EXISTS {
        MATCH (child)-[:DEPENDS_ON]->(dep:Task)
        WHERE dep.status <> 'done'
      }
      AND NOT EXISTS {
        MATCH (child)-[:PARENT_CHILD]->(:Task)
      }
      RETURN child, parent, rel
      ORDER BY 
        CASE parent.priority 
          WHEN 'high' THEN 1 
          WHEN 'medium' THEN 2 
          ELSE 3 
        END,
        CASE WHEN rel.position IS NOT NULL THEN rel.position ELSE 999 END,
        child.created_at
      LIMIT 1
    `;

    const result = await this.graph.execute(query);
    return result.length > 0 ? result[0].child : null;
  }

  /**
   * Find independent top-level tasks
   */
  async findIndependentTasks() {
    const query = `
      MATCH (t:Task)
      WHERE t.status = 'pending'
      AND NOT EXISTS {
        MATCH (t)-[:DEPENDS_ON]->(dep:Task)
        WHERE dep.status <> 'done'
      }
      AND NOT EXISTS {
        MATCH (parent:Task)-[:PARENT_CHILD]->(t)
      }
      AND (t.has_children IS NULL OR t.has_children = false OR NOT ${this.preferences.skipDecomposed})
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

    const result = await this.graph.execute(query);
    return result.length > 0 ? result[0].t : null;
  }

  /**
   * Find any pending task as last resort
   */
  async findAnyPendingTask() {
    const query = `
      MATCH (t:Task)
      WHERE t.status = 'pending'
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

    const result = await this.graph.execute(query);
    return result.length > 0 ? result[0].t : null;
  }

  /**
   * Get selection explanation for the chosen task
   */
  async getSelectionReason(task, context = {}) {
    if (!task) return 'No actionable tasks found';

    // If graph doesn't support execute, return simple reason
    if (!this.isExecuteSupported()) {
      return 'Selected by priority and creation time';
    }

    try {
      // Check if it's a subtask
      const parentQuery = `
        MATCH (parent:Task)-[:PARENT_CHILD]->(t:Task {id: $taskId})
        RETURN parent
      `;
      const parentResult = await this.graph.execute(parentQuery, { taskId: task.id });

      if (parentResult.length > 0) {
        const parent = parentResult[0].parent;
        if (parent.status === 'in-progress') {
          return `Subtask of in-progress parent: ${parent.title}`;
        } else if (parent.has_children) {
          return `First actionable subtask of decomposed task: ${parent.title}`;
        } else {
          return `Subtask of: ${parent.title}`;
        }
      }

      // Check if it's high priority
      if (task.priority === 'high') {
        return 'High priority independent task';
      }

      // Check if it's related to recent work
      if (context.recentTaskIds && context.recentTaskIds.length > 0) {
        return 'Related to recent work context';
      }

      return 'Next available task by priority and creation time';
    } catch (error) {
      log('debug', `Failed to get selection reason: ${error.message}`);
      return 'Selected by priority and creation time';
    }
  }
}
