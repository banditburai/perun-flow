// import { z } from 'zod';
import { log } from '../../utils/logger.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

// Define tool schemas
const tools = [
  {
    name: 'mcp__tasks__create',
    description: 'Create a new development task',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Task description' },
        priority: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          default: 'medium',
          description: 'Task priority',
        },
        dependencies: {
          type: 'array',
          items: { type: 'string' },
          description: 'Task IDs this task depends on',
        },
      },
      required: ['title'],
    },
  },

  {
    name: 'mcp__tasks__next',
    description: 'Find the next actionable task with no incomplete dependencies',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  {
    name: 'mcp__tasks__status',
    description: 'Update the status of a task',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to update' },
        status: {
          type: 'string',
          enum: ['pending', 'in-progress', 'done', 'archive'],
          description: 'New status for the task',
        },
      },
      required: ['task_id', 'status'],
    },
  },

  {
    name: 'mcp__tasks__note',
    description: 'Add a progress note to a task',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to add note to' },
        note: { type: 'string', description: 'Note content to add' },
      },
      required: ['task_id', 'note'],
    },
  },

  {
    name: 'mcp__tasks__deps',
    description: 'Check task dependencies and detect circular dependencies',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to check dependencies for' },
      },
      required: ['task_id'],
    },
  },

  {
    name: 'mcp__tasks__dependents',
    description: 'Get tasks that depend on a given task (reverse dependencies)',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to check dependents for' },
      },
      required: ['task_id'],
    },
  },

  {
    name: 'mcp__tasks__graph',
    description: 'Get full dependency graph for a task (both dependencies and dependents)',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to get dependency graph for' },
      },
      required: ['task_id'],
    },
  },

  {
    name: 'mcp__tasks__list',
    description: 'List all tasks with optional filtering',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'in-progress', 'done', 'archive'],
          description: 'Filter by status',
        },
        priority: {
          type: 'string',
          enum: ['high', 'medium', 'low'],
          description: 'Filter by priority',
        },
      },
    },
  },

  // Git workflow tools
  {
    name: 'mcp__tasks__start',
    description: 'Start working on a task (creates Git branch, initial commit)',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to start' },
      },
      required: ['task_id'],
    },
  },

  {
    name: 'mcp__tasks__commit',
    description: 'Commit current progress on task',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID' },
        message: { type: 'string', description: 'Commit message' },
        description: { type: 'string', description: 'Optional detailed description' },
      },
      required: ['task_id', 'message'],
    },
  },

  {
    name: 'mcp__tasks__complete',
    description: 'Complete a task (final commit and status update)',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to complete' },
        message: { type: 'string', description: 'Final commit message' },
      },
      required: ['task_id'],
    },
  },

  {
    name: 'mcp__tasks__rollback',
    description: 'Rollback task code changes',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID' },
        to_commit: { type: 'string', description: 'Commit hash to rollback to (optional)' },
      },
      required: ['task_id'],
    },
  },

  {
    name: 'mcp__tasks__history',
    description: 'Show commit history for a task',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID' },
      },
      required: ['task_id'],
    },
  },

  {
    name: 'mcp__tasks__merge',
    description: 'Merge completed task branch to main',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to merge' },
        delete_branch: { type: 'boolean', default: true, description: 'Delete branch after merge' },
      },
      required: ['task_id'],
    },
  },

  {
    name: 'mcp__tasks__decompose',
    description: 'Analyze task complexity and decompose into subtasks if needed',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to decompose' },
        force: {
          type: 'boolean',
          default: false,
          description: 'Force decomposition even if not complex',
        },
        max_subtasks: {
          type: 'number',
          default: 6,
          description: 'Maximum number of subtasks to create',
        },
      },
      required: ['task_id'],
    },
  },

  {
    name: 'mcp__tasks__hierarchy',
    description: 'Get task hierarchy (parent and children)',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID to get hierarchy for' },
      },
      required: ['task_id'],
    },
  },
];

/**
 * Register all Task Master Lite MCP tools
 */
