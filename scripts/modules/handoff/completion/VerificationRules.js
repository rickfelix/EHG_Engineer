/**
 * VerificationRules Engine
 *
 * SD-REFACTOR-VERIFY-001 Phase 1: Pure Rule Functions
 *
 * Discrete, named verification rules as pure functions.
 * Each rule:
 * - Has a unique ruleId
 * - Takes (input, context) and returns { passed, score, issues, warnings }
 * - Has no side effects (logging is handled by orchestrator)
 * - Can be unit-tested in isolation
 *
 * @module completion/VerificationRules
 */

/**
 * @typedef {Object} RuleResult
 * @property {boolean} passed - Whether the rule passed
 * @property {number} score - Score out of maxScore
 * @property {number} maxScore - Maximum possible score
 * @property {string[]} issues - Blocking issues
 * @property {string[]} warnings - Non-blocking warnings
 * @property {Object} [details] - Additional context
 */

/**
 * Rule registry - maps ruleId to rule function
 * Rules are registered in execution order for deterministic behavior
 */
const RULE_REGISTRY = new Map();

/**
 * Rule execution order per handoff type
 * Explicit ordering prevents non-deterministic Object key iteration
 */
export const RULE_ORDER = {
  'LEAD-TO-PLAN': [
    'SD_EXISTS',
    'SD_STATUS_VALID',
    'SD_COMPLETENESS',
    'EXPLORATION_PRESENT',
    'SUCCESS_CRITERIA_DEFINED'
  ],
  'PLAN-TO-EXEC': [
    'SD_EXISTS',
    'SD_STATUS_VALID',
    'PRD_EXISTS',
    'PRD_STATUS_READY',
    'USER_STORIES_EXIST',
    'EXPLORATION_AUDIT',
    'EXEC_CHECKLIST_VALID'
  ],
  'EXEC-TO-PLAN': [
    'SD_EXISTS',
    'SD_STATUS_VALID',
    'PRD_EXISTS',
    'USER_STORIES_COMPLETE',
    'DELIVERABLES_COMPLETE',
    'TESTS_PASSING'
  ],
  'PLAN-TO-LEAD': [
    'SD_EXISTS',
    'SD_STATUS_VALID',
    'PRD_EXISTS',
    'EXEC_COMPLETE',
    'RETROSPECTIVE_EXISTS'
  ],
  'ORCHESTRATOR_COMPLETION': [
    'SD_EXISTS',
    'SD_IS_ORCHESTRATOR',
    'CHILDREN_COMPLETE',
    'HANDOFFS_COMPLETE',
    'PRD_EXISTS',
    'RETROSPECTIVE_EXISTS'
  ]
};

// ============================================================================
// Rule Definitions - Pure Functions
// ============================================================================

/**
 * SD_EXISTS: Verify SD exists in database
 */
RULE_REGISTRY.set('SD_EXISTS', {
  id: 'SD_EXISTS',
  name: 'Strategic Directive Exists',
  description: 'Verify the SD exists in the database',
  maxScore: 10,
  execute: async (input) => {
    if (!input.sd) {
      return {
        passed: false,
        score: 0,
        maxScore: 10,
        issues: [`SD ${input.sdId} not found in database`],
        warnings: []
      };
    }

    return {
      passed: true,
      score: 10,
      maxScore: 10,
      issues: [],
      warnings: [],
      details: { sdTitle: input.sd.title }
    };
  }
});

/**
 * SD_STATUS_VALID: Verify SD status is appropriate for handoff
 */
RULE_REGISTRY.set('SD_STATUS_VALID', {
  id: 'SD_STATUS_VALID',
  name: 'SD Status Valid',
  description: 'Verify SD status allows this handoff',
  maxScore: 10,
  execute: async (input) => {
    const validStatuses = {
      'LEAD-TO-PLAN': ['draft', 'active', 'in_progress'],
      'PLAN-TO-EXEC': ['draft', 'active', 'in_progress'],
      'EXEC-TO-PLAN': ['active', 'in_progress'],
      'PLAN-TO-LEAD': ['active', 'in_progress'],
      'ORCHESTRATOR_COMPLETION': ['active', 'in_progress', 'orchestrator_pending']
    };

    const allowed = validStatuses[input.handoffType] || ['active', 'in_progress'];
    const status = input.sd?.status?.toLowerCase() || 'unknown';

    if (!allowed.includes(status)) {
      return {
        passed: false,
        score: 0,
        maxScore: 10,
        issues: [`SD status '${status}' not valid for ${input.handoffType}. Expected: ${allowed.join(', ')}`],
        warnings: []
      };
    }

    return {
      passed: true,
      score: 10,
      maxScore: 10,
      issues: [],
      warnings: []
    };
  }
});

