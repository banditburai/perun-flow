// Jest setup file for all tests
import { jest } from '@jest/globals';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

// Global test utilities
global.testUtils = {
  // Generate unique test IDs
  generateTestId: () => `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,

  // Create test directories
  createTestDir: async (fs, dir) => {
    await fs.mkdir(dir, { recursive: true });
  },

  // Clean up test directories
  cleanupTestDir: async (fs, dir) => {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  },

  // Wait for async operations
  wait: ms => new Promise(resolve => setTimeout(resolve, ms)),

  // Mock console methods during tests
  mockConsole: () => {
    const originalConsole = { ...console };
    beforeEach(() => {
      console.log = jest.fn();
      console.error = jest.fn();
      console.warn = jest.fn();
    });
    afterEach(() => {
      console.log = originalConsole.log;
      console.error = originalConsole.error;
      console.warn = originalConsole.warn;
    });
  },
};

// Common test timeout
jest.setTimeout(30000);

// Clean up any test artifacts after all tests
afterAll(async () => {
  // Close any open handles
  await new Promise(resolve => setTimeout(resolve, 100));
});