export function registerTaskTools(server, taskManager, syncEngine, serverInstance) {
  try {
    log('debug', 'Registering tools handlers...');

    // Handler for tools/list request
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      log('debug', 'Handling tools/list request');
      return {
        tools: tools,
      };
    });

    // Handler for tools/call request
    server.setRequestHandler(CallToolRequestSchema, async request => {
      log('debug', 'Handling tools/call request', request);

      // Ensure storage is initialized before any tool operations
      if (serverInstance && serverInstance.ensureInitialized) {
        await serverInstance.ensureInitialized();
      }

      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'mcp__tasks__create':
            return await handleCreateTask(args, taskManager);

          case 'mcp__tasks__next':
            return await handleNextTask(args, taskManager);

          case 'mcp__tasks__status':
            return await handleTaskStatus(args, taskManager);

          case 'mcp__tasks__note':
            return await handleAddNote(args, taskManager);

          case 'mcp__tasks__deps':
            return await handleCheckDependencies(args, taskManager);

          case 'mcp__tasks__dependents':
            return await handleGetDependents(args, taskManager);

          case 'mcp__tasks__graph':
            return await handleGetDependencyGraph(args, taskManager);

          case 'mcp__tasks__list':
            return await handleListTasks(args, taskManager);

          // Git workflow tools
          case 'mcp__tasks__start':
            return await handleStartTask(args, taskManager);

          case 'mcp__tasks__commit':
            return await handleCommitProgress(args, taskManager);

          case 'mcp__tasks__complete':
            return await handleCompleteTask(args, taskManager);

          case 'mcp__tasks__rollback':
            return await handleRollbackTask(args, taskManager);

          case 'mcp__tasks__history':
            return await handleTaskHistory(args, taskManager);

          case 'mcp__tasks__merge':
            return await handleMergeTask(args, taskManager);

          case 'mcp__tasks__decompose':
            return await handleDecomposeTask(args, taskManager);

          case 'mcp__tasks__hierarchy':
            return await handleGetHierarchy(args, taskManager);

          default:
            throw new McpError(ErrorCode.InvalidParams, `Tool ${name} not found`);
        }
      } catch (error) {
        log('error', `Tool execution failed: ${error.message}`);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });

    log('info', 'Registered MCP tools handlers');
  } catch (error) {
    log('error', `Failed to register tools: ${error.message}`, error);
    throw error;
  }
}

// Tool handler functions
async function handleCreateTask(params, taskManager) {
  try {
    const result = await taskManager.createTask({
      title: params.title,
      description: params.description,
      priority: params.priority || 'medium',
      dependencies: params.dependencies || [],
    });

    return {
      content: [
        {
          type: 'text',
          text: `Created task: ${result.id} - ${result.title}\nFile: ${result.file_path}`,
        },
      ],
    };
  } catch (error) {
    throw error;
  }
}

