# Testing Guide

## Overview

Perun Flow has comprehensive test coverage with 183 tests across unit, integration, and E2E test suites. All tests focus on functionality rather than implementation details, making them resilient to code changes.

## Running Tests

### All Tests

```bash
npm test
```

### Specific Test Suites

```bash
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests only
npm run test:e2e        # End-to-end tests only
```

### Test Coverage

```bash
npm run test:coverage
```

### Watch Mode

```bash
npm run test:watch
```

## Test Structure

### Unit Tests (133 tests)

Located in `tests/unit/`

- **TaskManager** (48 tests): Core task operations, validation, stream detection
- **FileStorage** (17 tests): File operations, markdown parsing, status management
- **GraphConnection** (15 tests): Graph operations, dependency tracking
- **SyncEngine** (17 tests): Synchronization logic, conflict resolution
- **Journal** (36 tests): Operation logging, querying, export functionality

### Integration Tests (28 tests)

Located in `tests/integration/`

- **Error Recovery** (9 tests): Handles corrupted files, race conditions, permissions
- **Edge Cases** (12 tests): Unicode, emojis, large data, special characters
- **Manual Tests** (7 tests): Real-world scenarios for specific features

### E2E Tests (22 tests)

Located in `tests/e2e/`

- **MCP Protocol Compliance**: Validates all MCP tools, error handling, concurrency

## Key Testing Patterns

### Functional Testing

Tests verify behavior, not implementation:

```javascript
// Good: Tests functionality
test('should store and retrieve task data correctly', async () => {
  const task = { id: 'test-1', title: 'Test Task' };
  await fileStorage.createTaskFile(task);
  const retrieved = await fileStorage.readTaskFile('test-1');
  expect(retrieved).toMatchObject(task);
});

// Bad: Tests implementation details
test('should call markdown parser', async () => {
  // Don't test internal method calls
});
```

### Mock Strategy

We use functional mocks that simulate behavior:

```javascript
// GraphConnection mock simulates Kuzu behavior
class MockGraphConnection {
  constructor() {
    this.tasks = new Map();
    this.dependencies = new Map();
  }

  async createTask(task) {
    this.tasks.set(task.id, task);
    return task;
  }
}
```

### Test Data Patterns

Use realistic data in tests:

```javascript
const testTask = {
  title: '🚀 Deploy to production',
  description: 'Deploy the application with monitoring',
  priority: 'high',
  dependencies: ['API-1.01', 'UI-2.01'],
};
```

## Writing New Tests

### Test File Naming

- Unit tests: `{module}.test.js`
- Integration tests: `test-{scenario}.test.js`
- E2E tests: `test-{protocol}.test.js`

### Test Structure

```javascript
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';

describe('Module Name', () => {
  let instance;

  beforeEach(async () => {
    // Setup
  });

  afterEach(async () => {
    // Cleanup
  });

  describe('Feature Group', () => {
    test('should do something specific', async () => {
      // Arrange
      const input = {
        /* ... */
      };

      // Act
      const result = await instance.method(input);

      // Assert
      expect(result).toEqual(expected);
    });
  });
});
```

### Common Test Utilities

Available in `global.testUtils`:

```javascript
// Generate unique test ID
const id = global.testUtils.generateTestId();

// Create test directory
await global.testUtils.createTestDir(fs, dir);

// Clean up test directory
await global.testUtils.cleanupTestDir(fs, dir);

// Wait for async operations
await global.testUtils.wait(100);
```

## Test Coverage

Current coverage:

- Statements: 95%+
- Branches: 90%+
- Functions: 95%+
- Lines: 95%+

Coverage reports are generated in `coverage/` directory.

## Known Test Considerations

### Kuzu Memory Issues

Some environments have issues with Kuzu memory allocation. Tests use a functional mock to avoid this.

### File System Race Conditions

Rapid file operations can cause ENOENT errors. This is expected behavior and tests account for it.

### Numeric Precision

Some number fields may lose decimal precision when stored. Tests expect this behavior.

## Troubleshooting

### Tests Failing

1. Ensure dependencies are installed: `npm install`
2. Clear Jest cache: `npx jest --clearCache`
3. Check Node version: requires Node 18+

### Memory Issues

If you see Kuzu memory allocation errors:

```bash
# Use mock in tests
export USE_MOCK_GRAPH=true
npm test
```

### Slow Tests

Some integration tests are intentionally slow (testing timeouts, large data). Use focused runs:

```bash
npm test -- --testNamePattern="specific test"
```
