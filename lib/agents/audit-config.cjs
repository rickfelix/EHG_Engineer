/**
 * Claim/Evidence Auditor Configuration
 *
 * Anti-Hallucination Safeguards - Configurable thresholds and policies
 *
 * THE LAW: Auditor operates on structured fields ONLY. No LLM calls.
 *
 * @module lib/agents/audit-config
 */

/**
 * Default audit configuration
 * Can be overridden per-agent or via environment
 */
const DEFAULT_AUDIT_CONFIG = {
  enabled: true,
  failurePolicy: 'warn',  // 'warn' | 'block' | 'retry' | 'degrade'

  checks: {
    claimEvidence: {
      enabled: true,
      minEvidenceScore: 0.5,  // Evidence required for confidence >= 0.9
      penalizeUnsupportedCertainty: true,
      certaintyPatterns: ['definitely', 'obviously', 'clearly', 'guaranteed', 'certainly', 'undoubtedly'],
      // Guards for false positives (quotes, negation, domain phrases)
      // NOTE: Stored as strings to survive JSON serialization - converted to RegExp at runtime
      excludePatterns: [
        '["\'"].*?(definitely|obviously|clearly).*?["\'"]',  // Quoted text
        'not\\s+(definitely|obviously|clearly)',              // Negation
        'may\\s+not\\s+be\\s+(definitely|obviously)'          // Uncertainty about certainty
      ]
    },
    tunnelVision: {
      enabled: true,
      complexityThreshold: 'MEDIUM',  // Only for MEDIUM+ complexity
      exemptTaskTypes: ['retrieval', 'verification', 'simple_lookup', 'status_check'],
      allowJustification: true,  // "N/A - Deterministic Result" is valid
      minRejectedHypotheses: 1
    },
    calibratedUncertainty: {
      enabled: true,
      rewardOnlyWhen: ['missing_evidence', 'conflicting_evidence', 'next_step_defined'],
      maxHedgingPenalty: -10,  // Penalize excessive hedging
      maxUncalibratedHedges: 3,  // Threshold before penalty
      hedgePatterns: ['might', 'possibly', 'uncertain', 'maybe', 'perhaps', 'could be']
    }
  },

  thresholds: {
    passScore: 50,
    confidenceIntervalTrigger: 0.80,
    maxMetadataSize: 10000,  // bytes - prevent bloat
    highConfidenceThreshold: 0.9  // Claims above this need evidence
  },

  // Per-agent overrides
  agentOverrides: {
    'SECURITY': { failurePolicy: 'block' },
    'DATABASE': { failurePolicy: 'block' },
    'DESIGN': { failurePolicy: 'warn' },
    'DOCMON': {
      failurePolicy: 'warn',
      checks: { tunnelVision: { enabled: false } }  // Docs don't need alternatives
    }
  },

  // Scoring weights
  scoring: {
    unsupportedCertaintyPenalty: -15,
    tunnelVisionPenalty: -20,
    calibratedUncertaintyReward: 5,
    evidenceDiversityBonus: 5
  }
};

/**
 * Retry policy configuration
 * Safety rails to prevent loops/cost blowups
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  backoffMs: [1000, 2000, 4000],  // Exponential
  escalateAfterRetries: 2,        // Escalate to human after 2 failures
  escalationChannel: 'log',       // 'log' | 'slack' | 'alert'
  costCap: 0.10                   // Max $ per retry cycle
};

/**
 * Metadata size limits
 * Prevents storage bloat from oversized metadata
 */
const METADATA_LIMITS = {
  maxTotalBytes: 10000,
  maxPerFieldBytes: {
    'rejected_alternatives': 5000,
    'evidence': 3000,
    'context_snapshot': 1000,
    'other': 1000
  },
  truncationOrder: ['context_snapshot', 'evidence', 'rejected_alternatives']
};

/**
 * Get merged config for a specific agent type
 * @param {string} agentType - The agent type (e.g., 'SECURITY', 'DESIGN')
 * @param {Object} customConfig - Optional custom config overrides
 * @returns {Object} Merged configuration
 */
function getAuditConfig(agentType, customConfig = {}) {
  const baseConfig = JSON.parse(JSON.stringify(DEFAULT_AUDIT_CONFIG));

  // Apply agent-specific overrides
  if (agentType && baseConfig.agentOverrides[agentType]) {
    const overrides = baseConfig.agentOverrides[agentType];
    mergeDeep(baseConfig, overrides);
  }

  // Apply custom overrides
  if (Object.keys(customConfig).length > 0) {
    mergeDeep(baseConfig, customConfig);
  }

  return baseConfig;
}

/**
 * Deep merge utility
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
function mergeDeep(target, source) {
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      mergeDeep(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

/**
 * Check if audit is enabled for given context
 * @param {Object} config - Audit config
 * @param {Object} context - Execution context
 * @returns {boolean}
 */
function isAuditEnabled(config, context = {}) {
  if (!config.enabled) return false;
  if (context.skipAudit) return false;

  // Environment override
  if (process.env.CLAIM_EVIDENCE_AUDIT_DISABLED === 'true') return false;

  return true;
}

/**
 * Get failure policy action
 * @param {Object} config - Audit config
 * @param {Object} auditResults - Results from audit
 * @param {number} retryCount - Current retry count
 * @returns {Object} Action to take
 */
function getFailurePolicyAction(config, auditResults, retryCount = 0) {
  if (auditResults.passed) {
    return { action: 'CONTINUE', reason: 'audit_passed' };
  }

  switch (config.failurePolicy) {
    case 'warn':
      return { action: 'CONTINUE_WITH_WARNING', reason: 'audit_failed_warn_policy' };

    case 'block':
      return { action: 'BLOCK_OUTPUT', reason: 'audit_failed_block_policy' };

    case 'retry':
      if (retryCount >= RETRY_CONFIG.maxRetries) {
        return { action: 'ESCALATE', reason: 'max_retries_exceeded' };
      }
      if (retryCount >= RETRY_CONFIG.escalateAfterRetries) {
        // Still retry but also escalate
        return {
          action: 'RETRY_WITH_ESCALATION',
          reason: 'escalation_threshold_reached',
          delay_ms: RETRY_CONFIG.backoffMs[retryCount] || 4000,
          retry_count: retryCount + 1
        };
      }
      return {
        action: 'RETRY',
        reason: 'audit_failed_retry_policy',
        delay_ms: RETRY_CONFIG.backoffMs[retryCount] || 1000,
        retry_count: retryCount + 1
      };

    case 'degrade':
      return { action: 'DEGRADE_CONFIDENCE', reason: 'audit_failed_degrade_policy' };

    default:
      return { action: 'CONTINUE_WITH_WARNING', reason: 'unknown_policy_defaulting_to_warn' };
  }
}

module.exports = {
  DEFAULT_AUDIT_CONFIG,
  RETRY_CONFIG,
  METADATA_LIMITS,
  getAuditConfig,
  isAuditEnabled,
  getFailurePolicyAction,
  mergeDeep
};
