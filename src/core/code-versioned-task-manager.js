import { TaskManager } from './task-manager.js';
import { SimpleJournal } from './journal.js';
import { log } from '../utils/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Task manager with Git integration for code versioning
 * - Each task gets its own branch
 * - Automatic commits at consistent points
 * - Easy rollback of actual implementation
 */
export class CodeVersionedTaskManager extends TaskManager {
  constructor(fileStorage, graphConnection, options = {}) {
    super(fileStorage, graphConnection);
    this.codeDir = options.codeDir || process.cwd();
    this.autoCommit = options.autoCommit !== false;
    this.journal = new SimpleJournal(fileStorage.tasksDir);
  }

  /**
   * Start working on a task - creates branch and initial commit
   */
  async startTask(taskId) {
    await this.sync.ensureSynced();

    const task = await this.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    // Check dependencies
    const deps = await this.checkDependencies(taskId);
    if (!deps.ready) {
      throw new Error(`Task has incomplete dependencies: ${deps.incomplete.join(', ')}`);
    }

    // Create/switch to task branch
    const branchName = this.getBranchName(taskId, task.title);
    await this.createTaskBranch(branchName);

    // Update task status
    await this.updateTaskStatus(taskId, 'in-progress');

    // Log the start
    await this.journal.logOperation('task_started', {
      taskId,
      title: task.title,
      branch: branchName,
    });

    // Initial commit on task branch
    if (this.autoCommit) {
      await this.commitCode(`Start task: ${task.title}`, taskId);
    }

    return {
      taskId,
      branch: branchName,
      status: 'in-progress',
      message: `Started task on branch: ${branchName}`,
    };
  }

  /**
   * Commit progress on current task
   */
  async commitProgress(taskId, message, description = '') {
    const task = await this.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const branchName = this.getBranchName(taskId, task.title);

    // Ensure we're on the right branch
    await this.switchToBranch(branchName);

    // Commit current code state
    const commitHash = await this.commitCode(message, taskId, description);

    if (commitHash) {
      // Log progress
      await this.journal.logOperation('progress_commit', {
        taskId,
        message,
        commitHash,
        branch: branchName,
      });
    }

    return {
      taskId,
      commitHash,
      branch: branchName,
      message: commitHash ? `Progress committed: ${message}` : 'No changes to commit',
    };
  }

  /**
   * Complete a task with final commit
   */
  async completeTask(taskId, finalMessage = '') {
    const task = await this.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const branchName = this.getBranchName(taskId, task.title);

    // Ensure we're on the right branch
    await this.switchToBranch(branchName);

    // Final commit on task branch
    const finalCommitMessage = finalMessage || `Complete task: ${task.title}`;
    const commitHash = await this.commitCode(finalCommitMessage, taskId);

    // Update task status
    await this.updateTaskStatus(taskId, 'done');

    // Log completion
    await this.journal.logOperation('task_completed', {
      taskId,
      title: task.title,
      branch: branchName,
      finalCommit: commitHash,
    });

    return {
      taskId,
      branch: branchName,
      finalCommit: commitHash,
      status: 'done',
      message: `Task completed on branch: ${branchName}`,
    };
  }

  /**
   * Rollback task to specific commit or start
   */
  async rollbackTask(taskId, toCommit = null) {
    const task = await this.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const branchName = this.getBranchName(taskId, task.title);
    await this.switchToBranch(branchName);

    if (toCommit) {
      // Rollback to specific commit
      await this.execGit(`reset --hard ${toCommit}`);
    } else {
      // Rollback to start of task (first commit on branch)
      const startCommit = await this.getTaskStartCommit(branchName);
      await this.execGit(`reset --hard ${startCommit}`);
    }

    // Log rollback
    await this.journal.logOperation('task_rollback', {
      taskId,
      branch: branchName,
      toCommit: toCommit || 'start',
    });

    return {
      taskId,
      branch: branchName,
      rolledBackTo: toCommit || 'start',
      message: `Rolled back task work to ${toCommit || 'task start'}`,
    };
  }

