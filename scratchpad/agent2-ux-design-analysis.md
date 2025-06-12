# UX Design Analysis: Task Decomposition in Perun Flow

## Executive Summary

This document outlines the user experience design for automatic task decomposition in Perun Flow. The design prioritizes user control, transparency, and flexibility while maintaining simplicity for basic use cases.

## Core Design Principles

1. **Progressive Disclosure**: Simple tasks remain simple, complex features reveal themselves when needed
2. **User Agency**: Users maintain control over decomposition decisions
3. **Transparency**: Clear visibility into what the system is doing and why
4. **Graceful Degradation**: System handles failures elegantly without disrupting workflow
5. **Context Awareness**: Decomposition adapts to task type and user preferences

## Recommended User Workflows

### 1. Simple Flow: Auto-Decompose on Creation
**When to use**: For users who want a streamlined experience

```
User: "Create task: Implement user authentication system"
System: 
  - Analyzes task complexity
  - If complex, automatically decomposes
  - Shows preview of subtasks
  - Creates parent + subtasks on confirmation
```

**Example interaction**:
```
> mcp__tasks__create --title "Implement user authentication" --auto-decompose true

System response:
"This task appears complex. Here's a proposed breakdown:
  
Parent: Implement user authentication
├── Set up authentication database schema
├── Create user registration endpoints
├── Implement login/logout functionality
├── Add password reset flow
└── Write authentication tests

Would you like to:
[A]ccept all | [E]dit subtasks | [S]kip decomposition | [C]ancel"
```

### 2. Explicit Flow: Decompose On-Demand
**When to use**: For users who want to create tasks first, decompose later

```
User: Creates task normally
User: Later decides to decompose
System: Analyzes and proposes subtasks
```

**Example interaction**:
```
> mcp__tasks__decompose --task-id "task-123"

System response:
"Analyzing task: 'Refactor payment processing module'
Suggested subtasks:
1. Extract payment validation logic
2. Create payment gateway interface
3. Implement Stripe adapter
4. Add error handling
5. Update tests

[A]ccept | [E]dit | [C]ancel"
```

### 3. Interactive Flow: Guided Decomposition
**When to use**: For complex tasks requiring domain knowledge

```
User: Initiates decomposition with guidance
System: Asks clarifying questions
User: Provides context
System: Creates tailored subtasks
```

**Example interaction**:
```
> mcp__tasks__decompose --task-id "task-456" --interactive true

System: "I'll help break down 'Migrate to microservices'. 
First, what services are you planning to extract?"

User: "User service, payment service, notification service"

System: "What's your migration strategy?"
[1] Big bang (all at once)
[2] Strangler fig (gradual)
[3] Branch by abstraction

User: "2"

System: "Here's a phased breakdown:
Phase 1: Set up infrastructure
├── Configure service mesh
├── Set up CI/CD pipelines
└── Create service templates

Phase 2: Extract user service
├── Define service boundaries
├── Implement API contracts
├── Migrate data
└── Update clients

[Continue with remaining phases...]"
```

### 4. Batch Flow: Multiple Task Decomposition
**When to use**: For project planning or sprint preparation

```
User: Selects multiple tasks
System: Analyzes and decomposes in batch
User: Reviews and approves/modifies
```

**Example interaction**:
```
> mcp__tasks__decompose_batch --status "pending" --priority "high"

System: "Found 4 high-priority tasks to decompose:
  
✓ Task A: 5 subtasks proposed
✓ Task B: 3 subtasks proposed
⚠ Task C: Already appears atomic
✗ Task D: Needs more context

Review: [A]ll | [E]ach individually | [S]kip failed | [C]ancel"
```

## MCP Tool Interface Specifications

### Primary Decomposition Tool

```typescript
interface DecomposeTaskParams {
  task_id: string;
  
  // Decomposition strategy
  strategy?: 'auto' | 'interactive' | 'template';
  
  // Maximum depth of decomposition
  max_depth?: number; // default: 2
  
  // Target subtask count
  target_subtasks?: number; // default: 3-7
  
  // User preferences
  preferences?: {
    granularity?: 'fine' | 'medium' | 'coarse';
    include_tests?: boolean;
    include_docs?: boolean;
    time_estimates?: boolean;
  };
  
  // Interactive mode options
  interactive?: boolean;
  
  // Template to use (if strategy = 'template')
  template_name?: string;
}
```

