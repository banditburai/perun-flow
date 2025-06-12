# Perun Flow

**Intelligent task management for AI-assisted development workflows**

Perun Flow brings structure and intelligence to development task management through semantic organization, graph-based dependency tracking, and seamless AI integration via the Model Context Protocol.

## Why Perun Flow?

### 🧠 **Semantic Intelligence**
- **Smart Stream Detection**: Automatically categorizes tasks (API, UI, TEST, DATA) based on content
- **Phase-Based Progression**: Organizes tasks by dependency depth for logical workflow
- **Meaningful IDs**: Human-readable identifiers like `API-2.01` and `UI-3.02` instead of random UUIDs

### 🕸️ **Advanced Dependency Management**
- **Bidirectional Tracking**: See both what a task depends on and what depends on it
- **Circular Detection**: Automatically identifies and prevents dependency loops
- **Impact Analysis**: Understand how changes cascade through your project
- **Blocking Detection**: Know exactly what's preventing a task from starting

### 🔄 **Dual Storage Architecture**
- **Human-Readable Files**: Tasks stored as markdown files you can edit, search, and version control
- **Graph Database**: KuzuDB provides lightning-fast dependency queries and relationship traversal
- **Sync-on-Demand**: Intelligent synchronization only when needed, keeping both systems consistent

### 🤖 **AI-Native Design**
- **MCP Protocol**: Native integration with Claude Code and other AI tools
- **14 Specialized Tools**: From task creation to dependency analysis to Git integration
- **Operation Journaling**: Complete audit trail of all task operations for AI context
- **Branch-per-Task**: Optional Git integration with automatic commit tracking

## Architecture Highlights

### Intelligent Task Organization
```
API-1.01 → Build Authentication        (Phase 1: Foundation)
API-1.02 → Add User Endpoints         (Phase 1: Foundation)  
UI-2.01  → Create Login Component     (Phase 2: Depends on API-1.01)
UI-2.02  → Build Dashboard           (Phase 2: Depends on API-1.02)
TEST-3.01 → Integration Tests        (Phase 3: Depends on UI-2.01, UI-2.02)
```

### Sophisticated Dependency Resolution
- **Next Task Detection**: Automatically finds the next actionable task with no blocking dependencies
- **Dependency Graphs**: Visual representation of task relationships and impact analysis
- **Smart Blocking**: Tasks remain blocked until ALL dependencies are complete

### Enterprise-Grade Reliability
- **170+ Tests**: Comprehensive test suite covering unit, integration, and end-to-end scenarios
- **Graceful Degradation**: System works even if graph database is unavailable
- **Error Recovery**: Robust handling of file system and database edge cases
- **Performance Optimized**: Lazy initialization and efficient caching strategies

## Quick Start

### For AI Development (Recommended)

Add to your Claude Code configuration:

```json
{
  "mcpServers": {
    "perun-flow": {
      "command": "node",
      "args": ["/path/to/perun-flow/src/mcp/server.js"],
      "env": {
        "TASKS_DIR": "/path/to/your/tasks",
        "ENABLE_GIT": "true",
        "CODE_DIR": "/path/to/your/project"
      }
    }
  }
}
```

Then use natural language with Claude:
- "Create a high-priority API task for user authentication"
- "What's the next task I should work on?"
- "Show me what depends on the login component task"
- "Start working on task API-1.01 and create a Git branch"

### For Programmatic Use

```javascript
import { TaskManager } from './src/core/task-manager.js';

const taskManager = new TaskManager(fileStorage, graphConnection, syncEngine);
await taskManager.initialize();

// Create intelligent task with auto-categorization
const task = await taskManager.createTask({
  title: 'Build user authentication API',
  description: 'JWT-based auth with refresh tokens',
  priority: 'high',
  dependencies: ['DATA-1.01'] // Database schema task
});

// Get next actionable task (no blocking dependencies)
const nextTask = await taskManager.findNextTask();

// Analyze impact of changes
const dependents = await taskManager.getDependents(task.id);
```

## Key Features

| Feature | Description |
|---------|-------------|
| 🎯 **Semantic IDs** | `API-1.01`, `UI-2.03` - meaningful, hierarchical task identifiers |
| 📊 **Dependency Graphs** | Bidirectional relationship tracking with cycle detection |
| 🔄 **File + Graph Storage** | Human-readable markdown + high-performance graph queries |
| 🤖 **MCP Integration** | 14 specialized tools for AI-assisted development |
| 🌳 **Git Integration** | Branch-per-task workflow with commit tracking |
| 📓 **Operation Journal** | Complete audit trail of all task operations |
| ⚡ **Smart Sync** | Efficient file-to-graph synchronization |
| 🔍 **Impact Analysis** | Understand task relationships and blocking chains |

## MCP Tools Available

### Core Task Management
- `create` - Create new development tasks with smart categorization
- `list` - List and filter tasks by status, priority, or stream
- `status` - Update task status with automatic file organization
- `next` - Find the next actionable task (no blocking dependencies)
- `note` - Add timestamped progress notes

### Dependency Intelligence
- `deps` - Analyze task dependencies and blocking status
- `dependents` - See what tasks would be impacted by changes
- `graph` - Full bidirectional dependency visualization

### Git Integration (Optional)
- `start` - Begin task work (creates branch + initial commit)
- `commit` - Commit progress with task context
- `complete` - Finalize task with completion metadata
- `rollback` - Undo changes and return to previous state
- `history` - View commit timeline for task
- `merge` - Integrate completed work back to main branch

## Testing

Comprehensive test suite with 170+ tests:

```bash
npm test                 # Full test suite
npm run test:unit        # Unit tests (133 tests)
npm run test:integration # Integration tests (28 tests)  
npm run test:e2e         # End-to-end MCP tests (22 tests)
npm run test:coverage    # With coverage reporting
```

## Documentation

- [Architecture Overview](docs/architecture.md) - System design and data flow
- [MCP Tools Reference](docs/mcp-tools.md) - Complete tool documentation
- [Task Structure](docs/task-structure.md) - Markdown format and metadata
- [API Reference](docs/api-reference.md) - Programmatic usage
- [Configuration Guide](docs/configuration.md) - Setup and environment options
- [Testing Guide](docs/testing.md) - Test patterns and best practices

## Requirements

- **Node.js** 18.0.0 or higher
- **Git** (for Git integration features)
- **Docker** (optional, for separate Kuzu graph queries)

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Built for the AI-assisted development era** • [Issues](https://github.com/banditburai/perun-flow/issues) • [Discussions](https://github.com/banditburai/perun-flow/discussions)