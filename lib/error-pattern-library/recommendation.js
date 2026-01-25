/**
 * Sub-Agent Recommendation
 * Part of SD-LEO-REFAC-ERR-PATTERN-004
 *
 * Functions for recommending sub-agents based on error patterns.
 */

import { ERROR_CATEGORIES, SEVERITY_LEVELS } from './constants.js';
import { ERROR_PATTERNS } from './patterns/index.js';
import { SUB_AGENT_SPECIALTIES } from './sub-agent-mapping.js';

/**
 * Recommend sub-agent(s) for error resolution
 * @param {object} errorInfo - Error information from detectError()
 * @returns {object} Sub-agent recommendation with invocation details
 */
export function recommendSubAgent(errorInfo) {
  if (!errorInfo || !errorInfo.subAgents || errorInfo.subAgents.length === 0) {
    return {
      recommended: [],
      reason: 'No specific sub-agent recommended for this error'
    };
  }

  const recommendations = errorInfo.subAgents.map(agentCode => {
    const agent = SUB_AGENT_SPECIALTIES[agentCode];
    return {
      code: agentCode,
      name: agent?.name || agentCode,
      expertise: agent?.expertise || [],
      priority: errorInfo.severity === SEVERITY_LEVELS.CRITICAL ? 'IMMEDIATE' :
                errorInfo.severity === SEVERITY_LEVELS.HIGH ? 'HIGH' :
                errorInfo.severity === SEVERITY_LEVELS.MEDIUM ? 'NORMAL' : 'LOW',
      autoInvoke: errorInfo.severity === SEVERITY_LEVELS.CRITICAL ||
                  errorInfo.severity === SEVERITY_LEVELS.HIGH,
      confidence: errorInfo.confidence
    };
  });

  return {
    recommended: recommendations,
    errorId: errorInfo.id,
    category: errorInfo.category,
    severity: errorInfo.severity,
    diagnosis: errorInfo.diagnosis,
    autoRecovery: errorInfo.autoRecovery,
    autoRecoverySteps: errorInfo.autoRecoverySteps || [],
    reason: `Error pattern '${errorInfo.id}' matched with ${errorInfo.confidence}% confidence`
  };
}

/**
 * Get all error patterns for a specific category
 * @param {string} category - Error category
 * @returns {array} Array of error patterns
 */
export function getPatternsByCategory(category) {
  return ERROR_PATTERNS.filter(p => p.category === category);
}

/**
 * Get all error patterns that recommend a specific sub-agent
 * @param {string} subAgentCode - Sub-agent code (e.g., 'DATABASE')
 * @returns {array} Array of error patterns
 */
export function getPatternsBySubAgent(subAgentCode) {
  return ERROR_PATTERNS.filter(p => p.subAgents.includes(subAgentCode));
}

/**
 * Get statistics about the error pattern library
 * @returns {object} Statistics object
 */
export function getLibraryStats() {
  return {
    totalPatterns: ERROR_PATTERNS.length,
    categoryCount: Object.keys(ERROR_CATEGORIES).length,
    subAgentCount: Object.keys(SUB_AGENT_SPECIALTIES).length,
    byCategory: Object.keys(ERROR_CATEGORIES).reduce((acc, cat) => {
      acc[cat] = getPatternsByCategory(ERROR_CATEGORIES[cat]).length;
      return acc;
    }, {}),
    bySeverity: Object.keys(SEVERITY_LEVELS).reduce((acc, sev) => {
      acc[sev] = ERROR_PATTERNS.filter(p => p.severity === SEVERITY_LEVELS[sev]).length;
      return acc;
    }, {}),
    bySubAgent: Object.keys(SUB_AGENT_SPECIALTIES).reduce((acc, agent) => {
      acc[agent] = getPatternsBySubAgent(agent).length;
      return acc;
    }, {}),
    autoRecoverableCount: ERROR_PATTERNS.filter(p => p.autoRecovery).length
  };
}