### Enhanced Create Tool

```typescript
interface CreateTaskParams {
  // Existing parameters...
  title: string;
  description?: string;
  priority?: 'high' | 'medium' | 'low';
  dependencies?: string[];
  
  // New decomposition parameters
  auto_decompose?: boolean; // default: true for tasks > threshold
  decompose_threshold?: 'always' | 'complex' | 'never';
  decompose_strategy?: 'auto' | 'interactive' | 'template';
}
```

### Decomposition Preview Tool

```typescript
interface PreviewDecompositionParams {
  task_id?: string;
  task_description?: string; // For previewing before creation
  strategy?: 'auto' | 'template';
  options?: DecompositionOptions;
}

interface PreviewDecompositionResponse {
  proposed_subtasks: Array<{
    title: string;
    description?: string;
    estimated_effort?: string;
    dependencies?: string[];
  }>;
  confidence: 'high' | 'medium' | 'low';
  warnings?: string[];
}
```

## User Feedback and Confirmation Patterns

### Progressive Confirmation Flow

1. **Automatic Preview** (for auto-decompose):
   ```
   Task created: "Build REST API"
   🔄 Analyzing complexity... Complex task detected.
   
   📋 Proposed subtasks (5):
   • Design API schema
   • Implement endpoints
   • Add authentication
   • Write tests
   • Create documentation
   
   [Accept] [Modify] [Skip] (10s to auto-accept)
   ```

2. **Inline Editing**:
   ```
   📝 Edit subtasks:
   1. Design API schema ✏️
   2. Implement endpoints ✏️
   3. Add authentication ✏️
   4. [+ Add subtask]
   
   [Save changes] [Reset] [Cancel]
   ```

3. **Confidence Indicators**:
   ```
   Decomposition confidence: ⭐⭐⭐⭐☆ (High)
   Based on: Similar tasks in history, clear scope
   
   ⚠️ Note: "Performance optimization" subtask may need refinement
   ```

### Error State Handling

1. **Already Atomic Task**:
   ```
   ℹ️ Task appears to be atomic
   "Fix typo in README" doesn't need decomposition.
   
   [Mark as reviewed] [Force decompose] [Cancel]
   ```

2. **Decomposition Failure**:
   ```
   ❌ Unable to decompose automatically
   Reason: Task description too vague
   
   Would you like to:
   • [Provide more context]
   • [Use a template]
   • [Create subtasks manually]
   • [Skip decomposition]
   ```

3. **Circular Dependency Warning**:
   ```
   ⚠️ Potential circular dependency detected
   "Subtask A" → "Subtask B" → "Subtask A"
   
   [Remove dependency] [Create anyway] [Cancel]
   ```

## Edge Case Handling Strategies

### 1. Ambiguous Task Descriptions
**Strategy**: Interactive clarification
```
Task: "Fix the thing"
System: "I need more context. What needs fixing?"
Options: [Bug] [Feature] [Performance] [UI/UX] [Other...]
```

### 2. Over-Decomposition
**Strategy**: Depth limiting with user override
```
⚠️ Decomposition depth limit reached (level 3)
Current subtasks have 47 items total.

[View hierarchy] [Flatten structure] [Continue anyway]
```

### 3. Conflicting Dependencies
**Strategy**: Visual conflict resolution
```
🔄 Dependency conflict detected:
Task A depends on → Task B
Task B depends on → Task A

Suggested resolutions:
1. Remove A→B dependency
2. Remove B→A dependency
3. Create intermediate task
4. Merge tasks
```

### 4. Partial Decomposition Success
**Strategy**: Graceful partial application
```
Decomposition results:
✅ 3 subtasks created successfully
⚠️ 2 subtasks need review
❌ 1 subtask failed

[Review pending] [Accept partial] [Rollback all]
```

## Task Hierarchy Visualization

