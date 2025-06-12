# API Reference

## Core Classes

### TaskManager

The main interface for task operations.

```javascript
import { TaskManager } from './src/core/task-manager.js';
```

#### Methods

##### createTask(taskData)

Creates a new task with automatic stream detection and ID generation.

**Parameters:**

- `taskData` (Object)
  - `title` (String, required): Task title
  - `description` (String): Task description
  - `priority` (String): 'high', 'medium', or 'low' (default: 'medium')
  - `stream` (String): Override automatic stream detection
  - `dependencies` (Array<String>): Task IDs this task depends on

**Returns:** Task object with generated ID and file path

##### findNextTask()

Finds the next actionable task with no incomplete dependencies.

**Returns:** Task object or null if no tasks available

##### updateTaskStatus(taskId, newStatus)

Updates task status and moves file to appropriate directory.

**Parameters:**

- `taskId` (String): Task ID to update
- `newStatus` (String): 'pending', 'in-progress', 'done', or 'archive'

**Returns:** Updated task object

##### addNote(taskId, noteContent)

Adds a timestamped note to a task.

**Parameters:**

- `taskId` (String): Task ID
- `noteContent` (String): Note content

**Returns:** Updated task object

##### checkDependencies(taskId)

Checks task dependencies and detects circular dependencies.

**Parameters:**

- `taskId` (String): Task ID to check

**Returns:** Object with dependency information

```javascript
{
  task_id: String,
  dependencies: Array<Task>,
  blocking: Array<Task>,
  ready: Boolean,
  has_circular: Boolean
}
```

##### getDependents(taskId)

Gets all tasks that depend on the specified task.

**Parameters:**

- `taskId` (String): Task ID

**Returns:** Object with dependent information

```javascript
{
  task_id: String,
  dependents: Array<Task>,
  impacted: Array<Task>,
  total_dependents: Number,
  blocked_count: Number
}
```

##### getFullDependencyGraph(taskId)

Gets complete dependency graph including both directions.

**Parameters:**

- `taskId` (String): Task ID

**Returns:** Object with full graph

```javascript
{
  task: Task,
  dependencies: Array<Task>,
  dependents: Array<Task>,
  statistics: {
    total_dependencies: Number,
    completed_dependencies: Number,
    total_dependents: Number,
    blocked_dependents: Number
  }
}
```

### FileStorage

Handles markdown file operations for tasks.

```javascript
import { FileStorage } from './src/storage/file-storage.js';
```

#### Methods

##### initialize()

Initializes storage directories.

##### createTaskFile(task)

Creates a new task markdown file.

##### readTaskFile(taskId)

Reads and parses a task file.

##### updateTaskFile(taskId, updates)

Updates an existing task file.

##### updateTaskStatus(taskId, newStatus)

Moves task file to new status directory.

##### getAllTasks(status)

Gets all tasks, optionally filtered by status.

### GraphConnection

Manages KuzuDB graph database for dependencies.

```javascript
import { GraphConnection } from './src/storage/graph-connection.js';
```

#### Methods

##### initialize()

Initializes database connection and schema.

##### createTask(task)

Adds task node to graph.

##### updateTask(taskId, updates)

Updates task properties in graph.

##### addDependency(taskId, dependencyId)

Creates dependency relationship.

##### getDependencies(taskId)

Gets all dependencies for a task.

##### getDependents(taskId)

Gets all dependents for a task.

##### detectCircularDependencies()

Finds all circular dependency chains.

### SyncEngine

Synchronizes file storage with graph database.

```javascript
import { SyncEngine } from './src/core/sync-engine.js';
```

#### Methods

##### ensureSynced()

Ensures file and graph data are synchronized.

##### syncFilesToGraph()

Syncs all file changes to graph.

##### syncGraphToFiles()

Syncs graph changes back to files.

### Journal

Tracks all operations for audit and recovery.

```javascript
import { Journal } from './src/core/journal.js';
```

#### Methods

##### log(operation, details)

Logs an operation with timestamp.

##### query(filters)

Queries journal entries with filters.

##### exportToFile(outputPath)

Exports journal to JSON file.

## Error Handling

All methods throw errors with descriptive messages:

```javascript
try {
  await taskManager.createTask({ title: '' });
} catch (error) {
  console.error(error.message); // "Task title is required"
}
```

Common error types:

- `ValidationError`: Invalid input parameters
- `NotFoundError`: Task or resource not found
- `CircularDependencyError`: Circular dependency detected
- `FileSystemError`: File operation failed
- `DatabaseError`: Graph database operation failed

## Events

The system doesn't use events currently, but operations are logged to the journal for tracking.
