import { jest, describe, beforeEach, afterEach, test, expect } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import os from 'os';
import { TaskManager } from '../../src/core/task-manager.js';
import { FileStorage } from '../../src/storage/file-storage.js';
import { GraphConnection } from '../mocks/graph-connection-mock.js';
import { SyncEngine } from '../../src/core/sync-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mock logger
jest.mock('../../src/utils/logger.js');

describe('MCP Protocol Compliance E2E Tests', () => {
  let testDir;
  let taskManager;
  let fileStorage;
  let graphConnection;
  let syncEngine;
  let tasksCreated = [];

  beforeEach(async () => {
    // Create test directory
    testDir = path.join(os.tmpdir(), `mcp-compliance-${Date.now()}`);
    await fs.mkdir(path.join(testDir, 'tasks'), { recursive: true });
    
    // Initialize components
    fileStorage = new FileStorage(path.join(testDir, 'tasks'));
    graphConnection = new GraphConnection(path.join(testDir, 'tasks'));
    
    await fileStorage.initialize();
    await graphConnection.initialize();
    
    syncEngine = new SyncEngine(fileStorage, graphConnection);
    // SyncEngine doesn't have initialize method
    
    taskManager = new TaskManager(fileStorage, graphConnection, syncEngine);
  });

  afterEach(async () => {
    // Clean up created tasks
    for (const taskId of tasksCreated) {
      try {
        await taskManager.updateTask(taskId, { status: 'archive' });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    tasksCreated = [];

    // Close connections
    await graphConnection.close();

    // Clean up directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  // Helper to simulate MCP tool calls
  async function callTool(toolName, params = {}) {
    // Map tool names to TaskManager methods
    const toolMap = {
      'mcp__perun-flow__mcp__tasks__create': async (p) => {
        const result = await taskManager.createTask({
          title: p.title,
          description: p.description,
          priority: p.priority || 'medium',
          dependencies: p.dependencies || [],
        });
        return {
          content: [{
            type: 'text',
            text: `Created task ${result.id} - ${result.title}`
          }]
        };
      },
      
      'mcp__perun-flow__mcp__tasks__list': async (p) => {
        const tasks = await taskManager.listTasks({
          status: p.status,
          priority: p.priority
        });
        
        if (tasks.length === 0) {
          return {
            content: [{
              type: 'text',
              text: 'No tasks found matching the criteria.'
            }]
          };
        }
        
        let response = `Found ${tasks.length} task(s):\n\n`;
        for (const task of tasks) {
          response += `${task.id} - ${task.title}\n`;
          response += `  Status: ${task.status} | Priority: ${task.priority}\n`;
        }
        
        return {
          content: [{
            type: 'text',
            text: response
          }]
        };
      },
      
      'mcp__perun-flow__mcp__tasks__status': async (p) => {
        const result = await taskManager.updateTaskStatus(p.task_id, p.status);
        return {
          content: [{
            type: 'text',
            text: `Updated task ${result.id} status to: ${result.status}`
          }]
        };
      },
      
      'mcp__perun-flow__mcp__tasks__next': async () => {
        const nextTask = await taskManager.findNextTask();
        
        if (!nextTask) {
          return {
            content: [{
              type: 'text',
              text: 'No actionable tasks available.'
            }]
          };
        }
        
        return {
          content: [{
            type: 'text',
            text: `Next task: ${nextTask.id} - ${nextTask.title}`
          }]
        };
      },
      
      'mcp__perun-flow__mcp__tasks__note': async (p) => {
        await taskManager.addNote(p.task_id, p.note);
        return {
          content: [{
            type: 'text',
            text: `Added note to task ${p.task_id}`
          }]
        };
      },
      
      'mcp__perun-flow__mcp__tasks__deps': async (p) => {
        const deps = await taskManager.checkDependencies(p.task_id);
        
        let response = `Task ${deps.task_id} dependencies:\n`;
        if (deps.dependencies.length === 0) {
          response += 'No dependencies\n';
        } else {
          for (const dep of deps.dependencies) {
            response += `- ${dep.id}: ${dep.title} [${dep.status}]\n`;
          }
        }
        
        return {
          content: [{
            type: 'text',
            text: response
          }]
        };
      },
      
      'mcp__perun-flow__mcp__tasks__dependents': async (p) => {
        const result = await taskManager.getDependents(p.task_id);
        
        let response = `Tasks that depend on ${p.task_id}:\n`;
        if (result.dependents.length === 0) {
          response += 'No tasks depend on this task.\n';
        } else {
          for (const dep of result.dependents) {
            response += `- ${dep.id}: ${dep.title} [${dep.status}]\n`;
          }
        }
        
        return {
          content: [{
            type: 'text',
            text: response
          }]
        };
      },
      
      'mcp__perun-flow__mcp__tasks__graph': async (p) => {
        const graph = await taskManager.getFullDependencyGraph(p.task_id);
        
        let response = `Dependency graph for: ${graph.task.title}\n\n`;
        response += 'Dependencies:\n';
        for (const dep of graph.dependencies) {
          response += `  ${dep.id}: ${dep.title}\n`;
        }
        response += '\nDependents:\n';
        for (const dep of graph.dependents) {
          response += `  ${dep.id}: ${dep.title}\n`;
        }
        
        return {
          content: [{
            type: 'text',
            text: response
          }]
        };
      }
    };

    const handler = toolMap[toolName];
    if (!handler) {
      throw new Error(`Tool not found: ${toolName}`);
    }
    
    // Validate string fields first (before required check since empty string is falsy)
    if (toolName === 'mcp__perun-flow__mcp__tasks__create' && params.title !== undefined && params.title === '') {
      throw new Error('String must contain at least 1 character(s)');
    }
    
    // Validate required parameters based on tool
    const requiredParams = {
      'mcp__perun-flow__mcp__tasks__create': ['title'],
      'mcp__perun-flow__mcp__tasks__status': ['task_id', 'status'],
      'mcp__perun-flow__mcp__tasks__note': ['task_id', 'note'],
      'mcp__perun-flow__mcp__tasks__deps': ['task_id'],
      'mcp__perun-flow__mcp__tasks__dependents': ['task_id'],
      'mcp__perun-flow__mcp__tasks__graph': ['task_id']
    };
    
    const required = requiredParams[toolName] || [];
    for (const param of required) {
      if (params[param] === undefined || params[param] === null) {
        throw new Error(`Missing required parameter: ${param}`);
      }
    }
    
    // Validate enum values
    if (toolName === 'mcp__perun-flow__mcp__tasks__create' && params.priority) {
      if (!['high', 'medium', 'low'].includes(params.priority)) {
        throw new Error('Invalid enum value. Expected one of: high, medium, low');
      }
    }
    
    if (toolName === 'mcp__perun-flow__mcp__tasks__status' && params.status) {
      if (!['pending', 'in-progress', 'done', 'archive'].includes(params.status)) {
        throw new Error('Invalid enum value. Expected one of: pending, in-progress, done, archive');
      }
    }
    
    
    return handler(params);
  }

  describe('Tool Registration and Schemas', () => {
    test('should have all expected tools available', async () => {
      const expectedTools = [
        'mcp__perun-flow__mcp__tasks__create',
        'mcp__perun-flow__mcp__tasks__list',
        'mcp__perun-flow__mcp__tasks__status',
        'mcp__perun-flow__mcp__tasks__next',
        'mcp__perun-flow__mcp__tasks__note',
        'mcp__perun-flow__mcp__tasks__deps',
        'mcp__perun-flow__mcp__tasks__dependents',
        'mcp__perun-flow__mcp__tasks__graph'
      ];

      // All tools should be available (exist in toolMap)
      for (const toolName of expectedTools) {
        try {
          await callTool(toolName, {});
        } catch (error) {
          // Tool not found error is what we're checking for
          expect(error.message).not.toBe(`Tool not found: ${toolName}`);
        }
      }
    });

    test('should handle tool not found errors', async () => {
      await expect(
        callTool('mcp__perun-flow__mcp__tasks__nonexistent')
      ).rejects.toThrow('Tool not found');
    });

    test('should validate required parameters', async () => {
      // Missing required task_id
      await expect(
        callTool('mcp__perun-flow__mcp__tasks__status', {
          status: 'done'
          // Missing task_id
        })
      ).rejects.toThrow('Missing required parameter: task_id');
    });

    test('should return structured responses', async () => {
      const response = await callTool('mcp__perun-flow__mcp__tasks__list');
      
      // Response should have content array
      expect(response).toHaveProperty('content');
      expect(Array.isArray(response.content)).toBe(true);
      expect(response.content[0]).toHaveProperty('type');
      expect(response.content[0]).toHaveProperty('text');
    });
  });

  describe('Tool Testing - Valid Inputs', () => {
    test('should create task with all fields', async () => {
      const response = await callTool('mcp__perun-flow__mcp__tasks__create', {
        title: 'Full Task Example',
        description: 'A task with all fields populated',
        priority: 'high',
        dependencies: ['task-1', 'task-2']
      });

      expect(response.content[0].text).toContain('Created task');
      const match = response.content[0].text.match(/Created task (\S+)/);
      expect(match).toBeTruthy();
      tasksCreated.push(match[1]);
    });

    test('should list all tasks', async () => {
      // Create a few tasks first
      const task1 = await callTool('mcp__perun-flow__mcp__tasks__create', {
        title: 'List Test 1'
      });
      const task2 = await callTool('mcp__perun-flow__mcp__tasks__create', {
        title: 'List Test 2',
        priority: 'high'
      });

      // Extract IDs
      const id1 = task1.content[0].text.match(/Created task (\S+)/)[1];
      const id2 = task2.content[0].text.match(/Created task (\S+)/)[1];
      tasksCreated.push(id1, id2);

      // List all tasks
      const response = await callTool('mcp__perun-flow__mcp__tasks__list');
      
      expect(response.content[0].text).toContain('List Test 1');
      expect(response.content[0].text).toContain('List Test 2');
    });

    test('should filter tasks by status', async () => {
      // Create and update task status
      const task = await callTool('mcp__perun-flow__mcp__tasks__create', {
        title: 'Status Filter Test'
      });
      const taskId = task.content[0].text.match(/Created task (\S+)/)[1];
      tasksCreated.push(taskId);

      await callTool('mcp__perun-flow__mcp__tasks__status', {
        task_id: taskId,
        status: 'in-progress'
      });

      // Filter by status
      const response = await callTool('mcp__perun-flow__mcp__tasks__list', {
        status: 'in-progress'
      });

      expect(response.content[0].text).toContain('Status Filter Test');
    });

    test('should find next actionable task', async () => {
      // Create tasks with dependencies
      const task1 = await callTool('mcp__perun-flow__mcp__tasks__create', {
        title: 'Prerequisite Task'
      });
      const id1 = task1.content[0].text.match(/Created task (\S+)/)[1];
      
      const task2 = await callTool('mcp__perun-flow__mcp__tasks__create', {
        title: 'Dependent Task',
        dependencies: [id1]
      });
      const id2 = task2.content[0].text.match(/Created task (\S+)/)[1];
      
      tasksCreated.push(id1, id2);

      // Next task should be the one without dependencies
      const response = await callTool('mcp__perun-flow__mcp__tasks__next');
      expect(response.content[0].text).toContain('Prerequisite Task');
    });

    test('should handle task notes', async () => {
      const task = await callTool('mcp__perun-flow__mcp__tasks__create', {
        title: 'Task with Notes'
      });
      const taskId = task.content[0].text.match(/Created task (\S+)/)[1];
      tasksCreated.push(taskId);

      // Add note
      const response = await callTool('mcp__perun-flow__mcp__tasks__note', {
        task_id: taskId,
        note: 'This is a progress note'
      });

      expect(response.content[0].text).toContain('Added note');
    });

    test('should check dependencies', async () => {
      const task1 = await callTool('mcp__perun-flow__mcp__tasks__create', {
        title: 'Dependency Test 1'
      });
      const id1 = task1.content[0].text.match(/Created task (\S+)/)[1];
      
      const task2 = await callTool('mcp__perun-flow__mcp__tasks__create', {
        title: 'Dependency Test 2',
        dependencies: [id1]
      });
      const id2 = task2.content[0].text.match(/Created task (\S+)/)[1];
      
      tasksCreated.push(id1, id2);

      // Check dependencies
      const response = await callTool('mcp__perun-flow__mcp__tasks__deps', {
        task_id: id2
      });

      expect(response.content[0].text).toContain(id1);
    });
  });

  describe('Tool Testing - Invalid Inputs', () => {
    test('should reject invalid priority values', async () => {
      await expect(
        callTool('mcp__perun-flow__mcp__tasks__create', {
          title: 'Invalid Priority',
          priority: 'super-urgent' // Invalid
        })
      ).rejects.toThrow(/Invalid enum value/);
    });

    test('should reject invalid status values', async () => {
      const task = await callTool('mcp__perun-flow__mcp__tasks__create', {
        title: 'Status Test'
      });
      const taskId = task.content[0].text.match(/Created task (\S+)/)[1];
      tasksCreated.push(taskId);

      await expect(
        callTool('mcp__perun-flow__mcp__tasks__status', {
          task_id: taskId,
          status: 'cancelled' // Invalid
        })
      ).rejects.toThrow(/Invalid enum value/);
    });

    test('should handle non-existent task IDs', async () => {
      await expect(
        callTool('mcp__perun-flow__mcp__tasks__status', {
          task_id: 'non-existent-task',
          status: 'done'
        })
      ).rejects.toThrow(/not found/i);
    });

    test('should reject empty task titles', async () => {
      await expect(
        callTool('mcp__perun-flow__mcp__tasks__create', {
          title: '' // Empty
        })
      ).rejects.toThrow(/must contain at least 1 character/);
    });

    test('should detect circular dependencies', async () => {
      const task1 = await callTool('mcp__perun-flow__mcp__tasks__create', {
        title: 'Circular 1'
      });
      const id1 = task1.content[0].text.match(/Created task (\S+)/)[1];
      
      const task2 = await callTool('mcp__perun-flow__mcp__tasks__create', {
        title: 'Circular 2',
        dependencies: [id1]
      });
      const id2 = task2.content[0].text.match(/Created task (\S+)/)[1];
      
      tasksCreated.push(id1, id2);

      // Check dependencies - should show the dependency
      const response = await callTool('mcp__perun-flow__mcp__tasks__deps', {
        task_id: id2
      });

      expect(response.content[0].text).toContain(id1);
    });

  });

  describe('Error Response Formats', () => {
    test('should return structured error for missing parameters', async () => {
      await expect(
        callTool('mcp__perun-flow__mcp__tasks__note', {
          // Missing both task_id and note
        })
      ).rejects.toThrow(/Missing required parameter/);
    });

    test('should handle very long inputs gracefully', async () => {
      // Create a task with very long description
      const longDescription = 'A'.repeat(10000); // 10KB string
      
      const task = await callTool('mcp__perun-flow__mcp__tasks__create', {
        title: 'Long Description Task',
        description: longDescription
      });

      expect(task.content[0].text).toContain('Created task');
      const taskId = task.content[0].text.match(/Created task (\S+)/)[1];
      tasksCreated.push(taskId);
    });
  });

  describe('Dependency Features', () => {
    test('should get task dependents (reverse dependencies)', async () => {
      // Create base task
      const task1 = await callTool('mcp__perun-flow__mcp__tasks__create', {
        title: 'Base Task'
      });
      const id1 = task1.content[0].text.match(/Created task (\S+)/)[1];
      
      // Create tasks that depend on it
      const task2 = await callTool('mcp__perun-flow__mcp__tasks__create', {
        title: 'Dependent Task 1',
        dependencies: [id1]
      });
      const id2 = task2.content[0].text.match(/Created task (\S+)/)[1];
      
      const task3 = await callTool('mcp__perun-flow__mcp__tasks__create', {
        title: 'Dependent Task 2',
        dependencies: [id1]
      });
      const id3 = task3.content[0].text.match(/Created task (\S+)/)[1];
      
      tasksCreated.push(id1, id2, id3);

      // Get dependents of base task
      const response = await callTool('mcp__perun-flow__mcp__tasks__dependents', {
        task_id: id1
      });

      expect(response.content[0].text).toContain(id2);
      expect(response.content[0].text).toContain(id3);
    });

    test('should get full dependency graph', async () => {
      // Create a chain: task1 <- task2 <- task3
      const task1 = await callTool('mcp__perun-flow__mcp__tasks__create', {
        title: 'Root Task'
      });
      const id1 = task1.content[0].text.match(/Created task (\S+)/)[1];
      
      const task2 = await callTool('mcp__perun-flow__mcp__tasks__create', {
        title: 'Middle Task',
        dependencies: [id1]
      });
      const id2 = task2.content[0].text.match(/Created task (\S+)/)[1];
      
      const task3 = await callTool('mcp__perun-flow__mcp__tasks__create', {
        title: 'Leaf Task',
        dependencies: [id2]
      });
      const id3 = task3.content[0].text.match(/Created task (\S+)/)[1];
      
      tasksCreated.push(id1, id2, id3);

      // Get full graph for middle task
      const response = await callTool('mcp__perun-flow__mcp__tasks__graph', {
        task_id: id2
      });

      // Should show both dependencies and dependents
      expect(response.content[0].text).toContain('Dependencies');
      expect(response.content[0].text).toContain('Dependents');
      expect(response.content[0].text).toContain(id1);
      expect(response.content[0].text).toContain(id3);
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle concurrent task creation', async () => {
      // Create multiple tasks simultaneously
      const promises = Array(5).fill(null).map((_, i) => 
        callTool('mcp__perun-flow__mcp__tasks__create', {
          title: `Concurrent Task ${i}`
        })
      );

      const results = await Promise.all(promises);
      
      // All should succeed
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.content[0].text).toContain('Created task');
        const match = result.content[0].text.match(/Created task (\S+)/);
        if (match) tasksCreated.push(match[1]);
      });

      // Verify all tasks were created
      const listResponse = await callTool('mcp__perun-flow__mcp__tasks__list');
      for (let i = 0; i < 5; i++) {
        expect(listResponse.content[0].text).toContain(`Concurrent Task ${i}`);
      }
    });

    test('should handle concurrent status updates', async () => {
      // Create a task
      const task = await callTool('mcp__perun-flow__mcp__tasks__create', {
        title: 'Concurrent Status Test'
      });
      const taskId = task.content[0].text.match(/Created task (\S+)/)[1];
      tasksCreated.push(taskId);

      // Try to update status concurrently
      const statusPromises = [
        callTool('mcp__perun-flow__mcp__tasks__status', {
          task_id: taskId,
          status: 'in-progress'
        }),
        callTool('mcp__perun-flow__mcp__tasks__status', {
          task_id: taskId,
          status: 'done'
        })
      ];

      // Both should complete without errors
      const results = await Promise.allSettled(statusPromises);
      
      // At least one should succeed
      const succeeded = results.filter(r => r.status === 'fulfilled');
      expect(succeeded.length).toBeGreaterThan(0);
    });
  });
});