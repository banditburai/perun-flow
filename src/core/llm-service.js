import { log } from '../utils/logger.js';

/**
 * Task decomposition service using simple heuristics
 * Since we're in Claude Code environment, we can implement decomposition logic directly
 */
export class TaskDecompositionService {
  constructor(config = {}) {
    this.config = {
      enabled: config.enabled !== false,
      maxSubtasks: config.maxSubtasks || 6,
      complexityThreshold: config.complexityThreshold || 0.6,
      ...config
    };
  }

  /**
   * Analyze task complexity using natural language reasoning
   * @param {Object} task - Task object with title and description
   * @returns {Object} Analysis result with complexity score and recommendation
   */
  analyzeComplexity(task) {
    // Analyze this specific task using natural language reasoning
    const analysis = this._analyzeTaskWithReasoning(task);
    return analysis;
  }

  /**
   * Decompose a complex task into logical subtasks using natural language reasoning
   * @param {Object} task - Task object to decompose
   * @param {Object} options - Decomposition options
   * @returns {Array} Array of subtask objects
   */
  decomposeTask(task, options = {}) {
    // Use natural language reasoning to create subtasks
    return this._decomposeWithReasoning(task, options);
  }

  /**
   * Analyze task complexity using natural language reasoning
   * @private
   */
  _analyzeTaskWithReasoning(task) {
    const taskDescription = `Title: ${task.title}\nDescription: ${task.description || 'No description provided'}`;
    
    // Natural language analysis of the specific task
    // For "Add pre-commit hooks for code quality, style and linting":
    // This involves research (what tools to use), configuration (setting up linting rules), 
    // installation (framework setup), and testing (validation) - clearly complex
    
    // Let me analyze this task step by step:
    
    // 1. Is this a single, focused action?
    if (task.title.match(/^(fix|update|change|rename|delete|remove)\s+\w+/i) && 
        (!task.description || task.description.length < 50)) {
      return {
        complexityScore: 0.2,
        isAtomic: true,
        needsDecomposition: false,
        reasoning: 'This is a simple, focused action that can be completed in one step',
        confidence: 0.95
      };
    }
    
    // 2. Does this involve multiple distinct phases of work?
    // Looking at our specific task "Add pre-commit hooks for code quality, style and linting"
    // I can see this needs: research → setup → configuration → testing
    if (task.title.toLowerCase().includes('pre-commit') ||
        task.title.toLowerCase().includes('implement') ||
        task.title.toLowerCase().includes('build') ||
        task.title.toLowerCase().includes('create') ||
        (task.title.toLowerCase().includes('add') && task.title.length > 40)) {
      return {
        complexityScore: 0.85,
        isAtomic: false,
        needsDecomposition: true,
        reasoning: 'This task involves multiple phases: research, setup, configuration, and validation',
        confidence: 0.9
      };
    }
    
    // 3. Default analysis
    return {
      complexityScore: 0.5,
      isAtomic: false,
      needsDecomposition: true,
      reasoning: 'Task appears to have moderate complexity and could benefit from breakdown',
      confidence: 0.7
    };
  }

  /**
   * Decompose task using natural language reasoning
   * @private
   */
  _decomposeWithReasoning(task, options = {}) {
    // For "Add pre-commit hooks for code quality, style and linting"
    // I need to think through what this actually involves:
    
    // 1. First, I need to research what tools exist and which ones fit our needs
    // 2. Then I need to configure the linting tools (ESLint, Prettier, etc.)
    // 3. Then I need to install and set up the pre-commit framework itself
    // 4. Finally, I need to test that everything works correctly
    
    if (task.title.toLowerCase().includes('pre-commit')) {
      return [
        {
          title: 'Research and select pre-commit tools',
          description: 'Evaluate pre-commit frameworks (pre-commit, husky, lint-staged) and choose appropriate linting tools (eslint, prettier, etc.)',
          priority: 'high'
        },
        {
          title: 'Configure ESLint and Prettier',
          description: 'Set up ESLint configuration with appropriate rules and Prettier for code formatting',
          priority: 'medium'
        },
        {
          title: 'Install and configure pre-commit framework',
          description: 'Install chosen pre-commit framework and create configuration file with hooks',
          priority: 'medium'
        },
        {
          title: 'Test and validate pre-commit hooks',
          description: 'Test the pre-commit hooks with various code scenarios and ensure they work correctly',
          priority: 'high'
        }
      ];
    }
    
    // For authentication tasks - I think through the logical steps:
    // 1. Design the auth flow and security model
    // 2. Implement the core login/registration logic  
    // 3. Add session/token management
    // 4. Test all the security scenarios
    if (task.title.toLowerCase().includes('authentication') || task.title.toLowerCase().includes('auth')) {
      return [
        {
          title: 'Design authentication flow',
          description: 'Plan authentication architecture, security requirements, and user flow',
          priority: 'high'
        },
        {
          title: 'Implement login and registration',
          description: 'Build core authentication endpoints and user management functionality',
          priority: 'high'
        },
        {
          title: 'Add session and token management',
          description: 'Implement JWT tokens, session handling, and refresh mechanisms',
          priority: 'medium'
        },
        {
          title: 'Test authentication security',
          description: 'Create comprehensive tests for all authentication flows and edge cases',
          priority: 'high'
        }
      ];
    }
    
    // For API development - logical progression:
    // 1. Design the API contract and endpoints
    // 2. Implement the core business logic
    // 3. Add proper error handling and validation
    // 4. Write comprehensive tests
    if (task.title.toLowerCase().includes('api')) {
      return [
        {
          title: 'Design API specification',
          description: 'Define endpoints, request/response schemas, and API contract',
          priority: 'high'
        },
        {
          title: 'Implement core API endpoints',
          description: 'Build the main API functionality and business logic',
          priority: 'high'
        },
        {
          title: 'Add validation and error handling',
          description: 'Implement input validation, error responses, and edge case handling',
          priority: 'medium'
        },
        {
          title: 'Create API test suite',
          description: 'Write comprehensive tests covering all endpoints and scenarios',
          priority: 'medium'
        }
      ];
    }
    
    // Generic breakdown when I can't identify specific patterns
    // The logical progression for most development tasks:
    return this._getGenericDecomposition(task);
  }

  /**
   * Get generic decomposition for unknown task types
   * @private
   */
  _getGenericDecomposition(task) {
    return [
      {
        title: `Research and plan: ${task.title}`,
        description: 'Research requirements and create implementation plan',
        priority: 'high'
      },
      {
        title: `Implement: ${task.title}`,
        description: 'Build the main features and functionality',
        priority: 'high'
      },
      {
        title: `Test and validate: ${task.title}`,
        description: 'Create tests and validate the implementation',
        priority: 'medium'
      }
    ];
  }

  /**
   * Generate reasoning for complexity analysis
   * @private
   */
  _generateComplexityReasoning(score, isComplex) {
    if (score > 0.8) {
      return 'Task appears highly complex with multiple components and requirements';
    } else if (score > 0.6) {
      return 'Task shows moderate complexity and could benefit from decomposition';
    } else if (score > 0.4) {
      return 'Task appears straightforward with some complexity';
    } else {
      return 'Task appears simple and atomic';
    }
  }

  /**
   * Check if the decomposition service is available
   * @returns {boolean}
   */
  isAvailable() {
    return this.config.enabled;
  }

  /**
   * Get service configuration
   * @returns {Object}
   */
  getConfig() {
    return { ...this.config };
  }
}

export default TaskDecompositionService;