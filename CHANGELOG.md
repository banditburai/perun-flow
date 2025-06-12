# Changelog

## [Unreleased]

### Added

- Pre-commit CI setup with Husky, lint-staged, ESLint, and Prettier
- GitHub Actions CI workflow for automated testing and linting
- CONTRIBUTING.md with development setup instructions
- Smart sync strategy with Write-Through + Read-Check pattern
- Immediate sync for MCP write operations
- External file change detection with configurable intervals
- Pre-push hook to run full test suite
- Code formatting enforcement with Prettier
- ESLint configuration for modern JavaScript (ES2024)

### Changed

- Removed `estimated_hours` feature from tasks (LLM estimates unreliable)
- Fixed all "task-master-lite" references to "perun-flow"
- Updated sync strategy from lazy sync to immediate sync for write operations
- Improved parent-child relationship persistence in markdown files
- Enhanced external file change detection with timestamp tracking

### Fixed

- Parent-child relationships now properly persist in files and sync to graph
- Task decomposition correctly maintains parent references across sync cycles
- External file modifications are detected and synced on next read operation
- Graph database properly recreates relationships from file data on startup

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
