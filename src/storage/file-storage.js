import { promises as fs } from 'fs';
import path from 'path';
import { log } from '../utils/logger.js';

/**
 * File storage manager for human-readable task files
 */
export class FileStorage {
  constructor(tasksDir) {
    this.tasksDir = tasksDir;
    this.statusDirs = ['pending', 'in-progress', 'done', 'archive'];
  }

  /**
   * Initialize directory structure
   */
  async initialize() {
    try {
      // Create main tasks directory
      await fs.mkdir(this.tasksDir, { recursive: true });
      
      // Create status subdirectories
      for (const dir of this.statusDirs) {
        await fs.mkdir(path.join(this.tasksDir, dir), { recursive: true });
      }
      
      log('info', 'File storage initialized');
      return true;
    } catch (error) {
      log('error', `Failed to initialize file storage: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate task filename from ID and title
   */
  generateFilename(task) {
    // If semantic ID exists, use it as prefix
    const prefix = task.semantic_id || task.id;
    
    const sanitized = task.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
    
    // Format: STREAM-PHASE.SEQ-id-title.md
    // Example: SYNC-1.01-mbs123-implement-sync-system.md
    return `${prefix}-${task.id}-${sanitized}.md`;
  }

  /**
   * Generate task markdown content
   */
  async generateTaskContent(task) {
    let content = `# ${task.title}\n\n`;
    
    // Metadata section
    content += `**ID:** ${task.id}\n`;
    if (task.semantic_id) {
      content += `**Semantic:** ${task.semantic_id}\n`;
    }
    content += `**Status:** ${task.status}\n`;
    content += `**Priority:** ${task.priority}\n`;
    content += `**Created:** ${task.created_at || new Date().toISOString()}\n`;
    
    
    content += '\n';
    
    // Description
    content += '## Description\n';
    content += `${task.description || 'No description provided.'}\n\n`;
    
    // Subtasks/Checklist
    if (task.subtasks && task.subtasks.length > 0) {
      content += '## Tasks\n';
      for (const subtask of task.subtasks) {
        const checkbox = subtask.is_complete ? '[x]' : '[ ]';
        content += `- ${checkbox} ${subtask.title}\n`;
      }
      content += '\n';
    }
    
    // Dependencies with clickable links
    if (task.dependencies && task.dependencies.length > 0) {
      content += '## Dependencies\n';
      
      for (const dep of task.dependencies) {
        try {
          // Try to find the dependency file
          const depTask = await this.readTaskFile(dep.id);
          if (depTask) {
            // Calculate relative path from current task location
            const currentTaskPath = path.join(this.tasksDir, task.status || 'pending', 'dummy.md');
            const fromDir = path.dirname(currentTaskPath);
            const relativePath = path.relative(fromDir, depTask.file_path);
            
            // Status emoji
            const statusEmoji = {
              'done': '✅',
              'in-progress': '🚧',
              'pending': '⏳',
              'archive': '📦'
            }[depTask.status] || '❓';
            
            // Generate clickable link with proper escaping for spaces
            const escapedPath = relativePath.replace(/ /g, '%20');
            content += `- [${dep.id} - ${depTask.title}](${escapedPath}) ${statusEmoji}\n`;
          } else {
            // Fallback if dependency not found
            content += `- ${dep.id} [${dep.status || 'not found'}]\n`;
          }
        } catch (error) {
          // Fallback on error
          content += `- ${dep.id} [${dep.status || 'unknown'}]\n`;
        }
      }
      content += '\n';
    }
    
    // Files
    if (task.files && task.files.length > 0) {
      content += '## Files\n';
      for (const file of task.files) {
        content += `- ${file}\n`;
      }
      content += '\n';
    }
    
    // Dependents section (what depends on this task) - NEW!
    if (task.dependents && task.dependents.length > 0) {
      content += '## Dependents\n';
      content += '_Tasks that depend on this task:_\n';
      
      for (const dependent of task.dependents) {
        try {
          // Try to find the dependent file
          const depTask = await this.readTaskFile(dependent.id);
          if (depTask) {
            // Calculate relative path from current task location
            const currentTaskPath = path.join(this.tasksDir, task.status || 'pending', 'dummy.md');
            const fromDir = path.dirname(currentTaskPath);
            const relativePath = path.relative(fromDir, depTask.file_path);
            
            // Status emoji
            const statusEmoji = {
              'done': '✅',
              'in-progress': '🚧',
              'pending': '⏳',
              'archive': '📦'
            }[depTask.status] || '❓';
            
            // Generate clickable link with proper escaping for spaces
            const escapedPath = relativePath.replace(/ /g, '%20');
            content += `- [${dependent.id} - ${depTask.title}](${escapedPath}) ${statusEmoji}\n`;
          } else {
            // Fallback if dependent not found
            content += `- ${dependent.id} - ${dependent.title || 'Unknown'} [${dependent.status || 'not found'}]\n`;
          }
        } catch (error) {
          // Fallback on error
          content += `- ${dependent.id} - ${dependent.title || 'Unknown'} [${dependent.status || 'unknown'}]\n`;
        }
      }
      content += '\n';
    }
    
    // Notes section
    content += '## Notes\n';
    if (task.notes && task.notes.length > 0) {
      for (const note of task.notes) {
        content += `### ${note.timestamp}\n${note.content}\n\n`;
      }
    }
    
    return content;
  }

  /**
   * Parse task content from markdown
   */
  parseTaskContent(content, filename) {
    const lines = content.split('\n');
    const task = {
      subtasks: [],
      dependencies: [],
      files: [],
      notes: []
    };
    
    let currentSection = null;
    let noteTimestamp = null;
    let noteContent = [];
    
    for (const line of lines) {
      // Title (H1)
      if (line.startsWith('# ')) {
        task.title = line.substring(2).trim();
        continue;
      }
      
      // Metadata fields
      if (line.startsWith('**ID:** ')) {
        task.id = line.substring(8).trim();
      } else if (line.startsWith('**Semantic:** ')) {
        task.semantic_id = line.substring(14).trim();
      } else if (line.startsWith('**Status:** ')) {
        task.status = line.substring(12).trim();
      } else if (line.startsWith('**Priority:** ')) {
        task.priority = line.substring(14).trim();
      } else if (line.startsWith('**Created:** ')) {
        task.created_at = line.substring(13).trim();
      }
      
      // Section headers
      if (line === '## Description') {
        currentSection = 'description';
        task.description = '';
      } else if (line === '## Tasks') {
        currentSection = 'subtasks';
      } else if (line === '## Dependencies') {
        currentSection = 'dependencies';
      } else if (line === '## Files') {
        currentSection = 'files';
      } else if (line === '## Notes') {
        currentSection = 'notes';
      } else if (line.startsWith('### ') && currentSection === 'notes') {
        // Save previous note if exists
        if (noteTimestamp) {
          task.notes.push({
            timestamp: noteTimestamp,
            content: noteContent.join('\n').trim()
          });
        }
        noteTimestamp = line.substring(4).trim();
        noteContent = [];
      } else if (currentSection === 'description' && !line.startsWith('##')) {
        task.description += line + '\n';
      } else if (currentSection === 'subtasks' && line.startsWith('- ')) {
        const match = line.match(/- \[([ x])\] (.+)/);
        if (match) {
          task.subtasks.push({
            is_complete: match[1] === 'x',
            title: match[2]
          });
        }
      } else if (currentSection === 'dependencies' && line.startsWith('- ')) {
        // Handle both old and new formats
        // New format: - [id - title](path) emoji
        // Old format: - id [status]
        
        // Try new format first
        const newMatch = line.match(/- \[([^\s]+) - ([^\]]+)\]\([^)]+\)\s*(.+)/);
        if (newMatch) {
          const statusMap = {
            '✅': 'done',
            '🚧': 'in-progress',
            '⏳': 'pending',
            '📦': 'archive',
            '❓': 'unknown'
          };
          const emoji = newMatch[3].trim();
          task.dependencies.push({
            id: newMatch[1],
            status: statusMap[emoji] || 'unknown'
          });
        } else {
          // Try old format
          const oldMatch = line.match(/- ([^\s]+)\s*\[([^\]]+)\]/);
          if (oldMatch) {
            task.dependencies.push({
              id: oldMatch[1],
              status: oldMatch[2]
            });
          }
        }
      } else if (currentSection === 'files' && line.startsWith('- ')) {
        task.files.push(line.substring(2).trim());
      } else if (currentSection === 'notes' && noteTimestamp && !line.startsWith('###')) {
        noteContent.push(line);
      }
    }
    
