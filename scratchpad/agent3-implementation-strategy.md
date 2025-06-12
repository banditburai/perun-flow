# Task Decomposition Implementation Strategy

## Executive Summary

This document outlines a practical 4-phase implementation strategy for adding AI-powered task decomposition capability to Perun Flow. The approach preserves the existing 170 passing tests while cleanly integrating new functionality through careful architectural extensions.

## Current Architecture Analysis

Perun Flow has a well-architected system with:
- **Dual Storage**: File storage (human-readable) + KuzuDB (graph queries)
- **Sync Engine**: Maintains consistency between storage layers
- **MCP Protocol**: 15 tools for task management and Git workflow
- **Existing Subtask Support**: Basic checklist functionality already exists
- **Test Coverage**: 170 passing tests providing safety net

## 4-Phase Implementation Plan

### Phase 1: Foundation (Database & Core Extensions)
**Duration**: 2-3 days
**Risk Level**: Low

#### Database Schema Changes
1. **Add Parent-Child Relationship**
   ```sql
   CREATE REL TABLE IS_PARENT_OF (
     FROM Task TO Task,
     decomposition_id STRING,
     position INT64,
     created_at STRING
   )
   ```

2. **Extend Task Node Properties**
   ```sql
   -- Add to existing Task table:
   is_decomposed BOOLEAN DEFAULT false,
   decomposition_strategy STRING,
   parent_task_id STRING
   ```

#### TaskManager Core Extensions
1. **New Methods**:
   - `decomposeTask(taskId, subtaskTitles, options)`
   - `getTaskHierarchy(taskId)`
   - `findDecomposableTask()`

2. **Modified Methods**:
   - `findNextTask()` - prioritize subtasks of in-progress parent tasks
   - `createTask()` - handle parent-child relationships

#### Testing Strategy
- Unit tests for new database schema
- Unit tests for new TaskManager methods
- Integration tests for parent-child relationships
- Ensure all existing tests still pass

### Phase 2: LLM Integration Layer
**Duration**: 3-4 days
**Risk Level**: Medium

#### LLM Service Implementation
1. **Create `src/core/llm-service.js`**
   ```javascript
   export class LLMService {
     async decomposeTask(task, options = {}) {
       // Call to Claude API for task breakdown
       // Return array of subtask objects
     }
     
     async suggestNextActions(context) {
       // Suggest what to work on next
     }
   }
   ```

2. **Integration Strategy**:
   - Environment variables for API configuration
   - Graceful fallback when LLM unavailable
   - Rate limiting and error handling
   - Configurable decomposition depth

#### Enhanced Task Decomposition
1. **Smart Decomposition Options**:
   - Automatic vs manual decomposition
   - Decomposition depth limits (max 3 levels)
   - Context-aware suggestions based on task type
   - Integration with existing stream detection

2. **Decomposition Context**:
   - Include project files and structure
   - Consider existing dependencies
   - Respect semantic ID patterns

#### Testing Strategy
- Mock LLM service for reliable testing
- Test decomposition with various task types
- Test error handling and fallback scenarios
- Performance tests for decomposition operations

### Phase 3: Enhanced UX & MCP Tools
**Duration**: 2-3 days
**Risk Level**: Low

#### New MCP Tools
1. **`mcp__tasks__decompose`**
   ```javascript
   {
     name: 'mcp__tasks__decompose',
     description: 'Decompose a task into smaller subtasks using AI',
     inputSchema: {
       properties: {
         task_id: { type: 'string' },
         strategy: { 
           type: 'string', 
           enum: ['automatic', 'guided', 'manual'] 
         },
         max_depth: { type: 'number', default: 2 }
       }
     }
   }
   ```

2. **`mcp__tasks__hierarchy`**
   - Get full task hierarchy tree
   - Show parent-child relationships
   - Display completion progress

3. **Enhanced `mcp__tasks__next`**
   - Prioritize decomposed subtasks
   - Suggest decomposition for large tasks
   - Show hierarchy context

#### File Storage Enhancements
1. **Enhanced Markdown Generation**:
   - Show parent task links
   - Display child tasks with progress
   - Hierarchical task visualization
   - Clickable navigation between levels

2. **Improved Task Parsing**:
   - Parse parent-child relationships
   - Handle decomposition metadata
   - Maintain backward compatibility

#### Testing Strategy
- End-to-end MCP tool testing
- UI/markdown rendering tests
- Tool integration with Claude Desktop
- Backward compatibility verification