/**
 * SD_COMPLETENESS: Verify SD has required fields populated
 */
RULE_REGISTRY.set('SD_COMPLETENESS', {
  id: 'SD_COMPLETENESS',
  name: 'SD Completeness',
  description: 'Verify SD has required fields for handoff',
  maxScore: 20,
  execute: async (input) => {
    const sd = input.sd;
    if (!sd) {
      return {
        passed: false,
        score: 0,
        maxScore: 20,
        issues: ['SD data not available'],
        warnings: []
      };
    }

    const requiredFields = ['title', 'description', 'category'];
    const missing = requiredFields.filter(f => !sd[f]);

    const recommendedFields = ['success_criteria', 'success_metrics'];
    const missingRecommended = recommendedFields.filter(f => {
      const val = sd[f];
      return !val || (Array.isArray(val) && val.length === 0);
    });

    const score = missing.length === 0 ? 20 : Math.max(0, 20 - missing.length * 5);

    return {
      passed: missing.length === 0,
      score,
      maxScore: 20,
      issues: missing.map(f => `Required field '${f}' is missing`),
      warnings: missingRecommended.map(f => `Recommended field '${f}' is empty`)
    };
  }
});

/**
 * EXPLORATION_PRESENT: Verify exploration_summary exists on SD
 */
RULE_REGISTRY.set('EXPLORATION_PRESENT', {
  id: 'EXPLORATION_PRESENT',
  name: 'Exploration Present',
  description: 'Verify SD has exploration_summary',
  maxScore: 15,
  execute: async (input) => {
    const exploration = input.sd?.exploration_summary;

    if (!exploration) {
      return {
        passed: false,
        score: 0,
        maxScore: 15,
        issues: ['exploration_summary is missing from SD'],
        warnings: []
      };
    }

    // Check for files_explored array
    const files = Array.isArray(exploration) ? exploration :
                  exploration.files_explored || [];

    if (files.length === 0) {
      return {
        passed: false,
        score: 5,
        maxScore: 15,
        issues: ['No files documented in exploration_summary'],
        warnings: []
      };
    }

    const score = files.length >= 5 ? 15 : files.length >= 3 ? 10 : 5;

    return {
      passed: true,
      score,
      maxScore: 15,
      issues: [],
      warnings: files.length < 5 ? [`Only ${files.length} files explored (5+ recommended)`] : [],
      details: { fileCount: files.length }
    };
  }
});

/**
 * SUCCESS_CRITERIA_DEFINED: Verify success criteria exist
 */
RULE_REGISTRY.set('SUCCESS_CRITERIA_DEFINED', {
  id: 'SUCCESS_CRITERIA_DEFINED',
  name: 'Success Criteria Defined',
  description: 'Verify SD has success criteria',
  maxScore: 10,
  execute: async (input) => {
    const criteria = input.sd?.success_criteria;

    if (!criteria || !Array.isArray(criteria) || criteria.length === 0) {
      return {
        passed: false,
        score: 0,
        maxScore: 10,
        issues: ['success_criteria must have at least one criterion'],
        warnings: []
      };
    }

    return {
      passed: true,
      score: 10,
      maxScore: 10,
      issues: [],
      warnings: [],
      details: { criteriaCount: criteria.length }
    };
  }
});

/**
 * PRD_EXISTS: Verify PRD exists for the SD
 */
RULE_REGISTRY.set('PRD_EXISTS', {
  id: 'PRD_EXISTS',
  name: 'PRD Exists',
  description: 'Verify a PRD exists for this SD',
  maxScore: 10,
  execute: async (input) => {
    if (!input.prd) {
      return {
        passed: false,
        score: 0,
        maxScore: 10,
        issues: [`No PRD found for SD ${input.sdId}`],
        warnings: []
      };
    }

    return {
      passed: true,
      score: 10,
      maxScore: 10,
      issues: [],
      warnings: [],
      details: { prdId: input.prd.id }
    };
  }
});

/**
 * PRD_STATUS_READY: Verify PRD status is ready for exec
 */
RULE_REGISTRY.set('PRD_STATUS_READY', {
  id: 'PRD_STATUS_READY',
  name: 'PRD Status Ready',
  description: 'Verify PRD status is approved or ready_for_exec',
  maxScore: 15,
  execute: async (input) => {
    const prd = input.prd;
    if (!prd) {
      return {
        passed: false,
        score: 0,
        maxScore: 15,
        issues: ['PRD not available'],
        warnings: []
      };
    }

    const validStatuses = ['approved', 'ready_for_exec', 'in_progress'];
    const status = prd.status?.toLowerCase() || 'unknown';

    if (!validStatuses.includes(status)) {
      return {
        passed: false,
        score: 0,
        maxScore: 15,
        issues: [`PRD status '${status}' not valid. Expected: ${validStatuses.join(', ')}`],
        warnings: []
      };
    }

    return {
      passed: true,
      score: 15,
      maxScore: 15,
      issues: [],
      warnings: []
    };
  }
});