async function handleNextTask(params, taskManager) {
  try {
    const nextTask = await taskManager.findNextTask();

    if (!nextTask) {
      // Check if there are blocked tasks
      const allTasks = await taskManager.listTasks({ status: 'pending' });
      const blockedCount = allTasks.length;

      if (blockedCount > 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No actionable tasks available. ${blockedCount} tasks are blocked by dependencies.`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: 'All tasks are complete! 🎉',
            },
          ],
        };
      }
    }

    let taskInfo = `Next task: ${nextTask.id} - ${nextTask.title}\n`;
    taskInfo += `Status: ${nextTask.status}\n`;
    taskInfo += `Priority: ${nextTask.priority}\n`;

    if (nextTask.description) {
      taskInfo += `\nDescription:\n${nextTask.description}\n`;
    }

    if (nextTask.subtasks && nextTask.subtasks.length > 0) {
      taskInfo += '\nSubtasks:\n';
      for (const subtask of nextTask.subtasks) {
        const checkbox = subtask.is_complete ? '[x]' : '[ ]';
        taskInfo += `- ${checkbox} ${subtask.title}\n`;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: taskInfo,
        },
      ],
    };
  } catch (error) {
    throw error;
  }
}

async function handleTaskStatus(params, taskManager) {
  try {
    const result = await taskManager.updateTaskStatus(params.task_id, params.status);

    return {
      content: [
        {
          type: 'text',
          text: `Updated task ${result.id} status to: ${result.status}\nFile moved to: ${result.file_path}`,
        },
      ],
    };
  } catch (error) {
    throw error;
  }
}

async function handleAddNote(params, taskManager) {
  try {
    await taskManager.addNote(params.task_id, params.note);

    return {
      content: [
        {
          type: 'text',
          text: `Added note to task ${params.task_id}:\n"${params.note}"`,
        },
      ],
    };
  } catch (error) {
    throw error;
  }
}

async function handleCheckDependencies(params, taskManager) {
  try {
    const deps = await taskManager.checkDependencies(params.task_id);

    let response = `Task ${deps.task_id} dependencies:\n`;

    if (deps.dependencies.length === 0) {
      response += 'No dependencies\n';
    } else {
      response += '\nAll dependencies:\n';
      for (const dep of deps.dependencies) {
        response += `- ${dep.id}: ${dep.title} [${dep.status}]\n`;
      }

      if (deps.blocking.length > 0) {
        response += '\nBlocking dependencies (not done):\n';
        for (const block of deps.blocking) {
          response += `- ${block.id}: ${block.title} [${block.status}]\n`;
        }
      }
    }

    if (deps.has_circular) {
      response += '\n⚠️  WARNING: Circular dependency detected!';
    }

    response += `\nReady to work on: ${deps.ready ? 'Yes ✅' : 'No ❌'}`;

    return {
      content: [
        {
          type: 'text',
          text: response,
        },
      ],
    };
  } catch (error) {
    throw error;
  }
}

async function handleGetDependents(params, taskManager) {
  try {
    const result = await taskManager.getDependents(params.task_id);

    let response = `Tasks that depend on ${params.task_id}:\n`;

    if (result.dependents.length === 0) {
      response += 'No tasks depend on this task.\n';
    } else {
      response += '\nAll dependents:\n';
      for (const dep of result.dependents) {
        response += `- ${dep.id}: ${dep.title} [${dep.status}]\n`;
      }

      if (result.impacted.length > 0) {
        response += '\nImpacted tasks (would be blocked):\n';
        for (const imp of result.impacted) {
          response += `- ${imp.id}: ${imp.title} [${imp.status}]\n`;
        }
      }
    }

    response += `\nTotal dependents: ${result.total_dependents}`;
    response += `\nWould block: ${result.blocked_count} tasks`;

    return {
      content: [
        {
          type: 'text',
          text: response,
        },
      ],
    };
  } catch (error) {
    throw error;
  }
}

async function handleGetDependencyGraph(params, taskManager) {
  try {
    const graph = await taskManager.getFullDependencyGraph(params.task_id);

    let response = `Dependency graph for: ${graph.task.title}\n`;
    response += `Status: ${graph.task.status}\n\n`;

    // Dependencies section
    response += '📥 Dependencies (this task depends on):\n';
    if (graph.dependencies.length === 0) {
      response += '  None\n';
    } else {
      for (const dep of graph.dependencies) {
        const status = dep.status === 'done' ? '✅' : '⏳';
        response += `  ${status} ${dep.id}: ${dep.title}\n`;
      }
    }

    response += '\n📤 Dependents (depend on this task):\n';
    if (graph.dependents.length === 0) {
      response += '  None\n';
    } else {
      for (const dep of graph.dependents) {
        const status = dep.status === 'done' ? '✅' : '🚧';
        response += `  ${status} ${dep.id}: ${dep.title}\n`;
      }
    }

    response += '\n📊 Statistics:\n';
    response += `  Dependencies: ${graph.statistics.completed_dependencies}/${graph.statistics.total_dependencies} completed\n`;
    response += `  Dependents: ${graph.statistics.blocked_dependents} of ${graph.statistics.total_dependents} would be blocked\n`;

    return {
      content: [
        {
          type: 'text',
          text: response,
        },
      ],
    };
  } catch (error) {
    throw error;
  }
}

async function handleListTasks(params, taskManager) {
  try {
    const tasks = await taskManager.listTasks({
      status: params.status,
      priority: params.priority,
    });

    if (tasks.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No tasks found matching the criteria.',
          },
        ],
      };
    }

    let response = `Found ${tasks.length} task(s):\n\n`;

    for (const task of tasks) {
      response += `${task.id} - ${task.title}\n`;
      response += `  Status: ${task.status} | Priority: ${task.priority}`;

      response += '\n';

      if (task.subtasks && task.subtasks.length > 0) {
        const completed = task.subtasks.filter(st => st.is_complete).length;
        response += `  Progress: ${completed}/${task.subtasks.length} subtasks complete\n`;
      }

      response += '\n';
    }

    return {
      content: [
        {
          type: 'text',
          text: response,
        },
      ],
    };
  } catch (error) {
    throw error;
  }
}

// Git workflow handlers
async function handleStartTask(params, taskManager) {
  try {
    // Check if taskManager supports Git operations
    if (!taskManager.startTask) {
      throw new Error('Git operations not supported. Initialize with CodeVersionedTaskManager.');
    }

    const result = await taskManager.startTask(params.task_id);

    return {
      content: [
        {
          type: 'text',
          text: `${result.message}\n\nBranch: ${result.branch}\nStatus: ${result.status}`,
        },
      ],
    };
  } catch (error) {
    throw error;
  }
}

async function handleCommitProgress(params, taskManager) {
  try {
    if (!taskManager.commitProgress) {
      throw new Error('Git operations not supported. Initialize with CodeVersionedTaskManager.');
    }

    const result = await taskManager.commitProgress(
      params.task_id,
      params.message,
      params.description
    );

    let response = result.message;
    if (result.commitHash) {
      response += `\nCommit: ${result.commitHash}`;
    }

    return {
      content: [
        {
          type: 'text',
          text: response,
        },
      ],
    };
  } catch (error) {
    throw error;
  }
}

async function handleCompleteTask(params, taskManager) {
  try {
    if (!taskManager.completeTask) {
      throw new Error('Git operations not supported. Initialize with CodeVersionedTaskManager.');
    }

    const result = await taskManager.completeTask(params.task_id, params.message);

    return {
      content: [
        {
          type: 'text',
          text: `${result.message}\n\nBranch: ${result.branch}\nFinal commit: ${result.finalCommit}\nStatus: ${result.status}`,
        },
      ],
    };
  } catch (error) {
    throw error;
  }
}

async function handleRollbackTask(params, taskManager) {
  try {
    if (!taskManager.rollbackTask) {
      throw new Error('Git operations not supported. Initialize with CodeVersionedTaskManager.');
    }

    const result = await taskManager.rollbackTask(params.task_id, params.to_commit);

    return {
      content: [
        {
          type: 'text',
          text: `${result.message}\n\nBranch: ${result.branch}\nRolled back to: ${result.rolledBackTo}`,
        },
      ],
    };
  } catch (error) {
    throw error;
  }
}

async function handleTaskHistory(params, taskManager) {
  try {
    if (!taskManager.getTaskHistory) {
      throw new Error('Git operations not supported. Initialize with CodeVersionedTaskManager.');
    }

    const history = await taskManager.getTaskHistory(params.task_id);

    if (history.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No commits found for this task.',
          },
        ],
      };
    }

    let response = `Task commit history:\n\n`;
    for (const commit of history) {
      response += `${commit.hash} - ${commit.message} (${commit.date})\n`;
    }

    return {
      content: [
        {
          type: 'text',
          text: response,
        },
      ],
    };
  } catch (error) {
    throw error;
  }
}

async function handleMergeTask(params, taskManager) {
  try {
    if (!taskManager.mergeTaskBranch) {
      throw new Error('Git operations not supported. Initialize with CodeVersionedTaskManager.');
    }

    const result = await taskManager.mergeTaskBranch(
      params.task_id,
      params.delete_branch !== false
    );

    return {
      content: [
        {
          type: 'text',
          text: `${result.message}\n\nMerged: ${result.merged}\nBranch deleted: ${result.branchDeleted}`,
        },
      ],
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Handle task decomposition
 */
async function handleDecomposeTask(params, taskManager) {
  try {
    const result = await taskManager.decomposeTask(params.task_id, {
      force: params.force,
      maxSubtasks: params.max_subtasks,
    });

    if (!result.decomposed) {
      return {
        content: [
          {
            type: 'text',
            text: `Task ${params.task_id} was not decomposed: ${result.reason}\n\nComplexity Analysis:\nScore: ${result.analysis.complexityScore}\nReasoning: ${result.analysis.reasoning}`,
          },
        ],
      };
    }

    let response = `✅ Successfully decomposed task: ${result.parentTask.title}\n\n`;
    response += `📊 Complexity Analysis:\n`;
    response += `Score: ${result.analysis.complexityScore} (${result.analysis.reasoning})\n\n`;
    response += `📝 Created ${result.subtasks.length} subtasks:\n`;

    result.subtasks.forEach((subtask, index) => {
      response += `${index + 1}. ${subtask.id} - ${subtask.title}\n`;
      response += `   Priority: ${subtask.priority}\n`;
    });

    return {
      content: [
        {
          type: 'text',
          text: response,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ Failed to decompose task: ${error.message}`,
        },
      ],
    };
  }
}