    // Save last note
    if (noteTimestamp) {
      task.notes.push({
        timestamp: noteTimestamp,
        content: noteContent.join('\n').trim()
      });
    }
    
    // Clean up description
    if (task.description) {
      task.description = task.description.trim();
    }
    
    return task;
  }

  /**
   * Create a new task file
   */
  async createTaskFile(task) {
    const filename = this.generateFilename(task);
    const filepath = path.join(this.tasksDir, task.status || 'pending', filename);
    const content = await this.generateTaskContent(task);
    
    await fs.writeFile(filepath, content, 'utf8');
    log('info', `Created task file: ${filename}`);
    
    return filepath;
  }

  /**
   * Read a task file
   */
  async readTaskFile(taskId) {
    // Search for task file in all status directories
    for (const dir of this.statusDirs) {
      const files = await fs.readdir(path.join(this.tasksDir, dir));
      // Look for files that contain the task ID (could have semantic prefix)
      const taskFile = files.find(f => f.includes(`-${taskId}-`));
      
      if (taskFile) {
        const filepath = path.join(this.tasksDir, dir, taskFile);
        const content = await fs.readFile(filepath, 'utf8');
        const task = this.parseTaskContent(content, taskFile);
        task.file_path = filepath;
        task.status = dir; // Status from directory
        return task;
      }
    }
    
    return null;
  }

  /**
   * Update task status by moving file between directories
   */
  async updateTaskStatus(taskId, newStatus) {
    const task = await this.readTaskFile(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    const oldPath = task.file_path;
    const filename = path.basename(oldPath);
    const newPath = path.join(this.tasksDir, newStatus, filename);
    
    // Update status in content
    task.status = newStatus;
    const content = await this.generateTaskContent(task);
    
    // Write to new location
    await fs.writeFile(newPath, content, 'utf8');
    
    // Remove from old location
    await fs.unlink(oldPath);
    
    log('info', `Moved task ${taskId} from ${task.status} to ${newStatus}`);
    
    return newPath;
  }

  /**
   * Add a note to a task
   */
  async addNote(taskId, noteContent) {
    const task = await this.readTaskFile(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    // Add new note
    task.notes.push({
      timestamp: new Date().toISOString(),
      content: noteContent
    });
    
    // Rewrite file
    const content = await this.generateTaskContent(task);
    await fs.writeFile(task.file_path, content, 'utf8');
    
    log('info', `Added note to task ${taskId}`);
  }

  /**
   * List all tasks
   */
  async listAllTasks() {
    const tasks = [];
    
    for (const status of this.statusDirs) {
      const dir = path.join(this.tasksDir, status);
      try {
        const files = await fs.readdir(dir);
        
        for (const file of files) {
          if (file.endsWith('.md')) {
            const filepath = path.join(dir, file);
            const content = await fs.readFile(filepath, 'utf8');
            const task = this.parseTaskContent(content, file);
            task.file_path = filepath;
            task.status = status;
            tasks.push(task);
          }
        }
      } catch (error) {
        // Directory might not exist yet
        log('debug', `Skipping ${status} directory: ${error.message}`);
      }
    }
    
    return tasks;
  }

  /**
   * Delete a task file
   */
  async deleteTaskFile(taskId) {
    const task = await this.readTaskFile(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    await fs.unlink(task.file_path);
    log('info', `Deleted task ${taskId}`);
  }
}

export default FileStorage;