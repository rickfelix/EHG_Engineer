/**
 * CEO Runtime Constants
 * Handler registry and schema definitions
 *
 * Extracted from venture-ceo-runtime.js for modularity
 * SD-LEO-REFACTOR-VENTURE-CEO-001
 */

/**
 * CEO Handler Registry
 * Maps message types to handler method names
 */
export const CEO_HANDLERS = {
  task_delegation: 'handleCEOTaskDelegation',
  task_completion: 'handleCEOTaskCompletion',
  status_report: 'handleCEOStatusReport',
  escalation: 'handleCEOEscalation',
  query: 'handleCEOQuery',
  response: 'handleCEOResponse',
  mission_draft: 'handleCEOMissionDraft'
};

/**
 * Business Hypothesis Validation Schema
 * SOVEREIGN SEAL v2.9.0: All market-facing hypotheses must conform
 *
 * Required fields for hypothesis validation:
 * - hypothesis_id: Unique identifier
 * - hypothesis_type: Category (market, product, growth, retention)
 * - statement: The hypothesis statement
 * - confidence_level: 0.0 - 1.0
 * - evidence_basis: Array of supporting evidence
 * - validation_criteria: How to test the hypothesis
 * - expiry_date: When hypothesis becomes stale
 */
export const BUSINESS_HYPOTHESIS_SCHEMA = {
  required: [
    'hypothesis_id',
    'hypothesis_type',
    'statement',
    'confidence_level',
    'evidence_basis',
    'validation_criteria',
    'expiry_date'
  ],
  types: {
    hypothesis_id: 'string',
    hypothesis_type: ['market', 'product', 'growth', 'retention'],
    statement: 'string',
    confidence_level: 'number', // 0.0 - 1.0
    evidence_basis: 'array',
    validation_criteria: 'object',
    expiry_date: 'string' // ISO date
  },
  confidence_thresholds: {
    low: 0.3,
    medium: 0.6,
    high: 0.8
  }
};

/**
 * Budget thresholds for warnings
 */
export const BUDGET_THRESHOLDS = {
  WARNING_PERCENT: 0.8,  // 80% consumed triggers warning
  CRITICAL_PERCENT: 0.95 // 95% consumed triggers critical alert
};

/**
 * Stage to VP mapping (from STANDARD_VENTURE_TEMPLATE)
 */
export const STAGE_TO_VP = {
  VP_STRATEGY: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  VP_PRODUCT: [10, 11, 12],
  VP_TECH: [13, 14, 15, 16, 17, 18, 19, 20],
  VP_GROWTH: [21, 22, 23, 24, 25]
};
