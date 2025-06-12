# Task Decomposition Architecture Analysis for Perun Flow

## Executive Summary

This analysis evaluates architectural approaches for implementing automatic task decomposition in Perun Flow, an MCP-based task management system with dual storage (markdown files + KuzuDB graph). The recommended approach is a **Hybrid LLM-Template System** that provides intelligent decomposition while maintaining system integrity and performance.

## Current Architecture Analysis

### System Overview
Perun Flow follows a layered architecture:
- **MCP Protocol Layer**: Claude Desktop integration
- **Task Manager**: Core business logic with dual storage coordination  
- **Storage Layer**: FileStorage (markdown files) + GraphConnection (KuzuDB)
- **Sync Engine**: Maintains consistency between file and graph storage
- **Journal System**: Operation logging and audit trails

### Key Strengths
1. **Dual Storage Benefits**: Human-readable files + efficient graph queries
2. **Semantic IDs**: Stream-based task organization (API-1.01, UI-2.03, etc.)
3. **Dependency Management**: Graph-based with circular detection
4. **Git Integration**: Branch-per-task workflow via CodeVersionedTaskManager
5. **Sync-on-Demand**: Performance optimization with eventual consistency

### Current Limitations for Decomposition
1. Manual subtask creation only
2. No complexity assessment
3. Limited parent-child relationship modeling in graph
4. No intelligent task breakdown patterns

## Proposed Architecture: Hybrid LLM-Template System

### Core Components

#### 1. Task Complexity Analyzer
```javascript
class TaskComplexityAnalyzer {
  assessComplexity(task) {
    // Multi-factor analysis:
    // - Keyword patterns (build, implement, create)
    // - Estimated scope (from description length/content)
    // - Stream-specific heuristics
    // - Dependency count and depth
    return { isComplex: boolean, confidence: number, reasons: string[] }
  }
}
```

#### 2. Decomposition Engine
```javascript
class DecompositionEngine {
  constructor(llmProvider, templateLibrary, complexityAnalyzer) {
    this.llm = llmProvider;
    this.templates = templateLibrary;
    this.analyzer = complexityAnalyzer;
  }

  async decomposeTask(task) {
    const complexity = this.analyzer.assessComplexity(task);
    
    if (!complexity.isComplex) {
      return { atomic: true, subtasks: [] };
    }

    // Try template-based first (fast)
    const templateResult = this.templates.tryDecompose(task);
    if (templateResult.confidence > 0.8) {
      return templateResult;
    }

    // Fall back to LLM-based (slower but more flexible)
    return await this.llmDecompose(task, templateResult.hints);
  }
}
```

#### 3. Template Library
```javascript
class TaskTemplateLibrary {
  constructor() {
    this.patterns = new Map();
    this.initializePatterns();
  }

  initializePatterns() {
    // API Development Pattern
    this.patterns.set('API-CRUD', {
      triggers: ['api', 'endpoint', 'crud', 'rest'],
      template: [
        'Design API schema and endpoints',
        'Implement data models',
        'Create controller logic', 
        'Add input validation',
        'Write API tests',
        'Add error handling',
        'Document API endpoints'
      ]
    });

    // UI Component Pattern  
    this.patterns.set('UI-COMPONENT', {
      triggers: ['component', 'ui', 'interface', 'frontend'],
      template: [
        'Design component interface',
        'Create component structure',
        'Implement core functionality',
        'Add styling and responsive design',
        'Write component tests',
        'Add accessibility features',
        'Create documentation/storybook'
      ]
    });

    // Feature Implementation Pattern
    this.patterns.set('FEATURE-FULL', {
      triggers: ['feature', 'implement', 'build'],
      template: [
        'Research and design approach',
        'Create database schema changes',
        'Implement backend logic',
        'Create frontend interface',
        'Add comprehensive tests',
        'Update documentation'
      ]
    });
  }
}
```

#### 4. LLM Integration Service
```javascript
class LLMDecompositionService {
  async decomposeWithLLM(task, templateHints = []) {
    const prompt = this.buildPrompt(task, templateHints);
    const response = await this.callLLM(prompt);
    return this.parseResponse(response, task);
  }

  buildPrompt(task, hints) {
    return `
    Analyze this ${task.stream} task and break it into actionable subtasks:
    
    Title: ${task.title}
    Description: ${task.description}
    Dependencies: ${task.dependencies.map(d => d.id).join(', ')}
    
    ${hints.length > 0 ? `Template suggestions: ${hints.join(', ')}` : ''}
    
    Rules:
    1. Each subtask should be completable in 1-4 hours
    2. Maintain logical dependency order
    3. Use action verbs (implement, design, test, etc.)
    4. Be specific and measurable
    5. Consider ${task.stream} stream best practices
    
    Return JSON with subtasks array.
    `;
  }
}
```