/**
 * USER_STORIES_EXIST: Verify user stories exist
 */
RULE_REGISTRY.set('USER_STORIES_EXIST', {
  id: 'USER_STORIES_EXIST',
  name: 'User Stories Exist',
  description: 'Verify user stories are defined',
  maxScore: 15,
  execute: async (input) => {
    const stories = input.userStories || [];

    if (stories.length === 0) {
      return {
        passed: false,
        score: 0,
        maxScore: 15,
        issues: ['No user stories found'],
        warnings: []
      };
    }

    return {
      passed: true,
      score: 15,
      maxScore: 15,
      issues: [],
      warnings: [],
      details: { storyCount: stories.length }
    };
  }
});

/**
 * EXPLORATION_AUDIT: Verify PRD has exploration documented
 */
RULE_REGISTRY.set('EXPLORATION_AUDIT', {
  id: 'EXPLORATION_AUDIT',
  name: 'Exploration Audit',
  description: 'Verify PRD has exploration_summary with file references',
  maxScore: 15,
  execute: async (input) => {
    const prd = input.prd;
    if (!prd) {
      return { passed: true, score: 7, maxScore: 15, issues: [], warnings: ['No PRD for exploration audit'] };
    }

    // Check multiple locations for exploration data
    let files = [];
    if (Array.isArray(prd.exploration_summary)) {
      files = prd.exploration_summary;
    } else if (prd.exploration_summary?.files_explored) {
      files = prd.exploration_summary.files_explored;
    } else if (prd.metadata?.exploration_summary) {
      files = prd.metadata.exploration_summary;
    }

    if (files.length === 0) {
      return {
        passed: false,
        score: 0,
        maxScore: 15,
        issues: ['No exploration documented in PRD'],
        warnings: []
      };
    }

    const score = files.length >= 10 ? 15 : files.length >= 5 ? 12 : files.length >= 3 ? 9 : 5;

    return {
      passed: files.length >= 3,
      score,
      maxScore: 15,
      issues: files.length < 3 ? [`Only ${files.length} files explored (minimum 3 required)`] : [],
      warnings: [],
      details: { fileCount: files.length }
    };
  }
});

/**
 * EXEC_CHECKLIST_VALID: Verify exec_checklist structure
 */
RULE_REGISTRY.set('EXEC_CHECKLIST_VALID', {
  id: 'EXEC_CHECKLIST_VALID',
  name: 'Exec Checklist Valid',
  description: 'Verify exec_checklist array exists and has items',
  maxScore: 10,
  execute: async (input) => {
    const prd = input.prd;
    if (!prd) {
      return { passed: true, score: 5, maxScore: 10, issues: [], warnings: ['No PRD for checklist validation'] };
    }

    const checklist = prd.exec_checklist;
    if (!checklist || !Array.isArray(checklist)) {
      // Grace period - warn but don't block
      return {
        passed: true,
        score: 5,
        maxScore: 10,
        issues: [],
        warnings: ['exec_checklist not found - recommend adding checklist items']
      };
    }

    if (checklist.length === 0) {
      return {
        passed: true,
        score: 5,
        maxScore: 10,
        issues: [],
        warnings: ['exec_checklist is empty']
      };
    }

    return {
      passed: true,
      score: 10,
      maxScore: 10,
      issues: [],
      warnings: [],
      details: { checklistCount: checklist.length }
    };
  }
});

/**
 * SD_IS_ORCHESTRATOR: Verify SD is orchestrator type
 */
RULE_REGISTRY.set('SD_IS_ORCHESTRATOR', {
  id: 'SD_IS_ORCHESTRATOR',
  name: 'SD Is Orchestrator',
  description: 'Verify SD type is orchestrator',
  maxScore: 10,
  execute: async (input) => {
    if (input.sd?.sd_type !== 'orchestrator') {
      return {
        passed: false,
        score: 0,
        maxScore: 10,
        issues: [`SD type is '${input.sd?.sd_type}', expected 'orchestrator'`],
        warnings: []
      };
    }

    return { passed: true, score: 10, maxScore: 10, issues: [], warnings: [] };
  }
});

/**
 * CHILDREN_COMPLETE: Verify all child SDs are complete
 */
