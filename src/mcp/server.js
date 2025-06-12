#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { TaskManager } from '../core/task-manager.js';
import { CodeVersionedTaskManager } from '../core/code-versioned-task-manager.js';
import { FileStorage } from '../storage/file-storage.js';
import { GraphConnection } from '../storage/graph-connection.js';
import { SyncEngine } from '../core/sync-engine.js';
import { registerTaskTools } from './tools/index.js';
import { log } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Task Master Lite MCP Server using official SDK
 */
class TaskMasterMCPServer {
  constructor() {
    // Create MCP server instance
    this.server = new Server(
      {
        name: 'perun-flow',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Determine tasks directory
    this.tasksDir = process.env.TASKS_DIR || path.join(process.cwd(), '.tasks');

    // Check if Git integration is enabled
    this.gitEnabled = process.env.ENABLE_GIT === 'true' || process.env.ENABLE_GIT === '1';

    // Initialize storage systems (but don't connect yet)
    this.fileStorage = new FileStorage(this.tasksDir);
    this.graphConnection = new GraphConnection(this.tasksDir);

    // Use Git-enabled task manager if requested
    if (this.gitEnabled) {
      const codeDir = process.env.CODE_DIR || process.cwd();
      this.taskManager = new CodeVersionedTaskManager(this.fileStorage, this.graphConnection, {
        codeDir: codeDir,
        autoCommit: process.env.AUTO_COMMIT !== 'false',
      });
      log('info', `Git integration enabled for directory: ${codeDir}`);
    } else {
      this.taskManager = new TaskManager(this.fileStorage, this.graphConnection);
    }

    this.syncEngine = new SyncEngine(this.fileStorage, this.graphConnection);
    this.initialized = false;
  }

  /**
   * Initialize the server and register tools (minimal startup)
   */
  async initialize() {
    try {
      // Only register MCP tools - no heavy initialization
      registerTaskTools(this.server, this.taskManager, this.syncEngine, this);

      // Handle errors
      this.server.onerror = error => {
        log('error', 'MCP server error:', error);
      };

      log('info', 'MCP server initialized');
    } catch (error) {
      log('error', `Failed to initialize MCP server: ${error.message}`);
      throw error;
    }
  }

  /**
   * Lazy initialization of storage systems (only when first tool is called)
   */
  async ensureInitialized() {
    if (!this.initialized) {
      try {
        log('info', 'Performing lazy initialization of storage systems');

        // Initialize storage systems
        await this.taskManager.initialize();

        // Initial sync from files to graph (if files exist)
        const syncStatus = await this.syncEngine.verifySyncStatus();
        if (!syncStatus.in_sync) {
          log('info', 'Performing initial sync from files to graph');
          await this.syncEngine.syncFilesToGraph();
        }

        this.initialized = true;
        log('info', 'Storage systems initialized successfully');
      } catch (error) {
        log('error', `Failed to initialize storage: ${error.message}`);
        throw error;
      }
    }
  }

  /**
   * Start the MCP server
   */
  async start() {
    try {
      await this.initialize();

      // Create stdio transport
      const transport = new StdioServerTransport();

      // Connect server to transport
      await this.server.connect(transport);

      log('info', 'MCP server started with stdio transport');
    } catch (error) {
      log('error', `Failed to start MCP server: ${error.message}`);
      process.exit(1);
    }
  }

  /**
   * Stop the server gracefully
   */
  async stop() {
    try {
      await this.taskManager.close();
      await this.server.close();
      log('info', 'MCP server stopped');
    } catch (error) {
      log('error', `Error stopping server: ${error.message}`);
    }
  }
}

// Handle process signals
const server = new TaskMasterMCPServer();

process.on('SIGINT', async () => {
  log('info', 'Received SIGINT, shutting down gracefully');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log('info', 'Received SIGTERM, shutting down gracefully');
  await server.stop();
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', error => {
  log('error', `Uncaught exception: ${error.message}`, error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log('error', 'Unhandled rejection at:', { promise, reason });
  process.exit(1);
});

// Start the server
server.start();
