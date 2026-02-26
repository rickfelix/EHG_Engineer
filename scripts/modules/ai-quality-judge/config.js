/**
 * AI Quality Judge Configuration
 * Phase 1: SD-LEO-SELF-IMPROVE-AIJUDGE-001
 *
 * Constitution rules, scoring criteria, and thresholds
 */

/**
 * Scoring criteria weights (must sum to 100)
 */
export const SCORING_CRITERIA = {
  safety: {
    weight: 25,
    description: 'Can this change be safely applied and rolled back?',
    scale: '0-10: 0=irreversible danger, 10=completely safe'
  },
  specificity: {
    weight: 20,
    description: 'Is the improvement specific with exact table/operation/payload?',
    scale: '0-10: 0=vague, 10=fully specified'
  },
  necessity: {
    weight: 20,
    description: 'Does this address a real gap with evidence?',
    scale: '0-10: 0=unnecessary, 10=critical need with evidence'
  },
  evidence: {
    weight: 20,
    description: 'Is there retrospective/pattern support for this improvement?',
    scale: '0-10: 0=no evidence, 10=multiple supporting retrospectives'
  },
  atomicity: {
    weight: 15,
    description: 'Is this a single, focused change?',
    scale: '0-10: 0=multiple unrelated changes, 10=single atomic change'
  }
};

/**
 * Recommendation thresholds
 */
export const RECOMMENDATION_THRESHOLDS = {
  approve_high: 85,      // 85-100: APPROVE with HIGH confidence
  approve_medium: 70,    // 70-84: APPROVE with MEDIUM confidence (human review recommended)
  needs_revision: 50,    // 50-69: NEEDS_REVISION
  reject: 0              // 0-49: REJECT
};

/**
 * Risk tier classification
 */
export const RISK_TIERS = {
  IMMUTABLE: {
    description: 'Never auto-apply (constitution, CORE sections)',
    requires_human: true,
    auto_apply_allowed: false
  },
  GOVERNED: {
    description: 'Human approval required',
    requires_human: true,
    auto_apply_allowed: false
  },
  AUTO: {
    description: 'Can auto-apply if score >= 85 AND safety >= 9 AND INSERT operation',
    requires_human: false,
    auto_apply_allowed: true,
    min_score: 85,
    min_safety: 9,
    allowed_operations: ['INSERT']
  }
};

/**
 * Constitution rules (loaded from database at runtime)
 * These are the rule codes for reference - actual rules fetched from protocol_constitution
 */
export const CONSTITUTION_RULE_CODES = [
  'CONST-001', // GOVERNED tier requires human approval
  'CONST-002', // System cannot approve its own proposals
  'CONST-003', // All changes must be audit-logged
  'CONST-004', // Every change must be reversible
  'CONST-005', // Database-first architecture
  'CONST-006', // Complexity conservation
  'CONST-007', // Max 3 AUTO changes per 24h
  'CONST-008', // Chesterton's Fence
  'CONST-009', // Human FREEZE command
  'CONST-010', // Non-Manipulation Principle (SD-LEO-INFRA-CONST-AMEND-001)
  'CONST-011', // Value Priority Hierarchy (SD-LEO-INFRA-CONST-AMEND-001)
  'CONST-012', // FR Delivery Verification (SD-MAN-ORCH-SCOPE-INTEGRITY-CONSTITUTIONAL-001-A)
  'CONST-013', // Gate Immutability During EXEC (SD-MAN-ORCH-SCOPE-INTEGRITY-CONSTITUTIONAL-001-A)
  'CONST-014'  // Mandatory Decomposition (SD-MAN-ORCH-SCOPE-INTEGRITY-CONSTITUTIONAL-001-A)
];

/**
 * Violation severity levels
 */
export const VIOLATION_SEVERITY = {
  CRITICAL: {
    description: 'Auto-reject, no human override allowed',
    rules: ['CONST-001', 'CONST-002', 'CONST-007', 'CONST-009', 'CONST-013']
  },
  HIGH: {
    description: 'Flag for mandatory human review',
    rules: ['CONST-003', 'CONST-004', 'CONST-005', 'CONST-012', 'CONST-014']
  },
  MEDIUM: {
    description: 'Warning, human review recommended',
    rules: ['CONST-006', 'CONST-008', 'CONST-010']
  },
  ADVISORY: {
    description: 'Informational guidance, no violation generated',
    rules: ['CONST-011']
  }
};

/**
 * Model configuration for triangulation
 * Evaluator must use different model family than proposer
 */
export const MODEL_CONFIG = {
  evaluator: {
    model: 'gemini-3-flash-preview',
    family: 'google',
    temperature: 0.3,
    description: 'Evaluator model - different family from proposer'
  },
  proposer: {
    model: 'claude-sonnet-4-20250514',
    family: 'anthropic',
    description: 'Proposer model - creative suggestions'
  }
};

/**
 * Database table names
 */
export const TABLES = {
  CONSTITUTION: 'protocol_constitution',
  ASSESSMENTS: 'improvement_quality_assessments',
  QUEUE: 'protocol_improvement_queue',
  SYSTEM_SETTINGS: 'system_settings'  // Unified settings table (SD-LEO-SELF-IMPROVE-002A)
};

export default {
  SCORING_CRITERIA,
  RECOMMENDATION_THRESHOLDS,
  RISK_TIERS,
  CONSTITUTION_RULE_CODES,
  VIOLATION_SEVERITY,
  MODEL_CONFIG,
  TABLES
};
