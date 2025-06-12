# Task Master Lite - Tests

This directory contains all tests for the Task Master Lite system.

## Structure

```
tests/
├── integration/         # Feature integration tests
│   ├── test-sync-on-demand.js
│   ├── test-clickable-deps.js
│   ├── test-semantic-naming.js
│   └── test-journal.js
├── fixtures/           # Test data and outputs
│   └── test-output/    # Temporary test outputs (gitignored)
├── run-tests.js        # Test runner script
└── README.md           # This file
```

## Running Tests

### Run all tests:

```bash
node tests/run-tests.js
```

### Run individual tests:

```bash
# From the perun-flow directory
node tests/integration/test-sync-on-demand.js
node tests/integration/test-clickable-deps.js
node tests/integration/test-semantic-naming.js
node tests/integration/test-journal.js
```

## Test Features

1. **Sync-on-Demand**: Tests file-to-graph synchronization
2. **Clickable Dependencies**: Tests markdown link generation
3. **Semantic Naming**: Tests STREAM-PHASE.SEQ naming system
4. **Operation Journaling**: Tests audit trail functionality

## MCP Server Tests

The MCP server tests are in the root directory:

- `test-mcp-tools.js` - Tests MCP tool functionality
- `test-*-server.js` - Various server integration tests

## Notes

- Test outputs are automatically cleaned up after running
- All test data is written to `tests/fixtures/test-output/` (gitignored)
- Tests are self-contained and don't affect the real task system