RULE_REGISTRY.set('CHILDREN_COMPLETE', {
  id: 'CHILDREN_COMPLETE',
  name: 'Children Complete',
  description: 'Verify all child SDs are completed',
  maxScore: 25,
  execute: async (input) => {
    const children = input.children || [];

    if (children.length === 0) {
      return {
        passed: false,
        score: 0,
        maxScore: 25,
        issues: ['No child SDs found for orchestrator'],
        warnings: []
      };
    }

    const incomplete = children.filter(c =>
      c.status !== 'completed' && c.progress < 100
    );

    if (incomplete.length > 0) {
      return {
        passed: false,
        score: Math.round(25 * (children.length - incomplete.length) / children.length),
        maxScore: 25,
        issues: incomplete.map(c => `Child SD ${c.id} is not complete (status: ${c.status}, progress: ${c.progress}%)`),
        warnings: []
      };
    }

    return {
      passed: true,
      score: 25,
      maxScore: 25,
      issues: [],
      warnings: [],
      details: { childCount: children.length }
    };
  }
});

/**
 * HANDOFFS_COMPLETE: Verify required handoffs exist
 */
RULE_REGISTRY.set('HANDOFFS_COMPLETE', {
  id: 'HANDOFFS_COMPLETE',
  name: 'Handoffs Complete',
  description: 'Verify all required handoffs are recorded',
  maxScore: 15,
  execute: async (input) => {
    const handoffs = input.handoffs || [];
    const required = ['LEAD-TO-PLAN', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD'];

    const found = handoffs.map(h => h.handoff_type);
    const missing = required.filter(r => !found.includes(r));

    if (missing.length > 0) {
      return {
        passed: false,
        score: Math.round(15 * (required.length - missing.length) / required.length),
        maxScore: 15,
        issues: missing.map(m => `Required handoff '${m}' not found`),
        warnings: []
      };
    }

    return { passed: true, score: 15, maxScore: 15, issues: [], warnings: [] };
  }
});

/**
 * RETROSPECTIVE_EXISTS: Verify retrospective exists
 */
RULE_REGISTRY.set('RETROSPECTIVE_EXISTS', {
  id: 'RETROSPECTIVE_EXISTS',
  name: 'Retrospective Exists',
  description: 'Verify a retrospective has been created',
  maxScore: 10,
  execute: async (input) => {
    if (!input.retrospective) {
      return {
        passed: false,
        score: 0,
        maxScore: 10,
        issues: ['No retrospective found for SD'],
        warnings: []
      };
    }

    return { passed: true, score: 10, maxScore: 10, issues: [], warnings: [] };
  }
});

// ============================================================================
// Engine Functions
// ============================================================================

/**
 * Get a rule by ID
 */
export function getRule(ruleId) {
  return RULE_REGISTRY.get(ruleId);
}

/**
 * Get all registered rules
 */
export function getAllRules() {
  return Array.from(RULE_REGISTRY.values());
}

/**
 * Get rules for a handoff type in execution order
 */
export function getRulesForHandoff(handoffType) {
  const order = RULE_ORDER[handoffType] || [];
  return order.map(id => RULE_REGISTRY.get(id)).filter(Boolean);
}

/**
 * Execute a single rule
 */
export async function executeRule(ruleId, input) {
  const rule = RULE_REGISTRY.get(ruleId);
  if (!rule) {
    return {
      passed: false,
      score: 0,
      maxScore: 0,
      issues: [`Unknown rule: ${ruleId}`],
      warnings: []
    };
  }

  try {
    return await rule.execute(input);
  } catch (error) {
    return {
      passed: false,
      score: 0,
      maxScore: rule.maxScore,
      issues: [`Rule ${ruleId} failed: ${error.message}`],
      warnings: []
    };
  }
}

/**
 * Execute all rules for a handoff type
 *
 * @param {string} handoffType - The handoff type
 * @param {Object} input - ValidationInput
 * @returns {Promise<Object>} Combined result
 */
export async function executeRules(handoffType, input) {
  const rules = getRulesForHandoff(handoffType);
  const results = [];

  for (const rule of rules) {
    const result = await executeRule(rule.id, input);
    results.push({
      ruleId: rule.id,
      ruleName: rule.name,
      ...result
    });
  }

  // Aggregate results
  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const totalMaxScore = results.reduce((sum, r) => sum + r.maxScore, 0);
  const allPassed = results.every(r => r.passed);
  const allIssues = results.flatMap(r => r.issues);
  const allWarnings = results.flatMap(r => r.warnings);

  return {
    passed: allPassed,
    score: totalScore,
    maxScore: totalMaxScore,
    percentage: totalMaxScore > 0 ? Math.round(100 * totalScore / totalMaxScore) : 0,
    ruleResults: results,
    issues: allIssues,
    warnings: allWarnings
  };
}

export default {
  getRule,
  getAllRules,
  getRulesForHandoff,
  executeRule,
  executeRules,
  RULE_ORDER
};
