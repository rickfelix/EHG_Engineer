/**
 * Configuration Constants for Stop Sub-Agent Enforcement
 *
 * Contains all static configuration:
 * - Sub-agent requirements by SD type and category
 * - Timing rules for phase windows
 * - Remediation order
 *
 * @module stop-subagent-enforcement/config
 */

export const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * Sub-agent requirements by SD type and category
 */
export const REQUIREMENTS = {
  byType: {
    feature: {
      required: ['TESTING', 'DESIGN', 'STORIES'],
      recommended: ['UAT', 'API']
    },
    implementation: {
      required: ['TESTING', 'API'],
      recommended: ['DATABASE']
    },
    infrastructure: {
      required: ['GITHUB', 'DOCMON'],
      recommended: ['VALIDATION']
    },
    database: {
      required: ['DATABASE', 'SECURITY'],
      recommended: ['REGRESSION']
    },
    security: {
      required: ['SECURITY', 'DATABASE'],
      recommended: ['TESTING', 'RCA']
    },
    documentation: {
      required: ['DOCMON'],
      recommended: ['VALIDATION']
    },
    bugfix: {
      required: ['RCA', 'REGRESSION', 'TESTING'],
      recommended: ['UAT']
    },
    refactor: {
      required: ['REGRESSION', 'VALIDATION'],
      recommended: ['TESTING']
    },
    performance: {
      required: ['PERFORMANCE', 'TESTING'],
      recommended: ['REGRESSION']
    },
    orchestrator: {
      required: [],
      recommended: ['RETRO']
    }
  },
  byCategory: {
    'Quality Assurance': ['TESTING', 'UAT', 'VALIDATION'],
    'quality': ['TESTING', 'UAT', 'VALIDATION'],
    'testing': ['TESTING', 'UAT'],
    'audit': ['VALIDATION', 'RCA'],
    'security': ['SECURITY', 'RISK'],
    'bug_fix': ['RCA', 'REGRESSION'],
    'ux_improvement': ['DESIGN', 'UAT'],
    'UX Improvement': ['DESIGN', 'UAT'],
    'product_feature': ['DESIGN', 'STORIES', 'API'],
    'database': ['DATABASE'],
    'database_schema': ['DATABASE', 'SECURITY']
  },
  universal: ['RETRO']
};

/**
 * Timing rules for sub-agent execution windows
 */
export const TIMING_RULES = {
  DESIGN: { after: 'LEAD-TO-PLAN', before: 'PLAN-TO-EXEC', phase: 'PLAN' },
  STORIES: { after: 'LEAD-TO-PLAN', before: 'PLAN-TO-EXEC', phase: 'PLAN' },
  API: { after: 'LEAD-TO-PLAN', before: 'PLAN-TO-EXEC', phase: 'PLAN' },
  DATABASE: { after: 'LEAD-TO-PLAN', before: 'EXEC-TO-PLAN', phase: 'PLAN/EXEC' },
  TESTING: { after: 'PLAN-TO-EXEC', before: 'LEAD-FINAL-APPROVAL', phase: 'EXEC' },
  REGRESSION: { after: 'PLAN-TO-EXEC', before: 'EXEC-TO-PLAN', phase: 'EXEC' },
  PERFORMANCE: { after: 'PLAN-TO-EXEC', before: 'EXEC-TO-PLAN', phase: 'EXEC' },
  SECURITY: { after: null, before: 'LEAD-FINAL-APPROVAL', phase: 'ANY' },
  UAT: { after: 'EXEC-TO-PLAN', before: 'LEAD-FINAL-APPROVAL', phase: 'VERIFICATION' },
  VALIDATION: { after: null, before: 'LEAD-FINAL-APPROVAL', phase: 'ANY' },
  RCA: { after: null, before: null, phase: 'EARLY' },
  RETRO: { after: 'PLAN-TO-LEAD', before: null, phase: 'COMPLETION' },
  GITHUB: { after: 'PLAN-TO-EXEC', before: 'LEAD-FINAL-APPROVAL', phase: 'EXEC' },
  DOCMON: { after: null, before: 'LEAD-FINAL-APPROVAL', phase: 'ANY' },
  RISK: { after: null, before: 'PLAN-TO-EXEC', phase: 'EARLY' }
};

/**
 * Order in which to remediate missing sub-agents
 */
export const REMEDIATION_ORDER = [
  'RCA', 'DESIGN', 'STORIES', 'DATABASE', 'API', 'SECURITY',
  'TESTING', 'REGRESSION', 'PERFORMANCE', 'UAT', 'VALIDATION',
  'GITHUB', 'DOCMON', 'RETRO'
];

/**
 * Get required and recommended sub-agents for an SD
 *
 * @param {Object} sd - Strategic Directive
 * @returns {{ required: Set<string>, recommended: Set<string> }}
 */
export function getRequiredSubAgents(sd) {
  const sdType = sd.sd_type || 'feature';
  const category = sd.category || '';

  const typeReqs = REQUIREMENTS.byType[sdType] || { required: [], recommended: [] };
  const categoryReqs = REQUIREMENTS.byCategory[category] || [];

  const required = new Set([...typeReqs.required, ...categoryReqs]);
  const recommended = new Set(typeReqs.recommended);

  // Add universal if near completion
  if (['PLAN', 'LEAD', 'PLAN_VERIFY', 'LEAD_FINAL'].includes(sd.current_phase)) {
    REQUIREMENTS.universal.forEach(s => required.add(s));
  }

  return { required, recommended };
}