/**
 * Handle getting task hierarchy
 */
async function handleGetHierarchy(params, taskManager) {
  try {
    const [parent, children] = await Promise.all([
      taskManager.getTaskParent(params.task_id),
      taskManager.getTaskChildren(params.task_id),
    ]);

    const task = await taskManager.getTask(params.task_id);
    if (!task) {
      throw new Error(`Task ${params.task_id} not found`);
    }

    let response = `📋 Task Hierarchy for: ${task.title}\n\n`;

    if (parent) {
      response += `📤 Parent Task:\n`;
      response += `${parent.id} - ${parent.title} [${parent.status}]\n`;
      response += `Decomposed: ${parent.decomposed_at}\n\n`;
    } else {
      response += `📤 Parent Task: None (this is a root task)\n\n`;
    }

    if (children.length > 0) {
      response += `📥 Child Tasks (${children.length}):\n`;
      children.forEach((child, index) => {
        const relationshipIcon = child.relationship_type === 'decomposition' ? '🔀' : '📋';
        response += `${index + 1}. ${relationshipIcon} ${child.id} - ${child.title} [${child.status}]\n`;
        response += `   Priority: ${child.priority}`;
        if (child.relationship_type === 'subtask' && child.position !== null) {
          response += ` | Position: ${child.position}`;
        }
        if (child.relationship_type === 'decomposition' && child.decomposition_type) {
          response += ` | Type: ${child.decomposition_type}`;
        }
        response += '\n';
      });
    } else {
      response += `📥 Child Tasks: None (this is an atomic task)\n`;
    }

    return {
      content: [
        {
          type: 'text',
          text: response,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ Failed to get task hierarchy: ${error.message}`,
        },
      ],
    };
  }
}

export default { registerTaskTools };
