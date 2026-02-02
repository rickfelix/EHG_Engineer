/**
 * Risk Classifier Module
 * Phase 2: SD-LEO-SELF-IMPROVE-RISK-001
 *
 * Auto-classifies protocol improvements into IMMUTABLE/GOVERNED/AUTO tiers
 * based on target table and change type. Defaults to GOVERNED when uncertain.
 *
 * Risk Tiers:
 * - IMMUTABLE: Cannot be modified by any automated process
 * - GOVERNED: Requires human approval (Phase 1 default)
 * - AUTO: Can be applied automatically if score threshold met
 */

import { RISK_TIERS } from '../ai-quality-judge/config.js';

/**
 * Classification rules per Section 10.2 of Self-Improvement Plan
 *
 * Rule 1: IMMUTABLE - Constitution table changes
 * Rule 2: IMMUTABLE - Changes to CONST-* rules
 * Rule 3: IMMUTABLE - CORE priority sections
 * Rule 4: GOVERNED - Validation rules
 * Rule 5: GOVERNED - Sub-agent configuration
 * Rule 6: GOVERNED - DELETE/UPDATE operations
 * Rule 7: AUTO - Checklist items (INSERT only)
 * Rule 8: AUTO - SITUATIONAL priority sections (INSERT only)
 * Rule 9: DEFAULT - Unknown → GOVERNED (safe fallback)
 */
const CLASSIFICATION_RULES = [
  {
    id: 'RULE-001',
    name: 'Constitution table is IMMUTABLE',
    tier: 'IMMUTABLE',
    check: (improvement) => {
      return improvement.target_table === 'protocol_constitution';
    }
  },
  {
    id: 'RULE-002',
    name: 'CONST rule changes are IMMUTABLE',
    tier: 'IMMUTABLE',
    check: (improvement) => {
      const payload = improvement.payload || {};
      const ruleCode = payload.rule_code || payload.rule_id || '';
      return ruleCode.startsWith('CONST-');
    }
  },
  {
    id: 'RULE-003',
    name: 'CORE priority sections are IMMUTABLE',
    tier: 'IMMUTABLE',
    check: (improvement) => {
      if (improvement.target_table !== 'leo_protocol_sections') return false;
      const payload = improvement.payload || {};
      return payload.priority === 'CORE' ||
             (payload.section_key && payload.section_key.includes('CORE'));
    }
  },
  {
    id: 'RULE-004',
    name: 'Validation rules require GOVERNED',
    tier: 'GOVERNED',
    check: (improvement) => {
      return improvement.target_table === 'leo_validation_rules' ||
             improvement.improvement_type === 'VALIDATION_RULE';
    }
  },
  {
    id: 'RULE-005',
    name: 'Sub-agent configuration requires GOVERNED',
    tier: 'GOVERNED',
    check: (improvement) => {
      return improvement.target_table === 'leo_sub_agents' ||
             improvement.target_table === 'leo_sub_agent_triggers' ||
             improvement.improvement_type === 'SUB_AGENT_CONFIG';
    }
  },
  {
    id: 'RULE-006',
    name: 'DELETE/UPDATE operations require GOVERNED',
    tier: 'GOVERNED',
    check: (improvement) => {
      const op = (improvement.target_operation || '').toUpperCase();
      return op === 'DELETE' || op === 'UPDATE';
    }
  },
  {
    id: 'RULE-007',
    name: 'Checklist items can be AUTO (INSERT only)',
    tier: 'AUTO',
    check: (improvement) => {
      const op = (improvement.target_operation || '').toUpperCase();
      return improvement.improvement_type === 'CHECKLIST_ITEM' &&
             (op === 'INSERT' || op === 'UPSERT');
    }
  },
  {
    id: 'RULE-008',
    name: 'SITUATIONAL sections can be AUTO (INSERT only)',
    tier: 'AUTO',
    check: (improvement) => {
      if (improvement.target_table !== 'leo_protocol_sections') return false;
      const op = (improvement.target_operation || '').toUpperCase();
      const payload = improvement.payload || {};
      return payload.priority === 'SITUATIONAL' &&
             (op === 'INSERT' || op === 'UPSERT');
    }
  },
  {
    id: 'RULE-009',
    name: 'Unknown defaults to GOVERNED',
    tier: 'GOVERNED',
    check: () => true // Default fallback - always matches
  }
];

/**
 * Tables that are IMMUTABLE by nature
 */
const IMMUTABLE_TABLES = [
  'protocol_constitution',
  'audit_log',
  'system_settings'  // Unified settings table (SD-LEO-SELF-IMPROVE-002A)
];

/**
 * Tables that typically require GOVERNED tier
 */
const GOVERNED_TABLES = [
  'leo_validation_rules',
  'leo_sub_agents',
  'leo_sub_agent_triggers',
  'strategic_directives_v2',
  'product_requirements_v2',
  'sd_phase_handoffs'
];

/**
 * Tables that can potentially be AUTO
 */
const AUTO_ELIGIBLE_TABLES = [
  'leo_protocol_sections',
  'issue_patterns',
  'retrospectives'
];

/**
 * RiskClassifier class
 * Main entry point for improvement classification
 */
export class RiskClassifier {
  constructor(options = {}) {
    this.rules = options.rules || CLASSIFICATION_RULES;
    this.verbose = options.verbose || false;
  }

