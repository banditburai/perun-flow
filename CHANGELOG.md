# Changelog

## [0.1.0] - 2025-06-11

### Initial Release

#### Features
- **Markdown-based task storage** with human-readable format
- **Bidirectional dependency tracking** using KuzuDB graph database
- **Semantic task numbering** with stream-based organization (API-1.01, UI-2.01)
- **MCP protocol integration** for Claude Code (14 tools)
- **Git integration** with branch-per-task workflow (optional)
- **Operation journaling** for audit trails and recovery
- **Sync-on-demand** architecture for performance
- **Comprehensive validation** for all inputs
- **Unicode support** including emojis in task titles

#### MCP Tools
- Task Management: `create`, `list`, `status`, `note`
- Workflow: `next` (finds actionable tasks)
- Dependencies: `deps`, `dependents`, `graph`
- Git Integration: `start`, `commit`, `complete`, `rollback`, `history`, `merge`

#### Architecture
- Layered design with clear separation of concerns
- Dual storage (files + graph) with synchronization
- Functional programming approach
- Event-driven through journal system

#### Testing
- Unit, integration, and E2E test coverage
- Performance testing with 1000+ tasks

#### Documentation
- Comprehensive API reference
- Architecture overview
- Configuration guide
- Testing guide
- Task structure documentation
- MCP tools reference
- Quick start example

#### Known Limitations
- KuzuDB may have memory allocation issues on some systems
- Rapid file operations can cause race conditions
- No built-in task templates yet
- No web UI (MCP/CLI only)