### 1. Tree View (Default)
```
🎯 Epic: Launch new product
├── 📦 Feature: User authentication [In Progress]
│   ├── ✅ Set up auth database
│   ├── 🔄 Create login endpoints
│   └── ⏳ Add password reset
├── 📦 Feature: Payment integration [Pending]
│   ├── ⏳ Research payment providers
│   └── ⏳ Implement Stripe
└── 📦 Feature: Admin dashboard [Blocked]
    └── 🚫 Waiting for: Authentication
```

### 2. Kanban Board View
```
┌─────────────┬─────────────┬─────────────┐
│   Pending   │ In Progress │    Done     │
├─────────────┼─────────────┼─────────────┤
│ Parent Task │             │             │
│ ├ Subtask 1 │ ├ Subtask 2 │ ├ Subtask 3 │
│ └ Subtask 4 │             │ └ Subtask 5 │
└─────────────┴─────────────┴─────────────┘
```

### 3. Progress Indicators
```
Authentication System [████████░░] 80%
├── Database schema   [██████████] 100% ✅
├── API endpoints     [████████░░] 80% 🔄
├── Frontend forms    [██████░░░░] 60% 🔄
└── Tests            [████░░░░░░] 40% ⏳
```

### 4. Dependency Graph
```
   ┌─────────┐
   │ Task A  │
   └────┬────┘
        │ depends on
   ┌────▼────┐     ┌─────────┐
   │ Task B  │────►│ Task C  │
   └─────────┘     └─────────┘
                        │
                   ┌────▼────┐
                   │ Task D  │
                   └─────────┘
```

## Decomposition Preferences Management

### User-Level Preferences
```typescript
interface UserDecompositionPrefs {
  // Automatic behavior
  auto_decompose_threshold: 'always' | 'complex' | 'never';
  complexity_indicators: string[]; // Keywords that trigger decomposition
  
  // Decomposition style
  preferred_granularity: 'fine' | 'medium' | 'coarse';
  max_subtasks_per_parent: number;
  include_testing_tasks: boolean;
  include_documentation_tasks: boolean;
  
  // Interaction preferences
  always_preview: boolean;
  auto_accept_timeout: number; // seconds, 0 = never
  preferred_view: 'tree' | 'kanban' | 'list';
}
```

### Project-Level Templates
```yaml
# .perun/decomposition-templates/feature.yaml
name: "Standard Feature Template"
applies_to: 
  - keywords: ["feature", "implement", "add"]
  - min_complexity: "medium"

subtask_template:
  - title: "Design {feature_name} architecture"
    type: "design"
  - title: "Implement {feature_name} backend"
    type: "development"
  - title: "Create {feature_name} UI"
    type: "development"
  - title: "Write {feature_name} tests"
    type: "testing"
  - title: "Document {feature_name}"
    type: "documentation"
```

## Success Metrics

1. **Adoption Rate**: % of complex tasks that use decomposition
2. **Acceptance Rate**: % of proposed decompositions accepted without modification
3. **Time Saved**: Average time reduction in task planning
4. **Dependency Conflicts**: Reduction in circular dependencies
5. **Task Completion Rate**: Improvement in subtask completion

## Implementation Priorities

### Phase 1: MVP
- Basic auto-decomposition on create
- Simple preview and accept/reject flow
- Tree view visualization

### Phase 2: Enhanced Control
- Interactive decomposition mode
- Inline editing of proposals
- Dependency validation

### Phase 3: Intelligence
- Learning from user corrections
- Template system
- Batch operations

### Phase 4: Advanced Features
- Multi-level decomposition
- Time estimation
- Resource allocation
- Team collaboration features

## Conclusion

This UX design balances automation with user control, providing a flexible system that adapts to different working styles and task complexities. The progressive disclosure approach ensures the system remains simple for basic use while offering powerful features for advanced users.

Key success factors:
- Intuitive default behavior
- Clear visual feedback
- Graceful error handling
- Flexible customization options
- Seamless integration with existing workflow

The design prioritizes user trust through transparency and predictability, ensuring that task decomposition enhances rather than complicates the development workflow.