# Architecture Overview

## System Design

Perun Flow follows a layered architecture designed for flexibility, reliability, and ease of integration.

```
┌─────────────────────────────────────┐
│         MCP Protocol Layer          │
│        (Claude Desktop API)         │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│          MCP Server                 │
│    (Protocol Implementation)        │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│         Task Manager                │
│     (Business Logic Core)          │
└──────────────┬──────────────────────┘
               │
         ┌─────┴─────┬─────────┐
         │           │         │
┌────────▼────┐ ┌───▼────┐ ┌──▼──────┐
│   Storage   │ │  Sync  │ │ Journal │
│    Layer    │ │ Engine │ │ System  │
└─────────────┘ └────────┘ └─────────┘
         │           │         │
    ┌────┴────┐      │         │
    │         │      │         │
┌───▼──┐ ┌───▼──┐   │         │
│ File │ │Graph │   │         │
│Storage│ │ DB   │───┘         │
└──────┘ └──────┘             │
    │        │                 │
    └────────┴─────────────────┘
         File System
```

## Core Components

### MCP Server (`src/mcp/server.js`)
- Implements Model Context Protocol for Claude Desktop
- Handles tool registration and request routing
- Manages server lifecycle and transport
- Validates inputs using Zod schemas

### Task Manager (`src/core/task-manager.js`)
- Central business logic for all task operations
- Coordinates between storage, sync, and journal
- Implements validation and business rules
- Handles dependency resolution and circular detection

### Storage Layer

#### File Storage (`src/storage/file-storage.js`)
- Manages markdown files in status-based directories
- Handles file naming with semantic IDs
- Implements atomic file operations
- Preserves human-readable task format

#### Graph Connection (`src/storage/graph-connection.js`)
- Manages KuzuDB for efficient dependency queries
- Stores task relationships and metadata
- Enables complex graph traversals
- Provides bidirectional dependency tracking

### Sync Engine (`src/core/sync-engine.js`)
- Ensures consistency between file and graph storage
- Implements sync-on-demand pattern
- Handles concurrent modification detection
- Provides conflict resolution strategies

### Journal System (`src/core/journal.js`)
- Logs all operations with timestamps
- Enables audit trails and debugging
- Supports filtered queries
- Provides data export capabilities

### Code Versioned Task Manager (`src/core/code-versioned-task-manager.js`)
- Extends TaskManager with Git integration
- Implements branch-per-task workflow
- Tracks commits per task
- Manages merge operations

## Data Flow

### Task Creation Flow
1. MCP tool receives create request
2. TaskManager validates input
3. Stream detection determines task category
4. ID generation creates semantic identifier
5. FileStorage writes markdown file
6. GraphConnection creates task node
7. Journal logs the operation
8. Response sent back through MCP

### Dependency Query Flow
1. MCP tool receives dependency query
2. SyncEngine ensures data consistency
3. GraphConnection performs graph traversal
4. Results include bidirectional relationships
5. FileStorage updates markdown links
6. Response formatted for MCP

### Status Update Flow
1. MCP tool receives status update
2. TaskManager validates transition
3. FileStorage moves file to new directory
4. GraphConnection updates node properties
5. Journal logs the change
6. Dependents notified if needed

## Design Decisions

### Why Dual Storage?
- **Files**: Human-readable, portable, Git-friendly
- **Graph**: Efficient queries, relationship tracking
- **Sync**: Best of both worlds with eventual consistency

### Why Sync-on-Demand?
- Reduces overhead for read operations
- Handles external file modifications
- Provides flexibility for manual edits
- Maintains performance at scale

### Why Semantic IDs?
- Self-documenting task identifiers
- Natural grouping by stream
- Phase-based progression tracking
- Meaningful at a glance

### Why MCP Protocol?
- Native Claude Desktop integration
- Standardized tool interface
- Built-in validation and error handling
- Future-proof for AI assistants

## Extension Points

### Custom Stream Detection
Add patterns to `getStreamFromText()` in TaskManager:
```javascript
streamPatterns.set('CUSTOM', ['keyword1', 'keyword2']);
```

### Additional Storage Backends
Implement the storage interface:
```javascript
class CustomStorage {
  async initialize() {}
  async createTask(task) {}
  async getTask(id) {}
  // ... other required methods
}
```

### Custom Task Fields
Extend task structure in `parseTaskContent()`:
```javascript
// Add to frontmatter section
customField: parsed.customField || defaultValue
```

### New MCP Tools
Add to `tools` array in `registerTaskTools()`:
```javascript
{
  name: 'mcp__tasks__custom',
  description: 'Custom operation',
  inputSchema: { /* zod schema */ },
  handler: async (params) => { /* implementation */ }
}
```

## Performance Characteristics

### Scalability
- File storage: Linear with task count
- Graph queries: Logarithmic for most operations
- Sync overhead: Proportional to change set
- Memory usage: Minimal, streaming where possible

### Bottlenecks
- Large dependency chains: Use pagination
- Many concurrent updates: Implement queuing
- Journal size: Rotate logs periodically
- Graph database size: Archive old tasks

## Security Considerations

### File System
- Tasks stored in user-specified directory
- No automatic execution of task content
- File names sanitized for safety
- Permissions follow OS user model

### Git Integration
- Optional feature, off by default
- Uses system Git installation
- Respects .gitignore rules
- No automatic pushes to remote

### Input Validation
- All inputs validated with Zod schemas
- Path traversal prevention
- Command injection protection
- Size limits on text fields

## Future Enhancements

### Planned Features
- Task templates and snippets
- Time tracking integration
- Multi-user collaboration
- Web UI dashboard
- Plugin system

### Potential Optimizations
- Caching layer for frequent queries
- Batch operations for bulk updates
- Incremental sync strategies
- Graph database clustering