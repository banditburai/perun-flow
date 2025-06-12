#!/usr/bin/env node

/**
 * Quick Start Example for Perun Flow
 * 
 * This example demonstrates basic task management operations:
 * 1. Creating tasks with dependencies
 * 2. Finding the next actionable task
 * 3. Updating task status
 * 4. Adding notes
 * 5. Checking dependencies
 */

import { TaskManager } from '../src/core/task-manager.js';
import { FileStorage } from '../src/storage/file-storage.js';
import { GraphConnection } from '../src/storage/graph-connection.js';
import { SyncEngine } from '../src/core/sync-engine.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('🚀 Perun Flow Quick Start Example\n');

  // Initialize components
  const tasksDir = path.join(__dirname, '../.example-tasks');
  const fileStorage = new FileStorage(tasksDir);
  const graphConnection = new GraphConnection(tasksDir);
  const syncEngine = new SyncEngine(fileStorage, graphConnection);

  console.log('📁 Initializing storage...');
  await fileStorage.initialize();
  await graphConnection.initialize();

  const taskManager = new TaskManager(fileStorage, graphConnection, syncEngine);

  try {
    // 1. Create some tasks
    console.log('\n📝 Creating tasks...');
    
    const apiTask = await taskManager.createTask({
      title: 'Build user authentication API',
      description: 'Implement JWT-based authentication endpoints',
      priority: 'high'
    });
    console.log(`✅ Created: ${apiTask.id} - ${apiTask.title}`);

    const dbTask = await taskManager.createTask({
      title: 'Create user database schema',
      description: 'Design and implement user tables with proper indexes',
      priority: 'high'
    });
    console.log(`✅ Created: ${dbTask.id} - ${dbTask.title}`);

    const uiTask = await taskManager.createTask({
      title: 'Build login form component',
      description: 'Create responsive login form with validation',
      priority: 'medium',
      dependencies: [apiTask.id] // UI depends on API
    });
    console.log(`✅ Created: ${uiTask.id} - ${uiTask.title}`);

    // 2. Find next actionable task
    console.log('\n🎯 Finding next actionable task...');
    const nextTask = await taskManager.findNextTask();
    if (nextTask) {
      console.log(`Next task: ${nextTask.id} - ${nextTask.title}`);
      console.log(`Priority: ${nextTask.priority}`);
      console.log(`Stream: ${nextTask.stream}`);
    }

    // 3. Update task status
    console.log('\n📊 Starting work on database task...');
    await taskManager.updateTaskStatus(dbTask.id, 'in-progress');
    console.log(`✅ ${dbTask.id} status updated to: in-progress`);

    // 4. Add a note
    console.log('\n📝 Adding progress note...');
    await taskManager.addNote(dbTask.id, 'Decided to use PostgreSQL with user/profile split');
    console.log(`✅ Note added to ${dbTask.id}`);

    // 5. Check dependencies
    console.log('\n🔗 Checking UI task dependencies...');
    const deps = await taskManager.checkDependencies(uiTask.id);
    console.log(`Task ${uiTask.id} dependencies:`);
    console.log(`- Total dependencies: ${deps.dependencies.length}`);
    console.log(`- Blocking tasks: ${deps.blocking.length}`);
    console.log(`- Ready to start: ${deps.ready ? 'Yes' : 'No'}`);

    // 6. Complete a task
    console.log('\n✅ Completing database task...');
    await taskManager.updateTaskStatus(dbTask.id, 'done');
    console.log(`✅ ${dbTask.id} marked as done`);

    // 7. Check what's next
    console.log('\n🎯 Finding next task after completing DB work...');
    const nextTask2 = await taskManager.findNextTask();
    if (nextTask2) {
      console.log(`Next task: ${nextTask2.id} - ${nextTask2.title}`);
    }

    // 8. Show dependency graph
    console.log('\n📊 Dependency graph for UI task:');
    const graph = await taskManager.getFullDependencyGraph(uiTask.id);
    console.log(`Dependencies: ${graph.dependencies.map(d => d.id).join(', ')}`);
    console.log(`Dependents: ${graph.dependents.map(d => d.id).join(', ')}`);

    // 9. List all tasks
    console.log('\n📋 All tasks:');
    const allTasks = await taskManager.listTasks();
    for (const task of allTasks) {
      console.log(`- ${task.id}: ${task.title} [${task.status}]`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    // Clean up
    await graphConnection.close();
    console.log('\n✨ Example completed!');
    console.log(`Check ${tasksDir} to see the created task files.`);
  }
}

// Run the example
main().catch(console.error);