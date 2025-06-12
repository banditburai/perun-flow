# MCP Tools Guide

## Available Tools

### mcp__tasks__create
Create a new development task.

**Parameters:**
- `title` (required): Task title
- `description`: Task description  
- `priority`: Task priority (high|medium|low), default: medium
- `dependencies`: Array of task IDs this task depends on

**Example:**
```json
{
  "title": "Build authentication module",
  "description": "Implement JWT-based authentication",
  "priority": "high",
  "dependencies": ["API-1.01"]
}
```

### mcp__tasks__list
List all tasks with optional filtering.

**Parameters:**
- `status`: Filter by status (pending|in-progress|done|archive)
- `priority`: Filter by priority (high|medium|low)

### mcp__tasks__next
Find the next actionable task with no incomplete dependencies.

**Parameters:** None

### mcp__tasks__status
Update the status of a task.

**Parameters:**
- `task_id` (required): Task ID to update
- `status` (required): New status (pending|in-progress|done|archive)

### mcp__tasks__note
Add a progress note to a task.

**Parameters:**
- `task_id` (required): Task ID to add note to
- `note` (required): Note content to add

### mcp__tasks__deps
Check task dependencies and detect circular dependencies.

**Parameters:**
- `task_id` (required): Task ID to check dependencies for

### mcp__tasks__dependents
Get tasks that depend on a given task (reverse dependencies).

**Parameters:**
- `task_id` (required): Task ID to check dependents for

### mcp__tasks__graph
Get full dependency graph for a task (both dependencies and dependents).

**Parameters:**
- `task_id` (required): Task ID to get dependency graph for

## Git Integration Tools

These tools require `ENABLE_GIT=true` environment variable.

### mcp__tasks__start
Start working on a task (creates Git branch, initial commit).

**Parameters:**
- `task_id` (required): Task ID to start

### mcp__tasks__commit
Commit current progress on task.

**Parameters:**
- `task_id` (required): Task ID
- `message` (required): Commit message
- `description`: Optional detailed description

### mcp__tasks__complete
Complete a task (final commit and status update).

**Parameters:**
- `task_id` (required): Task ID to complete
- `message`: Final commit message

### mcp__tasks__rollback
Rollback task code changes.

**Parameters:**
- `task_id` (required): Task ID
- `to_commit`: Commit hash to rollback to (optional)

### mcp__tasks__history
Show commit history for a task.

**Parameters:**
- `task_id` (required): Task ID

### mcp__tasks__merge
Merge completed task branch to main.

**Parameters:**
- `task_id` (required): Task ID to merge
- `delete_branch`: Delete branch after merge (default: true)

## Error Handling

All tools return structured responses:

**Success:**
```json
{
  "content": [{
    "type": "text",
    "text": "Success message with details"
  }]
}
```

**Error:**
```json
{
  "error": {
    "code": "INVALID_PARAMS",
    "message": "Detailed error message"
  }
}
```

## Usage in Claude Desktop

Once configured, you can use these tools naturally in conversation:

- "Create a new task to build the user authentication API"
- "What's the next task I should work on?"
- "Mark API-1.01 as done"
- "Add a note to UI-2.01 about the color scheme decision"
- "Show me what depends on the database migration task"