  /**
   * Classify a single improvement
   *
   * @param {Object} improvement - Improvement to classify
   * @returns {Object} Classification result with tier, rule, and confidence
   */
  classify(improvement) {
    if (!improvement) {
      return {
        tier: 'GOVERNED',
        rule: 'RULE-009',
        ruleName: 'Unknown defaults to GOVERNED',
        confidence: 100,
        reason: 'Null improvement - defaulting to GOVERNED'
      };
    }

    // Check rules in order (first match wins, except default)
    for (const rule of this.rules) {
      // Skip the default rule initially
      if (rule.id === 'RULE-009') continue;

      try {
        if (rule.check(improvement)) {
          const result = {
            tier: rule.tier,
            rule: rule.id,
            ruleName: rule.name,
            confidence: this._calculateConfidence(improvement, rule),
            reason: `Matched ${rule.id}: ${rule.name}`
          };

          if (this.verbose) {
            console.log(`[RiskClassifier] ${improvement.id || 'unknown'}: ${result.tier} (${rule.id})`);
          }

          return result;
        }
      } catch (error) {
        console.warn(`[RiskClassifier] Rule ${rule.id} check failed: ${error.message}`);
      }
    }

    // Default fallback (RULE-009)
    return {
      tier: 'GOVERNED',
      rule: 'RULE-009',
      ruleName: 'Unknown defaults to GOVERNED',
      confidence: 100,
      reason: 'No specific rule matched - defaulting to GOVERNED (safe fallback)'
    };
  }

  /**
   * Classify multiple improvements
   *
   * @param {Array} improvements - Array of improvements to classify
   * @returns {Array} Array of classification results
   */
  classifyBatch(improvements) {
    return (improvements || []).map(imp => ({
      improvement_id: imp.id,
      ...this.classify(imp)
    }));
  }

  /**
   * Get the tier for a specific target table
   *
   * @param {string} tableName - Table name to check
   * @returns {string} Risk tier
   */
  getTierForTable(tableName) {
    if (IMMUTABLE_TABLES.includes(tableName)) {
      return 'IMMUTABLE';
    }
    if (GOVERNED_TABLES.includes(tableName)) {
      return 'GOVERNED';
    }
    if (AUTO_ELIGIBLE_TABLES.includes(tableName)) {
      return 'AUTO'; // Note: Actual tier depends on operation type
    }
    return 'GOVERNED'; // Unknown tables default to GOVERNED
  }

  /**
   * Check if an improvement can be auto-applied
   *
   * @param {Object} improvement - Improvement to check
   * @param {number} score - Quality score (0-100)
   * @param {number} safetyScore - Safety score (0-10)
   * @returns {Object} Auto-apply eligibility
   */
  canAutoApply(improvement, score = 0, safetyScore = 0) {
    const classification = this.classify(improvement);

    if (classification.tier !== 'AUTO') {
      return {
        eligible: false,
        reason: `Tier is ${classification.tier}, not AUTO`,
        classification
      };
    }

    const autoConfig = RISK_TIERS.AUTO;

    if (score < autoConfig.min_score) {
      return {
        eligible: false,
        reason: `Score ${score} below threshold ${autoConfig.min_score}`,
        classification
      };
    }

    if (safetyScore < autoConfig.min_safety) {
      return {
        eligible: false,
        reason: `Safety score ${safetyScore} below threshold ${autoConfig.min_safety}`,
        classification
      };
    }

    const op = (improvement.target_operation || '').toUpperCase();
    if (!autoConfig.allowed_operations.includes(op)) {
      return {
        eligible: false,
        reason: `Operation ${op} not in allowed list: ${autoConfig.allowed_operations.join(', ')}`,
        classification
      };
    }

    return {
      eligible: true,
      reason: 'All AUTO criteria met',
      classification
    };
  }

  /**
   * Calculate confidence level for a classification
   *
   * @param {Object} improvement - The improvement
   * @param {Object} rule - The matched rule
   * @returns {number} Confidence 0-100
   */
  _calculateConfidence(improvement, rule) {
    // Higher confidence for explicit rules
    if (rule.id === 'RULE-001' || rule.id === 'RULE-002' || rule.id === 'RULE-003') {
      return 100; // IMMUTABLE rules are definitive
    }

    // Medium-high confidence for GOVERNED rules
    if (rule.tier === 'GOVERNED') {
      return 95;
    }

    // AUTO rules have slightly lower confidence
    if (rule.tier === 'AUTO') {
      // Check if we have all the expected fields
      const hasAllFields = improvement.target_table &&
                          improvement.target_operation &&
                          improvement.improvement_type;
      return hasAllFields ? 90 : 75;
    }

    return 80; // Default confidence
  }

  /**
   * Get all classification rules
   *
   * @returns {Array} Array of rule definitions
   */
  getRules() {
    return this.rules.map(r => ({
      id: r.id,
      name: r.name,
      tier: r.tier
    }));
  }

  /**
   * Get statistics about classified improvements
   *
   * @param {Array} classifications - Array of classification results
   * @returns {Object} Statistics
   */
  getStatistics(classifications) {
    const stats = {
      total: classifications.length,
      byTier: {
        IMMUTABLE: 0,
        GOVERNED: 0,
        AUTO: 0
      },
      byRule: {},
      avgConfidence: 0
    };

    let totalConfidence = 0;

    for (const c of classifications) {
      stats.byTier[c.tier] = (stats.byTier[c.tier] || 0) + 1;
      stats.byRule[c.rule] = (stats.byRule[c.rule] || 0) + 1;
      totalConfidence += c.confidence || 0;
    }

    stats.avgConfidence = classifications.length > 0
      ? Math.round(totalConfidence / classifications.length)
      : 0;

    return stats;
  }
}

/**
 * Create a RiskClassifier instance
 *
 * @param {Object} options - Configuration options
 * @returns {RiskClassifier} Classifier instance
 */
export function createRiskClassifier(options = {}) {
  return new RiskClassifier(options);
}

// Export rule definitions for testing
export {
  CLASSIFICATION_RULES,
  IMMUTABLE_TABLES,
  GOVERNED_TABLES,
  AUTO_ELIGIBLE_TABLES
};

export default RiskClassifier;
