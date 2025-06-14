# Smart Task Selection Architecture

## Overview

This document describes the architecture and implementation of the smart task selection system in perun-flow, which automatically navigates to actionable subtasks after decomposition.

## Problem Statement

The original issue was that `mcp__tasks__next` would return decomposed parent tasks instead of their actionable subtasks, forcing users to manually navigate the hierarchy. This created friction in the workflow.

## Solution Architecture

### Core Components

```
┌─────────────────────────────────────────┐
│           SmartTaskSelector             │
├─────────────────────────────────────────┤
│ - Detects mock vs real graph connection │
│ - Falls back to simple mode for mocks   │
│ - Implements smart selection strategies │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│          GraphConnection                │
├─────────────────────────────────────────┤
│ - Enhanced findNextTask()               │
│ - Prioritizes subtasks of decomposed   │
│   pending parents                       │
│ - Handles parent-child relationships    │
└─────────────────────────────────────────┘
```

## Implementation Details

### 1. Enhanced Graph Queries

The core improvement is in the `findNextTask` query logic:

```javascript
// Priority 1: Subtasks of in-progress parents
const inProgressSubtaskQuery = `
  MATCH (parent:Task {status: 'in-progress'})-[rel:PARENT_CHILD]->(st:Task)
  WHERE st.status = 'pending'
  AND NOT EXISTS {
    MATCH (st)-[:DEPENDS_ON]->(dep:Task)
    WHERE dep.status <> 'done'
  }
  AND NOT EXISTS {
    MATCH (st)-[:PARENT_CHILD]->(:Task)
  }
  RETURN st, parent, rel
  ORDER BY parent.priority DESC, st.created_at
  LIMIT 1
`;

// Priority 2: Actionable subtasks of decomposed pending parents
const decomposedSubtaskQuery = `
  MATCH (parent:Task {status: 'pending'})-[rel:PARENT_CHILD]->(st:Task)
  WHERE st.status = 'pending'
  AND parent.has_children = true
  AND NOT EXISTS {
    MATCH (st)-[:DEPENDS_ON]->(dep:Task)
    WHERE dep.status <> 'done'
  }
  AND NOT EXISTS {
    MATCH (st)-[:PARENT_CHILD]->(:Task)
  }
  RETURN st, parent
  ORDER BY parent.priority DESC, st.created_at
  LIMIT 1
`;

// Priority 3: Top-level tasks without children
const topLevelQuery = `
  MATCH (t:Task {status: 'pending'})
  WHERE NOT EXISTS { MATCH ()-[:PARENT_CHILD]->(t) }
  AND NOT EXISTS {
    MATCH (t)-[:DEPENDS_ON]->(dep:Task)
    WHERE dep.status <> 'done'
  }
  AND (NOT t.has_children OR t.has_children = false)
  RETURN t
  ORDER BY t.priority DESC, t.created_at
  LIMIT 1
`;
```

### 2. Smart Task Selector

The `SmartTaskSelector` class provides intelligent task selection with multiple strategies:

```javascript
class SmartTaskSelector {
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

  async findNextTask(context = {}) {
    // Detect mock and fallback to simple mode
    if (!this.isExecuteSupported()) {
      return this.findNextSimple();
    }

    // Use configured strategy
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
  }
}
```

### 3. Selection Reasoning

The system provides clear explanations for why tasks were selected:

```javascript
async getSelectionReason(task, context = {}) {
  // Check if it's a subtask
  const parentResult = await this.graph.execute(parentQuery, { taskId: task.id });

  if (parentResult.length > 0) {
    const parent = parentResult[0].parent;
    if (parent.status === 'in-progress') {
      return `Subtask of in-progress parent: ${parent.title}`;
    } else if (parent.has_children) {
      return `First actionable subtask of decomposed task: ${parent.title}`;
    }
  }

  // Other selection reasons...
  return 'Selected by priority and creation time';
}
```

## Key Features

### 1. Automatic Subtask Navigation

- Decomposed tasks automatically redirect to their first actionable subtask
- No manual navigation required after decomposition

### 2. Multiple Selection Strategies

- **Smart**: Balanced approach considering multiple factors
- **Depth-First**: Prefers deepest actionable tasks
- **Breadth-First**: Completes current level before diving deeper
- **Simple**: Original behavior for backward compatibility

### 3. Context Awareness

- Considers current work context when selecting tasks
- Provides explanations for selections
- Shows parent task information when relevant

### 4. Mock Compatibility

- Automatically detects mock graph connections
- Falls back to simple selection for testing
- Maintains full test coverage

## Usage Examples

### Basic Usage

```javascript
// Find next task with default strategy
const nextTask = await taskManager.findNextTask();

// Find next task with specific strategy
const nextTask = await taskManager.findNextTask('depth-first');
```

### With Context

```javascript
const nextTask = await taskManager.findNextTaskWithReason({
  strategy: 'smart',
  context: {
    currentTaskId: 'current-task-id',
    timeAvailable: 'medium'
  }
});

// Returns:
{
  task: { /* task details */ },
  reason: 'First actionable subtask of decomposed task: Build Feature',
  parentTask: { /* parent details */ }
}
```

### MCP Tool Usage

```bash
# Basic next task
mcp__tasks__next

# With strategy selection
mcp__tasks__next_smart --strategy depth-first --explain true
```

## Testing Approach

### Unit Tests

- Test each selection strategy independently
- Verify correct prioritization of subtasks
- Ensure decomposed parents are skipped

### Integration Tests

- Full workflow from decomposition to subtask selection
- Mock compatibility verification
- Performance testing with deep hierarchies

### E2E Tests

- MCP compliance testing
- Real-world decomposition scenarios
- User workflow validation

## Performance Considerations

1. **Query Optimization**: Indexes on status, parent relationships
2. **Limited Depth**: Max traversal depth to prevent deep recursion
3. **Early Returns**: Stop searching once suitable task found
4. **Mock Detection**: Fast fallback for test environments

## Future Enhancements

1. **User Preferences**: Persistent strategy preferences
2. **Time-Based Selection**: Consider available time when selecting
3. **Stream Continuity**: Prefer tasks in same work stream
4. **Learning**: Track selection success for improvements