### Phase 4: Advanced Features & Optimization
**Duration**: 3-4 days
**Risk Level**: Low

#### Smart Workflow Features
1. **Intelligent Task Ordering**:
   - Auto-prioritize based on decomposition
   - Consider parent task urgency
   - Balance breadth vs depth of work

2. **Progress Aggregation**:
   - Calculate parent task completion from children
   - Show hierarchy-aware progress in Git commits
   - Update parent status when all children complete

3. **Decomposition Analytics**:
   - Track decomposition effectiveness
   - Suggest optimal task sizes
   - Learn from user preferences

#### Performance Optimizations
1. **Caching Strategy**:
   - Cache LLM decomposition results
   - Efficient hierarchy queries
   - Smart sync engine updates

2. **Batch Operations**:
   - Bulk decomposition operations
   - Efficient parent-child creation
   - Optimized graph traversals

#### Advanced Testing
- Performance benchmarks
- Load testing with deep hierarchies
- Long-running integration tests
- Memory usage optimization

## Required Code Changes

### Core Files to Modify

1. **`src/core/task-manager.js`** (Major)
   - Add decomposition methods
   - Extend findNextTask logic
   - Handle parent-child relationships

2. **`src/storage/graph-connection.js`** (Medium)
   - Add IS_PARENT_OF relationship schema
   - New queries for hierarchy operations
   - Extend findNextTask to prioritize subtasks

3. **`src/storage/file-storage.js`** (Medium)
   - Enhanced markdown generation
   - Parse parent-child relationships
   - Improved task linking

4. **`src/mcp/tools/index.js`** (Medium)
   - Add decomposition tools
   - Enhance existing tool responses
   - Better hierarchy visualization

### New Files to Create

1. **`src/core/llm-service.js`** - LLM integration
2. **`src/core/decomposition-engine.js`** - Decomposition logic
3. **`tests/unit/decomposition-engine.test.js`** - Unit tests
4. **`tests/integration/task-decomposition.test.js`** - Integration tests

## Testing Strategy

### Test Structure
```
tests/
├── unit/
│   ├── decomposition-engine.test.js
│   ├── llm-service.test.js
│   └── task-hierarchy.test.js
├── integration/
│   ├── task-decomposition.test.js
│   └── parent-child-workflows.test.js
└── e2e/
    └── decomposition-mcp-tools.test.js
```

### Test Coverage Goals
- Maintain 100% pass rate on existing tests
- 90%+ coverage on new decomposition features
- Performance benchmarks for hierarchy operations
- Error handling for LLM failures

### Mock Strategy
- Mock LLM service for deterministic testing
- Use test fixtures for decomposition scenarios
- Mock external API calls
- Simulate various failure modes

## Risk Mitigation

### Architecture Risks
- **Mitigation**: Feature flags for decomposition functionality
- **Fallback**: Graceful degradation when LLM unavailable
- **Testing**: Comprehensive regression test suite

### Performance Risks
- **Mitigation**: Implement caching and lazy loading
- **Monitoring**: Add performance metrics for hierarchy queries
- **Limits**: Enforce maximum decomposition depth

### Integration Risks
- **Mitigation**: Backward compatibility testing
- **Documentation**: Clear migration guide for existing users
- **Rollback**: Easy disable mechanism for decomposition features

### LLM Risks
- **Mitigation**: Robust error handling and retries
- **Fallback**: Manual decomposition when AI fails
- **Cost Control**: Rate limiting and request optimization

## Success Metrics

### Technical Metrics
- All 170+ existing tests continue to pass
- New decomposition features have 90%+ test coverage
- Performance degradation < 5% for existing operations
- Memory usage increase < 10%

### Feature Metrics
- Successful task decomposition in < 5 seconds
- Hierarchy queries complete in < 100ms
- LLM service availability > 95%
- User-friendly error messages for all failure modes

### User Experience Metrics
- Intuitive decomposition workflow
- Clear parent-child task visualization
- Seamless integration with existing Git workflow
- Helpful AI suggestions without being intrusive

## Conclusion

This implementation strategy provides a practical, low-risk approach to adding task decomposition to Perun Flow. The phased approach allows for incremental delivery while maintaining system stability. The focus on testing and backward compatibility ensures that existing users aren't disrupted while new capabilities are added.

The key insight is leveraging Perun Flow's existing subtask infrastructure and extending it with AI-powered decomposition, rather than building an entirely new system. This approach minimizes risk while maximizing value delivery.