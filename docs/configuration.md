# Configuration Guide

## Environment Variables

### Core Configuration

#### TASKS_DIR

- **Description**: Directory where task files are stored
- **Default**: `.tasks` (in current directory)
- **Example**: `/Users/username/Documents/tasks`

```bash
TASKS_DIR=/path/to/tasks node src/mcp/server.js
```

#### LOG_LEVEL

- **Description**: Logging verbosity level
- **Default**: `info`
- **Options**: `debug`, `info`, `warn`, `error`
- **Example**: `LOG_LEVEL=debug`

### Git Integration

#### ENABLE_GIT

- **Description**: Enable Git integration features
- **Default**: `false`
- **Options**: `true`, `false`, `1`, `0`
- **Example**: `ENABLE_GIT=true`

When enabled, provides:

- Branch per task workflow
- Commit tracking
- Code rollback capabilities
- Merge management

#### CODE_DIR

- **Description**: Directory containing your code repository
- **Default**: Current working directory
- **Example**: `/Users/username/my-project`
- **Note**: Only used when `ENABLE_GIT=true`

#### AUTO_COMMIT

- **Description**: Automatically commit changes when updating tasks
- **Default**: `true`
- **Options**: `true`, `false`
- **Example**: `AUTO_COMMIT=false`
- **Note**: Only used when `ENABLE_GIT=true`

### Database Configuration

#### GRAPH_DB_PATH

- **Description**: Custom path for KuzuDB database files
- **Default**: `{TASKS_DIR}/kuzudb`
- **Example**: `/var/lib/perun-flow/graph.db`

## Claude Desktop Configuration

### Configuration File Location

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

### Basic Configuration

```json
{
  "mcpServers": {
    "perun-flow": {
      "command": "node",
      "args": ["/path/to/perun-flow/src/mcp/server.js"],
      "env": {
        "TASKS_DIR": "/path/to/your/tasks"
      }
    }
  }
}
```

### Advanced Configuration with Git

```json
{
  "mcpServers": {
    "perun-flow": {
      "command": "node",
      "args": ["/path/to/perun-flow/src/mcp/server.js"],
      "env": {
        "TASKS_DIR": "/path/to/project/.tasks",
        "ENABLE_GIT": "true",
        "CODE_DIR": "/path/to/project",
        "AUTO_COMMIT": "true",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Multiple Projects

You can configure multiple instances for different projects:

```json
{
  "mcpServers": {
    "work-tasks": {
      "command": "node",
      "args": ["/path/to/perun-flow/src/mcp/server.js"],
      "env": {
        "TASKS_DIR": "/Users/me/work/.tasks",
        "ENABLE_GIT": "true",
        "CODE_DIR": "/Users/me/work"
      }
    },
    "personal-tasks": {
      "command": "node",
      "args": ["/path/to/perun-flow/src/mcp/server.js"],
      "env": {
        "TASKS_DIR": "/Users/me/personal/tasks"
      }
    }
  }
}
```

## Command Line Usage

### Direct Server Start

```bash
# Basic
node src/mcp/server.js

# With custom tasks directory
TASKS_DIR=/custom/path node src/mcp/server.js

# With Git integration
ENABLE_GIT=true CODE_DIR=/my/project node src/mcp/server.js

# With debug logging
LOG_LEVEL=debug node src/mcp/server.js
```

### Development Mode

```bash
# With file watching (auto-restart on changes)
npm run dev
```

## Configuration Best Practices

1. **Separate Tasks by Project**: Use different TASKS_DIR for each project
2. **Version Control**: Add `.tasks/` to `.gitignore` unless you want to share tasks
3. **Git Integration**: Only enable for projects with Git repositories
4. **Logging**: Use `debug` level when troubleshooting, `error` for production
5. **Paths**: Always use absolute paths in configuration

## Troubleshooting

### Tasks Not Appearing

- Check TASKS_DIR is set correctly
- Ensure directory has write permissions
- Look for errors in Claude Desktop logs

### Git Integration Not Working

- Verify Git is installed and in PATH
- Check CODE_DIR points to a Git repository
- Ensure ENABLE_GIT is set to "true" (string, not boolean)

### Database Errors

- Check disk space for KuzuDB files
- Verify GRAPH_DB_PATH directory exists
- Try deleting kuzudb directory to reset

### Permission Errors

- Ensure user has read/write access to TASKS_DIR
- Check file permissions on task files
- On macOS/Linux, check directory ownership
