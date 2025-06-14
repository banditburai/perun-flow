# Smart Task Selection Reference

## Quick Start

The smart task selection system automatically finds the most appropriate next task, navigating to actionable subtasks when parent tasks have been decomposed.

### Basic Usage

```bash
# Find next task (automatically skips decomposed parents)
mcp__tasks__next

# Find next task with explanation
mcp__tasks__next_smart --explain true

# Use specific strategy
mcp__tasks__next_smart --strategy depth-first
```

## Selection Strategies

### Smart (Default)

Balanced approach that considers multiple factors:

- Prioritizes subtasks of in-progress work
- Navigates to deepest actionable tasks in decomposed hierarchies
- Respects task priorities
- Falls back gracefully when no ideal match exists

### Depth-First

Always selects the deepest actionable task:

- Ideal for focused, uninterrupted work
- Completes entire branches before moving to siblings
- Maximum depth configurable (default: 3)

### Breadth-First

Completes current level before going deeper:

- Good for finishing related tasks together
- Prioritizes siblings of in-progress work
- Useful for systematic completion

### Simple

Original selection behavior:

- Used automatically for mock/test environments
- No hierarchy traversal
- Backward compatible

## Configuration

### Task Manager Options

```javascript
const taskManager = new TaskManager(fileStorage, graphConnection, {
  taskSelection: {
    strategy: 'smart', // default strategy
    preferSubtasks: true, // navigate to subtasks
    maxDepth: 3, // max hierarchy depth
    skipDecomposed: true, // skip parents with children
    respectPriority: true, // consider task priority
  },
});
```

### Runtime Selection

```javascript
// Override default strategy
const nextTask = await taskManager.findNextTask('breadth-first');

// With context
const result = await taskManager.findNextTaskWithReason({
  strategy: 'depth-first',
  context: {
    currentTaskId: 'current-task',
    recentTaskIds: ['task-1', 'task-2'],
  },
});
```

## Selection Priority

The system selects tasks in this order:

1. **Subtasks of in-progress parents**: Continue work already started
2. **Subtasks of decomposed pending parents**: Navigate into decomposed hierarchies
3. **Top-level tasks without children**: Simple, actionable tasks
4. **Any pending task**: Fallback when no ideal match

### Additional Filters

All strategies respect:

- Task dependencies (blocked tasks are skipped)
- Task status (only pending tasks selected)
- Leaf nodes (tasks without children preferred)
- Priority ordering (high > medium > low)

## Examples

### Decomposition Workflow

```bash
# 1. Create complex task
mcp__tasks__create --title "Build Authentication System"

# 2. Decompose it
mcp__tasks__decompose mbcd123-456789

# 3. Get next task - automatically selects first subtask!
mcp__tasks__next
# Returns: "Setup Database Schema" (subtask) instead of parent

# 4. Complete subtask and get next
mcp__tasks__complete mbcd123-456789-sub1
mcp__tasks__next
# Returns: "Create User Model" (next subtask)
```

### Working with Hierarchies

```
Root Task (pending, decomposed)
├── Backend API (pending)
│   ├── Setup Routes (pending) ← Selected
│   └── Add Validation (pending)
└── Frontend UI (pending)
    ├── Login Form (pending)
    └── Dashboard (pending)
```

The system automatically navigates to "Setup Routes" as the first actionable leaf task.

## Understanding Selection Reasons

When using `findNextTaskWithReason()` or `--explain`, you get detailed explanations:

```javascript
{
  task: { id: 'task-123', title: 'Setup Routes' },
  reason: 'First actionable subtask of decomposed task: Backend API',
  parentTask: { id: 'parent-456', title: 'Backend API' }
}
```

Common reasons:

- "Subtask of in-progress parent: [parent title]"
- "First actionable subtask of decomposed task: [parent title]"
- "High priority independent task"
- "Selected by priority and creation time"

## Troubleshooting

### No Tasks Found

If no tasks are returned:

1. Check for blocked dependencies: `mcp__tasks__deps [task-id]`
2. Verify pending tasks exist: `mcp__tasks__list --status pending`
3. Ensure decomposed tasks have subtasks: `mcp__tasks__hierarchy [task-id]`

### Wrong Task Selected

If unexpected task is selected:

1. Check task priorities are set correctly
2. Verify parent-child relationships: `mcp__tasks__hierarchy [task-id]`
3. Try explicit strategy: `mcp__tasks__next_smart --strategy breadth-first`

### Performance Issues

For large task hierarchies:

1. Limit traversal depth in configuration
2. Use simple strategy for faster selection
3. Check database indexes are created

## API Reference

### TaskManager Methods

```javascript
// Find next task with default strategy
findNextTask(strategy?: string, options?: object): Promise<Task>

// Find next task with detailed reason
findNextTaskWithReason(options?: {
  strategy?: string,
  context?: object
}): Promise<{
  task: Task,
  reason: string,
  parentTask?: Task
}>
```

### SmartTaskSelector Methods

```javascript
// Main selection method
findNextTask(context?: object): Promise<Task>

// Get explanation for selection
getSelectionReason(task: Task, context?: object): Promise<string>

// Strategy-specific methods
findNextSimple(): Promise<Task>
findNextSmart(context: object): Promise<Task>
findNextDepthFirst(): Promise<Task>
findNextBreadthFirst(): Promise<Task>
```

### MCP Tools

```yaml
mcp__tasks__next:
  description: Find next actionable task (basic)

mcp__tasks__next_smart:
  description: Find next task with advanced options
  parameters:
    strategy:
      type: string
      enum: [simple, smart, depth-first, breadth-first]
    explain:
      type: boolean
      default: true
    context_task_id:
      type: string
      description: Current task for context-aware selection
```
