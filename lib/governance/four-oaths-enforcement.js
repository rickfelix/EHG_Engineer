/**
 * FourOathsEnforcement - Enforces the EVA Manifesto's Four Oaths
 *
 * EVA Manifesto Part I: The Constitution
 *
 * THE FOUR OATHS:
 * 1. Oath of Transparency - All decisions must be logged with reasoning
 * 2. Oath of Boundaries - Never exceed delegated authority
 * 3. Oath of Escalation Integrity - Escalate honestly, never strategically
 * 4. Oath of Non-Deception - Never misrepresent confidence or capability
 *
 * @module FourOathsEnforcement
 * @version 1.0.0
 * @implements SD-MANIFESTO-003
 */

import { createClient } from '@supabase/supabase-js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const OATHS_CONFIG = {
  // Oath 1: Transparency - Minimum required fields for decision logging
  transparency: {
    requiredFields: ['input', 'reasoning', 'output', 'confidence'],
    minReasoningLength: 10
  },

  // Oath 2: Boundaries - Authority levels and spend limits
  boundaries: {
    levels: {
      L4_CREW: { spendLimit: 0, canKillVenture: false, canPivotStrategy: false },
      L3_VP: { spendLimit: 50, canKillVenture: false, canPivotStrategy: false },
      L2_CEO: { spendLimit: 500, canKillVenture: false, canPivotStrategy: 'minor' },
      L1_EVA: { spendLimit: 1000, canKillVenture: 'recommend', canPivotStrategy: 'recommend' },
      L0_CHAIRMAN: { spendLimit: Infinity, canKillVenture: true, canPivotStrategy: true }
    }
  },

  // Oath 3: Escalation Integrity - Thresholds for mandatory escalation
  escalationIntegrity: {
    confidenceThresholds: {
      L4_CREW: 0.95,  // Crews must be very confident
      L3_VP: 0.85,
      L2_CEO: 0.75,
      L1_EVA: 0.70
    },
    escalationCategories: [
      'budget_exceed',
      'strategy_change',
      'external_commitment',
      'security_concern',
      'conflicting_directive'
    ]
  },

  // Oath 4: Non-Deception - Confidence bounds and output validation
  nonDeception: {
    confidenceBounds: { min: 0, max: 1 },
    outputBuckets: ['facts', 'assumptions', 'simulations', 'unknowns'],
    minUnknownsAcknowledged: true  // Must acknowledge gaps
  }
};

// =============================================================================
// EXCEPTIONS
// =============================================================================

export class OathViolationError extends Error {
  constructor(oath, code, message, context = {}) {
    super(`OATH VIOLATION [${oath}][${code}]: ${message}`);
    this.name = 'OathViolationError';
    this.oath = oath;
    this.code = code;
    this.context = context;
    this.isCritical = true;
  }
}

export class TransparencyViolation extends OathViolationError {
  constructor(message, context) {
    super('TRANSPARENCY', 'LOGGING_INCOMPLETE', message, context);
  }
}

export class BoundaryViolation extends OathViolationError {
  constructor(message, context) {
    super('BOUNDARIES', 'AUTHORITY_EXCEEDED', message, context);
  }
}

export class EscalationViolation extends OathViolationError {
  constructor(message, context) {
    super('ESCALATION_INTEGRITY', 'ESCALATION_SUPPRESSED', message, context);
  }
}

export class DeceptionViolation extends OathViolationError {
  constructor(message, context) {
    super('NON_DECEPTION', 'CONFIDENCE_MISREPRESENTED', message, context);
  }
}

// =============================================================================
// FOUR OATHS ENFORCEMENT CLASS
// =============================================================================

/**
 * FourOathsEnforcement - Core enforcement of the Four Oaths
 */
export class FourOathsEnforcement {
  constructor(options = {}) {
    this.config = { ...OATHS_CONFIG, ...options };
    this.supabase = this._createSupabaseClient();
    this._violations = [];
  }

