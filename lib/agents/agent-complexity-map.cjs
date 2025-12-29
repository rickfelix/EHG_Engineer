/**
 * Agent Complexity Map
 *
 * Infers task complexity from agent type and context.
 * Used to determine which checks to apply (e.g., tunnel vision).
 *
 * Priority:
 * 1. Orchestrator-provided complexity (context.complexity)
 * 2. Orchestrator-provided taskType (context.taskType)
 * 3. Fallback: Agent type inference
 *
 * @module lib/agents/agent-complexity-map
 */

/**
 * Complexity levels
 */
const COMPLEXITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

/**
 * Agent type to complexity mapping (FALLBACK)
 */
const AGENT_COMPLEXITY_MAP = {
  // HIGH complexity - always require tunnel vision check
  'SECURITY': COMPLEXITY.HIGH,
  'DATABASE': COMPLEXITY.HIGH,
  'ARCHITECT': COMPLEXITY.HIGH,
  'RISK': COMPLEXITY.HIGH,
  'API': COMPLEXITY.HIGH,

  // MEDIUM complexity - require tunnel vision check
  'DESIGN': COMPLEXITY.MEDIUM,
  'PERFORMANCE': COMPLEXITY.MEDIUM,
  'TESTING': COMPLEXITY.MEDIUM,
  'REGRESSION': COMPLEXITY.MEDIUM,
  'UAT': COMPLEXITY.MEDIUM,
  'STORIES': COMPLEXITY.MEDIUM,

  // LOW complexity - exempt from tunnel vision check
  'VALIDATION': COMPLEXITY.LOW,
  'DEPENDENCY': COMPLEXITY.LOW,
  'DOCMON': COMPLEXITY.LOW,
  'GITHUB': COMPLEXITY.LOW,
  'RETRO': COMPLEXITY.LOW,

  // Default for unknown agents
  'DEFAULT': COMPLEXITY.MEDIUM
};

/**
 * Task type to complexity mapping (PRIMARY)
 */
const TASK_TYPE_COMPLEXITY = {
  // LOW complexity tasks
  'retrieval': COMPLEXITY.LOW,
  'verification': COMPLEXITY.LOW,
  'simple_lookup': COMPLEXITY.LOW,
  'status_check': COMPLEXITY.LOW,
  'format_check': COMPLEXITY.LOW,

  // MEDIUM complexity tasks
  'analysis': COMPLEXITY.MEDIUM,
  'review': COMPLEXITY.MEDIUM,
  'validation': COMPLEXITY.MEDIUM,
  'testing': COMPLEXITY.MEDIUM,

  // HIGH complexity tasks
  'planning': COMPLEXITY.HIGH,
  'architecture': COMPLEXITY.HIGH,
  'security_audit': COMPLEXITY.HIGH,
  'design_decision': COMPLEXITY.HIGH,
  'risk_assessment': COMPLEXITY.HIGH,

  // CRITICAL complexity tasks
  'production_deployment': COMPLEXITY.CRITICAL,
  'data_migration': COMPLEXITY.CRITICAL,
  'security_fix': COMPLEXITY.CRITICAL
};

/**
 * Complexity ordering for comparison
 */
const COMPLEXITY_ORDER = [
  COMPLEXITY.LOW,
  COMPLEXITY.MEDIUM,
  COMPLEXITY.HIGH,
  COMPLEXITY.CRITICAL
];

/**
 * Infer complexity from agent and context
 *
 * @param {Object} agent - Agent instance or config
 * @param {Object} context - Execution context
 * @returns {string} Complexity level
 */
function inferComplexity(agent, context = {}) {
  // PRIMARY: Use orchestrator-provided complexity
  if (context.complexity && COMPLEXITY_ORDER.includes(context.complexity)) {
    return context.complexity;
  }

  // PRIMARY: Use orchestrator-provided taskType
  if (context.taskType && TASK_TYPE_COMPLEXITY[context.taskType]) {
    return TASK_TYPE_COMPLEXITY[context.taskType];
  }

  // FALLBACK: Infer from agent type
  const agentType = getAgentType(agent);
  return AGENT_COMPLEXITY_MAP[agentType] || AGENT_COMPLEXITY_MAP['DEFAULT'];
}

/**
 * Get agent type from agent instance or config
 * @param {Object} agent - Agent instance or config
 * @returns {string} Agent type
 */
function getAgentType(agent) {
  if (!agent) return 'DEFAULT';

  // Try various ways to get agent type
  if (typeof agent === 'string') return agent.toUpperCase();
  if (agent.type) return agent.type.toUpperCase();
  if (agent.agentType) return agent.agentType.toUpperCase();
  if (agent.name) {
    // Extract type from name (e.g., "SecurityAgent" -> "SECURITY")
    const match = agent.name.match(/^(\w+?)(?:Agent|SubAgent)?$/i);
    if (match) return match[1].toUpperCase();
  }
  if (agent.code) return agent.code.toUpperCase();

  return 'DEFAULT';
}

/**
 * Compare complexity levels
 * @param {string} a - First complexity
 * @param {string} b - Second complexity
 * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
 */
function compareComplexity(a, b) {
  const indexA = COMPLEXITY_ORDER.indexOf(a);
  const indexB = COMPLEXITY_ORDER.indexOf(b);
  if (indexA < indexB) return -1;
  if (indexA > indexB) return 1;
  return 0;
}

/**
 * Check if complexity meets or exceeds threshold
 * @param {string} complexity - Complexity to check
 * @param {string} threshold - Minimum threshold
 * @returns {boolean}
 */
function meetsComplexityThreshold(complexity, threshold) {
  return compareComplexity(complexity, threshold) >= 0;
}

/**
 * Check if task type is exempt from certain checks
 * @param {string} taskType - Task type to check
 * @param {Array} exemptTypes - List of exempt task types
 * @returns {boolean}
 */
function isTaskTypeExempt(taskType, exemptTypes = []) {
  if (!taskType) return false;
  return exemptTypes.includes(taskType.toLowerCase());
}

/**
 * Get complexity description for logging
 * @param {string} complexity - Complexity level
 * @returns {string} Human-readable description
 */
function getComplexityDescription(complexity) {
  const descriptions = {
    [COMPLEXITY.LOW]: 'Simple task - tunnel vision check exempt',
    [COMPLEXITY.MEDIUM]: 'Standard task - requires basic validation',
    [COMPLEXITY.HIGH]: 'Complex task - requires alternatives analysis',
    [COMPLEXITY.CRITICAL]: 'Critical task - requires full audit and review'
  };
  return descriptions[complexity] || 'Unknown complexity';
}

module.exports = {
  // Constants
  COMPLEXITY,
  AGENT_COMPLEXITY_MAP,
  TASK_TYPE_COMPLEXITY,
  COMPLEXITY_ORDER,

  // Functions
  inferComplexity,
  getAgentType,
  compareComplexity,
  meetsComplexityThreshold,
  isTaskTypeExempt,
  getComplexityDescription
};