  /**
   * Get commit history for a task
   */
  async getTaskHistory(taskId) {
    const task = await this.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const branchName = this.getBranchName(taskId, task.title);

    try {
      // Switch to task branch
      await this.switchToBranch(branchName);

      // Get commits on task branch
      const commits = await this.execGit(
        `log --oneline --grep="\\[${taskId}\\]" --format="%H|%s|%ad" --date=short`
      );

      if (!commits) return [];

      return commits
        .split('\n')
        .map(line => {
          const [hash, message, date] = line.split('|');
          return {
            hash: hash?.substring(0, 8),
            fullHash: hash,
            message: message?.replace(`[${taskId}] `, ''),
            date,
          };
        })
        .filter(commit => commit.hash);
    } catch (error) {
      return []; // No commits yet
    }
  }

  /**
   * Merge completed task branch to main
   */
  async mergeTaskBranch(taskId, deleteAfterMerge = true) {
    const task = await this.getTask(taskId);
    if (!task || task.status !== 'done') {
      throw new Error(`Task must be completed before merging: ${taskId}`);
    }

    const branchName = this.getBranchName(taskId, task.title);

    // Switch to main branch
    await this.execGit('checkout main');

    // Merge task branch
    await this.execGit(`merge ${branchName} --no-ff -m "Merge task: ${task.title}"`);

    // Optionally delete task branch
    if (deleteAfterMerge) {
      await this.execGit(`branch -d ${branchName}`);
    }

    // Log merge
    await this.journal.logOperation('task_merged', {
      taskId,
      branch: branchName,
      deletedBranch: deleteAfterMerge,
    });

    return {
      taskId,
      merged: true,
      branchDeleted: deleteAfterMerge,
      message: `Task ${taskId} merged to main`,
    };
  }

  // Git operations
  async createTaskBranch(branchName) {
    try {
      // Check if branch exists
      const branches = await this.execGit('branch --list');
      const branchExists = branches.includes(branchName);

      if (branchExists) {
        // Switch to existing branch
        await this.execGit(`checkout ${branchName}`);
        log('info', `Switched to existing branch: ${branchName}`);
      } else {
        // Create new branch from current HEAD
        await this.execGit(`checkout -b ${branchName}`);
        log('info', `Created new branch: ${branchName}`);
      }
    } catch (error) {
      throw new Error(`Failed to create/switch to branch ${branchName}: ${error.message}`);
    }
  }

  async switchToBranch(branchName) {
    try {
      await this.execGit(`checkout ${branchName}`);
    } catch (error) {
      throw new Error(`Failed to switch to branch ${branchName}: ${error.message}`);
    }
  }

  async commitCode(message, taskId, description = '') {
    try {
      // Stage all changes
      await this.execGit('add .');

      // Check if there are changes to commit
      const status = await this.execGit('status --porcelain');
      if (!status.trim()) {
        log('info', 'No changes to commit');
        return null;
      }

      // Create commit with consistent format
      const commitMessage = this.formatCommitMessage(message, taskId, description);
      await this.execGit(`commit -m "${commitMessage}"`);

      // Get commit hash
      const commitHash = await this.execGit('rev-parse HEAD');

      log('info', `Code committed: ${message} (${commitHash.substring(0, 8)})`);
      return commitHash.trim();
    } catch (error) {
      throw new Error(`Failed to commit code: ${error.message}`);
    }
  }

  formatCommitMessage(message, taskId, description) {
    let commit = `[${taskId}] ${message}`;

    if (description) {
      commit += `\n\n${description}`;
    }

    // Add task context
    commit += `\n\nTask-ID: ${taskId}`;
    commit += `\nGenerated-By: perun-flow`;

    return commit;
  }

  getBranchName(taskId, title) {
    // Create clean branch name: task/mbr123-implement-auth
    const cleanTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 30);

    return `task/${taskId}-${cleanTitle}`;
  }

  async getTaskStartCommit(branchName) {
    try {
      // Get the first commit on this branch
      const mergeBase = await this.execGit(`merge-base ${branchName} main`);
      const firstCommit = await this.execGit(
        `rev-list --reverse ${mergeBase}..${branchName} | head -1`
      );
      return firstCommit.trim();
    } catch (error) {
      // Fallback to current HEAD
      return await this.execGit('rev-parse HEAD');
    }
  }

  async execGit(command) {
    const result = await execAsync(`git ${command}`, { cwd: this.codeDir });
    return result.stdout.trim();
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch() {
    try {
      return await this.execGit('rev-parse --abbrev-ref HEAD');
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Check if we're in a Git repository
   */
  async isGitRepo() {
    try {
      await this.execGit('rev-parse --git-dir');
      return true;
    } catch (error) {
      return false;
    }
  }
}