  /**
   * Create Supabase client
   * @private
   */
  _createSupabaseClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn('[FourOathsEnforcement] Supabase credentials not configured');
      return null;
    }

    return createClient(supabaseUrl, supabaseKey);
  }

  // ===========================================================================
  // OATH 1: TRANSPARENCY
  // ===========================================================================

  /**
   * Validate decision logging completeness (Oath 1)
   *
   * @param {Object} decision - Decision to validate
   * @param {string} decision.input - Input that triggered the decision
   * @param {string} decision.reasoning - Reasoning process applied
   * @param {string} decision.output - Output produced
   * @param {number} decision.confidence - Confidence level (0-1)
   * @returns {Object} Validation result
   */
  validateTransparency(decision) {
    const issues = [];
    const { requiredFields, minReasoningLength } = this.config.transparency;

    // Check required fields
    for (const field of requiredFields) {
      if (!decision[field]) {
        issues.push(`Missing required field: ${field}`);
      }
    }

    // Check reasoning length
    if (decision.reasoning && decision.reasoning.length < minReasoningLength) {
      issues.push(`Reasoning too brief (${decision.reasoning.length} < ${minReasoningLength} chars)`);
    }

    const result = {
      oath: 'TRANSPARENCY',
      valid: issues.length === 0,
      issues,
      decision
    };

    if (!result.valid) {
      this._logViolation(result);
    }

    return result;
  }

  /**
   * Enforce transparency - throw if invalid
   */
  enforceTransparency(decision) {
    const result = this.validateTransparency(decision);
    if (!result.valid) {
      throw new TransparencyViolation(
        `Decision lacks required transparency: ${result.issues.join(', ')}`,
        { decision, issues: result.issues }
      );
    }
    return result;
  }

  // ===========================================================================
  // OATH 2: BOUNDARIES
  // ===========================================================================

  /**
   * Validate authority boundaries (Oath 2)
   *
   * @param {Object} action - Action to validate
   * @param {string} action.agentLevel - Agent level (L4_CREW, L3_VP, etc.)
   * @param {number} [action.spendAmount] - Amount being spent
   * @param {boolean} [action.killVenture] - Attempting to kill venture
   * @param {boolean} [action.pivotStrategy] - Attempting to pivot strategy
   * @returns {Object} Validation result
   */
  validateBoundaries(action) {
    const issues = [];
    const levelConfig = this.config.boundaries.levels[action.agentLevel];

    if (!levelConfig) {
      issues.push(`Unknown agent level: ${action.agentLevel}`);
      return { oath: 'BOUNDARIES', valid: false, issues, action };
    }

    // Check spend limit
    if (action.spendAmount !== undefined && action.spendAmount > levelConfig.spendLimit) {
      issues.push(`Spend amount $${action.spendAmount} exceeds limit $${levelConfig.spendLimit}`);
    }

    // Check kill venture authority
    if (action.killVenture && !levelConfig.canKillVenture) {
      issues.push(`${action.agentLevel} cannot kill ventures`);
    }

    // Check pivot strategy authority
    if (action.pivotStrategy && !levelConfig.canPivotStrategy) {
      issues.push(`${action.agentLevel} cannot pivot strategy`);
    }

    const result = {
      oath: 'BOUNDARIES',
      valid: issues.length === 0,
      issues,
      action
    };

    if (!result.valid) {
      this._logViolation(result);
    }

    return result;
  }

  /**
   * Enforce boundaries - throw if violated
   */
  enforceBoundaries(action) {
    const result = this.validateBoundaries(action);
    if (!result.valid) {
      throw new BoundaryViolation(
        `Action exceeds authority boundaries: ${result.issues.join(', ')}`,
        { action, issues: result.issues }
      );
    }
    return result;
  }

  // ===========================================================================
  // OATH 3: ESCALATION INTEGRITY
  // ===========================================================================

  /**
   * Validate escalation integrity (Oath 3)
   *
   * @param {Object} decision - Decision to validate
   * @param {string} decision.agentLevel - Agent level
   * @param {number} decision.confidence - Confidence level
   * @param {string} [decision.category] - Decision category
   * @param {boolean} [decision.escalated] - Whether escalation occurred
   * @returns {Object} Validation result
   */
  validateEscalationIntegrity(decision) {
    const issues = [];
    const thresholds = this.config.escalationIntegrity.confidenceThresholds;
    const threshold = thresholds[decision.agentLevel];

    // Check if escalation was required but not done
    if (threshold && decision.confidence < threshold && !decision.escalated) {
      issues.push(
        `Confidence ${decision.confidence} below threshold ${threshold} for ${decision.agentLevel} - escalation required`
      );
    }

    // Check if category requires escalation
    const escalationCategories = this.config.escalationIntegrity.escalationCategories;
    if (escalationCategories.includes(decision.category) && !decision.escalated) {
      issues.push(`Category "${decision.category}" requires mandatory escalation`);
    }

    const result = {
      oath: 'ESCALATION_INTEGRITY',
      valid: issues.length === 0,
      issues,
      decision
    };

    if (!result.valid) {
      this._logViolation(result);
    }

    return result;
  }

  /**
   * Enforce escalation integrity - throw if violated
   */
  enforceEscalationIntegrity(decision) {
    const result = this.validateEscalationIntegrity(decision);
    if (!result.valid) {
      throw new EscalationViolation(
        `Escalation integrity violated: ${result.issues.join(', ')}`,
        { decision, issues: result.issues }
      );
    }
    return result;
  }

  // ===========================================================================
  // OATH 4: NON-DECEPTION
  // ===========================================================================

  /**
   * Validate non-deception (Oath 4)
   *
   * @param {Object} output - Output to validate
   * @param {number} output.confidence - Stated confidence
   * @param {Object} output.buckets - Content classified by type
   * @param {string[]} [output.unknowns] - Acknowledged unknowns
   * @returns {Object} Validation result
   */
  validateNonDeception(output) {
    const issues = [];
    const { confidenceBounds, outputBuckets } = this.config.nonDeception;

    // Check confidence bounds
    if (output.confidence < confidenceBounds.min || output.confidence > confidenceBounds.max) {
      issues.push(`Confidence ${output.confidence} outside valid bounds [${confidenceBounds.min}, ${confidenceBounds.max}]`);
    }

    // Check if outputs are properly classified
    if (output.buckets) {
      const bucketKeys = Object.keys(output.buckets);
      for (const key of bucketKeys) {
        if (!outputBuckets.includes(key)) {
          issues.push(`Unknown output bucket: ${key}. Valid: ${outputBuckets.join(', ')}`);
        }
      }
    }

    // Check if unknowns are acknowledged when required
    if (this.config.nonDeception.minUnknownsAcknowledged) {
      const hasUnknowns = output.buckets?.unknowns?.length > 0 || output.unknowns?.length > 0;
      const highConfidence = output.confidence > 0.9;

      if (highConfidence && !hasUnknowns) {
        issues.push('High confidence (>0.9) with no acknowledged unknowns - suspicious');
      }
    }

    const result = {
      oath: 'NON_DECEPTION',
      valid: issues.length === 0,
      issues,
      output
    };

    if (!result.valid) {
      this._logViolation(result);
    }

    return result;
  }

  /**
   * Enforce non-deception - throw if violated
   */
  enforceNonDeception(output) {
    const result = this.validateNonDeception(output);
    if (!result.valid) {
      throw new DeceptionViolation(
        `Non-deception oath violated: ${result.issues.join(', ')}`,
        { output, issues: result.issues }
      );
    }
    return result;
  }

  // ===========================================================================
  // COMBINED VALIDATION
  // ===========================================================================

  /**
   * Validate all four oaths for a complete agent action
   *
   * @param {Object} agentAction - Complete agent action to validate
   * @returns {Object} Combined validation result
   */
  validateAllOaths(agentAction) {
    const results = {
      transparency: this.validateTransparency(agentAction.decision || {}),
      boundaries: this.validateBoundaries(agentAction.action || {}),
      escalation: this.validateEscalationIntegrity(agentAction.decision || {}),
      nonDeception: this.validateNonDeception(agentAction.output || {})
    };

    const allValid = Object.values(results).every(r => r.valid);
    const allIssues = Object.entries(results)
      .filter(([_, r]) => !r.valid)
      .map(([oath, r]) => ({ oath, issues: r.issues }));

    return {
      valid: allValid,
      results,
      violations: allIssues
    };
  }

  /**
   * Enforce all four oaths - throw on first violation
   */
  enforceAllOaths(agentAction) {
    this.enforceTransparency(agentAction.decision || {});
    this.enforceBoundaries(agentAction.action || {});
    this.enforceEscalationIntegrity(agentAction.decision || {});
    this.enforceNonDeception(agentAction.output || {});

    return { valid: true };
  }

  // ===========================================================================
  // VIOLATION LOGGING
  // ===========================================================================

  /**
   * Log violation to database
   * @private
   */
  async _logViolation(violation) {
    this._violations.push(violation);

    if (!this.supabase) return;

    try {
      await this.supabase
        .from('compliance_alerts')
        .insert({
          alert_type: 'OATH_VIOLATION',
          oath: violation.oath,
          severity: 'critical',
          details: violation,
          created_at: new Date().toISOString()
        });

      console.log(`[FourOathsEnforcement] Logged violation: ${violation.oath}`);
    } catch (err) {
      console.warn('[FourOathsEnforcement] Failed to log violation:', err.message);
    }
  }

  /**
   * Get all recorded violations
   */
  getViolations() {
    return this._violations;
  }

  /**
   * Clear recorded violations
   */
  clearViolations() {
    this._violations = [];
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let _instance = null;

/**
 * Get the FourOathsEnforcement singleton instance
 * @returns {FourOathsEnforcement}
 */
export function getFourOathsEnforcement() {
  if (!_instance) {
    _instance = new FourOathsEnforcement();
  }
  return _instance;
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Quick check if an action violates any oath
 * @param {Object} agentAction - Agent action to check
 * @returns {boolean} True if valid, false if any violation
 */
export function isOathCompliant(agentAction) {
  const enforcement = getFourOathsEnforcement();
  const result = enforcement.validateAllOaths(agentAction);
  return result.valid;
}

/**
 * Get authority limits for an agent level
 * @param {string} agentLevel - Agent level (L4_CREW, L3_VP, etc.)
 * @returns {Object} Authority limits
 */
export function getAuthorityLimits(agentLevel) {
  return OATHS_CONFIG.boundaries.levels[agentLevel] || null;
}

/**
 * Get confidence threshold for an agent level
 * @param {string} agentLevel - Agent level
 * @returns {number} Confidence threshold
 */
export function getConfidenceThreshold(agentLevel) {
  return OATHS_CONFIG.escalationIntegrity.confidenceThresholds[agentLevel] || 0.95;
}

export default FourOathsEnforcement;