### Database Schema Extensions

#### Enhanced Task Node
```cypher
CREATE NODE TABLE Task (
  id STRING,
  semantic_id STRING, 
  title STRING,
  description STRING,
  status STRING,
  priority STRING,
  created_at STRING,
  updated_at STRING,
  file_path STRING,
  is_atomic BOOLEAN,           // NEW: Whether task can be decomposed
  complexity_score DOUBLE,     // NEW: Computed complexity (0.0-1.0)
  auto_generated BOOLEAN,      // NEW: Whether created by decomposition
  PRIMARY KEY(id)
)
```

#### Parent-Child Relationships
```cypher
CREATE REL TABLE PARENT_OF (
  FROM Task TO Task,
  sequence_order INT64,       // Order of subtask in parent
  auto_created BOOLEAN,       // Whether relationship was auto-generated
  decomposition_method STRING // 'template', 'llm', or 'manual'
)
```

### New MCP Tool: `mcp__tasks__decompose`

```javascript
{
  name: 'mcp__tasks__decompose',
  description: 'Automatically decompose a complex task into subtasks',
  inputSchema: {
    type: 'object',
    properties: {
      task_id: { type: 'string', description: 'Task ID to decompose' },
      method: { 
        type: 'string', 
        enum: ['auto', 'template', 'llm'], 
        default: 'auto',
        description: 'Decomposition method' 
      },
      max_subtasks: { 
        type: 'number', 
        default: 10,
        description: 'Maximum number of subtasks to create' 
      },
      force: {
        type: 'boolean',
        default: false,
        description: 'Force decomposition even if task seems atomic'
      }
    },
    required: ['task_id']
  }
}
```

## Integration Strategy

### 1. TaskManager Extensions
```javascript
// Add to TaskManager class
async decomposeTask(taskId, options = {}) {
  const task = await this.getTask(taskId);
  const decomposition = await this.decomposer.decomposeTask(task, options);
  
  if (decomposition.atomic) {
    return { message: 'Task is already atomic', subtasks: [] };
  }

  const createdSubtasks = [];
  for (let i = 0; i < decomposition.subtasks.length; i++) {
    const subtaskData = decomposition.subtasks[i];
    
    // Create subtask with parent dependency
    const subtask = await this.createTask({
      title: subtaskData.title,
      description: subtaskData.description || '',
      priority: task.priority,
      dependencies: i === 0 ? task.dependencies : [createdSubtasks[i-1].id],
      auto_generated: true
    });
    
    // Create parent-child relationship
    await this.graph.createParentChildRelation(taskId, subtask.id, i);
    createdSubtasks.push(subtask);
  }
  
  // Update parent task status
  await this.updateTask(taskId, { 
    is_atomic: false,
    status: 'in-progress' // Parent becomes in-progress when decomposed
  });
  
  return { 
    parent_id: taskId,
    subtasks: createdSubtasks,
    method: decomposition.method
  };
}
```

### 2. File Storage Adaptations
The current markdown format can accommodate decomposition metadata:

```markdown
# Build Authentication System

**ID:** auth-001
**Semantic:** AUTH-1.01
**Status:** in-progress
**Priority:** high
**Created:** 2024-01-15T10:00:00Z
**Is Atomic:** false
**Complexity:** 0.85
**Auto Generated:** false

## Description
Complete authentication system with JWT tokens and role-based access.

## Subtasks
- [ ] [AUTH-1.02 - Design authentication schema](../pending/AUTH-1.02-auth-002-design-auth-schema.md)
- [ ] [AUTH-1.03 - Implement JWT service](../pending/AUTH-1.03-auth-003-implement-jwt-service.md)
- [x] [AUTH-1.04 - Create login endpoints](../done/AUTH-1.04-auth-004-create-login-endpoints.md)

## Dependencies
- [DATA-1.01 - Setup database schema](../done/DATA-1.01-data-001-setup-database.md) ✅

## Notes
### 2024-01-15T10:30:00Z
Task decomposed using template-based method. Generated 7 subtasks based on AUTH-FULL pattern.
```

### 3. Sync Engine Updates
The SyncEngine needs minimal changes since it already handles subtask relationships:

```javascript
// Enhanced sync to handle decomposition metadata
async syncTaskDecomposition(taskId) {
  const fileTask = await this.files.readTaskFile(taskId);
  const graphTask = await this.graph.getTask(taskId);
  
  // Sync decomposition metadata
  if (fileTask.is_atomic !== graphTask.is_atomic) {
    await this.graph.updateTask(taskId, { 
      is_atomic: fileTask.is_atomic,
      complexity_score: fileTask.complexity_score 
    });
  }
  
  // Sync parent-child relationships
  await this.syncParentChildRelations(taskId);
}
```

## Performance Analysis

### Time Complexity
- **Template-based**: O(1) - instant pattern matching
- **LLM-based**: O(n) where n = API latency + processing time
- **Hybrid approach**: Template first (fast path), LLM fallback (quality path)

### Space Complexity
- **Additional storage**: ~10-20% increase for decomposition metadata
- **Graph relationships**: Linear growth with subtask count
- **Memory usage**: Minimal impact due to lazy loading

### Scalability Considerations
1. **LLM Rate Limits**: Implement request queuing and caching
2. **Graph Performance**: KuzuDB handles hierarchical queries efficiently
3. **File I/O**: Batch operations for multiple subtask creation
4. **Template Caching**: In-memory pattern storage for fast access

## Error Handling & Rollback

### Atomic Operations
```javascript
async decomposeTaskWithRollback(taskId, options) {
  const transaction = await this.graph.beginTransaction();
  const createdFiles = [];
  
  try {
    // Decompose and create subtasks
    const result = await this.decomposeTaskInternal(taskId, options);
    
    // Track created files for rollback
    createdFiles.push(...result.subtasks.map(st => st.file_path));
    
    await transaction.commit();
    await this.journal.logDecomposition(taskId, result);
    
    return result;
  } catch (error) {
    await transaction.rollback();
    
    // Clean up created files
    for (const filepath of createdFiles) {
      try {
        await fs.unlink(filepath);
      } catch (cleanupError) {
        log('warn', `Failed to cleanup file: ${filepath}`);
      }
    }
    
    throw error;
  }
}
```

### Validation Rules
1. **Circular Dependency Prevention**: Check before creating subtask dependencies
2. **Semantic ID Conflicts**: Ensure unique IDs within stream-phase
3. **File System Limits**: Validate filename lengths and characters
4. **Graph Constraints**: Respect relationship cardinality limits

## Risk Assessment & Mitigation

### High Risk Items
1. **LLM Dependency**: Service outages, rate limits, quality variations
   - **Mitigation**: Template fallback, caching, multiple providers

2. **Complexity Explosion**: Over-decomposition leading to task proliferation
   - **Mitigation**: Max subtask limits, complexity thresholds, user confirmation

3. **Sync Inconsistencies**: File-graph misalignment during decomposition
   - **Mitigation**: Atomic transactions, comprehensive rollback, sync verification

### Medium Risk Items
1. **Performance Degradation**: LLM calls slowing down task creation
   - **Mitigation**: Async processing, background decomposition, user feedback

2. **Template Quality**: Poor pattern matching leading to incorrect breakdowns
   - **Mitigation**: Template validation, user feedback loops, machine learning

## Implementation Complexity Assessment

### Phase 1: Core Infrastructure (2-3 weeks)
- TaskComplexityAnalyzer implementation
- Database schema extensions
- Basic template library
- MCP tool registration

### Phase 2: Template System (1-2 weeks)
- Stream-specific templates
- Pattern matching algorithms
- Template validation and testing

### Phase 3: LLM Integration (2-3 weeks)
- LLM service abstraction
- Prompt engineering and testing
- Response parsing and validation
- Error handling and fallbacks

### Phase 4: Integration & Testing (1-2 weeks)
- TaskManager integration
- File storage adaptations
- Sync engine updates
- End-to-end testing

**Total Estimated Effort**: 6-10 weeks

## Alternative Approaches Considered

### 1. Pure LLM Approach
**Pros**: Maximum flexibility, intelligent context understanding
**Cons**: Expensive, slow, unreliable, external dependency
**Verdict**: Too risky as sole solution

### 2. Pure Template Approach  
**Pros**: Fast, predictable, deterministic
**Cons**: Limited flexibility, requires manual pattern maintenance
**Verdict**: Good but insufficient for edge cases

### 3. User-Guided Decomposition
**Pros**: Human intelligence, perfect context understanding
**Cons**: Manual overhead, not scalable, breaks automation
**Verdict**: Good for complex cases but not primary solution

### 4. Rule-Based Expert System
**Pros**: Deterministic, explainable, maintainable
**Cons**: Complex rule maintenance, limited adaptability
**Verdict**: Could supplement hybrid approach in future

## Recommendation

**Implement the Hybrid LLM-Template System** as the optimal balance of:
- **Performance**: Template-first for common patterns
- **Quality**: LLM fallback for complex cases
- **Reliability**: Multiple fallback layers
- **Maintainability**: Clear separation of concerns
- **Extensibility**: Easy to add new templates and improve LLM prompts

The architecture leverages Perun Flow's existing strengths (dual storage, semantic IDs, dependency management) while adding intelligent decomposition capabilities that enhance rather than replace the current workflow.

This approach provides immediate value through templates while building toward more sophisticated LLM-powered decomposition, creating a robust foundation for automatic task management that scales with user needs and system capabilities.