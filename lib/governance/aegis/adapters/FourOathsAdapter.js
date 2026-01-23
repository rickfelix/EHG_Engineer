/**
 * FourOathsAdapter - Backward-compatible wrapper for Four Oaths Enforcement
 *
 * Provides the same interface as the legacy FourOathsEnforcement class but
 * routes all validation through AEGIS.
 *
 * @module FourOathsAdapter
 * @version 1.0.0
 */

import { getAegisEnforcer } from '../AegisEnforcer.js';
import { AegisRuleLoader } from '../AegisRuleLoader.js';
import { AEGIS_CONSTITUTIONS } from '../index.js';

/**
 * Custom error classes for backward compatibility
 */
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

/**
 * FourOathsAdapter - Wraps AEGIS for Four Oaths validation
 */
export class FourOathsAdapter {
  constructor(options = {}) {
    this.config = options;
    // Only pass supabase if truthy, otherwise let defaults handle initialization
    const enforcerOptions = options.supabase ? { supabase: options.supabase } : {};
    this.enforcer = getAegisEnforcer(enforcerOptions);
    this.ruleLoader = new AegisRuleLoader(enforcerOptions);
    this._violations = [];
    this.useAegis = true;
  }

  // ===========================================================================
  // OATH 1: TRANSPARENCY
  // ===========================================================================

  /**
   * Validate decision logging completeness (Oath 1)
   */
  async validateTransparency(decision) {
    if (this.useAegis) {
      return this._validateOathViaAegis('OATH-1', decision, 'TRANSPARENCY');
    }

    // Legacy fallback
    const issues = [];
    const requiredFields = ['input', 'reasoning', 'output', 'confidence'];
    const minReasoningLength = 10;

    for (const field of requiredFields) {
      if (!decision[field]) {
        issues.push(`Missing required field: ${field}`);
      }
    }

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
  async enforceTransparency(decision) {
    const result = await this.validateTransparency(decision);
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
   */
  async validateBoundaries(action) {
    if (this.useAegis) {
      return this._validateOathViaAegis('OATH-2', action, 'BOUNDARIES');
    }

    // Legacy fallback
    const issues = [];
    const levels = {
      L4_CREW: { spendLimit: 0, canKillVenture: false, canPivotStrategy: false },
      L3_VP: { spendLimit: 50, canKillVenture: false, canPivotStrategy: false },
      L2_CEO: { spendLimit: 500, canKillVenture: false, canPivotStrategy: 'minor' },
      L1_EVA: { spendLimit: 1000, canKillVenture: 'recommend', canPivotStrategy: 'recommend' },
      L0_CHAIRMAN: { spendLimit: Infinity, canKillVenture: true, canPivotStrategy: true }
    };

    const levelConfig = levels[action.agentLevel];

    if (!levelConfig) {
      issues.push(`Unknown agent level: ${action.agentLevel}`);
      return { oath: 'BOUNDARIES', valid: false, issues, action };
    }

    if (action.spendAmount !== undefined && action.spendAmount > levelConfig.spendLimit) {
      issues.push(`Spend amount $${action.spendAmount} exceeds limit $${levelConfig.spendLimit}`);
    }

    if (action.killVenture && !levelConfig.canKillVenture) {
      issues.push(`${action.agentLevel} cannot kill ventures`);
    }

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
  async enforceBoundaries(action) {
    const result = await this.validateBoundaries(action);
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
   */
  async validateEscalationIntegrity(decision) {
    if (this.useAegis) {
      return this._validateOathViaAegis('OATH-3', decision, 'ESCALATION_INTEGRITY');
    }

    // Legacy fallback
    const issues = [];
    const thresholds = {
      L4_CREW: 0.95,
      L3_VP: 0.85,
      L2_CEO: 0.75,
      L1_EVA: 0.70
    };

    const threshold = thresholds[decision.agentLevel];

    if (threshold && decision.confidence < threshold && !decision.escalated) {
      issues.push(
        `Confidence ${decision.confidence} below threshold ${threshold} for ${decision.agentLevel} - escalation required`
      );
    }

    const escalationCategories = [
      'budget_exceed', 'strategy_change', 'external_commitment',
      'security_concern', 'conflicting_directive'
    ];

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
  async enforceEscalationIntegrity(decision) {
    const result = await this.validateEscalationIntegrity(decision);
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
   */
  async validateNonDeception(output) {
    if (this.useAegis) {
      return this._validateOathViaAegis('OATH-4', output, 'NON_DECEPTION');
    }

    // Legacy fallback
    const issues = [];
    const validBuckets = ['facts', 'assumptions', 'simulations', 'unknowns'];

    if (output.confidence < 0 || output.confidence > 1) {
      issues.push(`Confidence ${output.confidence} outside valid bounds [0, 1]`);
    }

    if (output.buckets) {
      const bucketKeys = Object.keys(output.buckets);
      for (const key of bucketKeys) {
        if (!validBuckets.includes(key)) {
          issues.push(`Unknown output bucket: ${key}`);
        }
      }
    }

    const hasUnknowns = output.buckets?.unknowns?.length > 0 || output.unknowns?.length > 0;
    const highConfidence = output.confidence > 0.9;

    if (highConfidence && !hasUnknowns) {
      issues.push('High confidence (>0.9) with no acknowledged unknowns - suspicious');
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
  async enforceNonDeception(output) {
    const result = await this.validateNonDeception(output);
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
   */
  async validateAllOaths(agentAction) {
    if (this.useAegis) {
      // Use full AEGIS validation
      const context = {
        // Transparency (Oath 1)
        input: agentAction.decision?.input,
        reasoning: agentAction.decision?.reasoning,
        output: agentAction.decision?.output || agentAction.output?.result,
        confidence: agentAction.decision?.confidence || agentAction.output?.confidence,

        // Boundaries (Oath 2)
        agentLevel: agentAction.action?.agentLevel,
        spendAmount: agentAction.action?.spendAmount,
        killVenture: agentAction.action?.killVenture,
        pivotStrategy: agentAction.action?.pivotStrategy,

        // Escalation (Oath 3)
        escalated: agentAction.decision?.escalated,
        category: agentAction.decision?.category,

        // Non-deception (Oath 4)
        buckets: agentAction.output?.buckets,
        unknowns: agentAction.output?.unknowns
      };

      const result = await this.enforcer.validate(
        AEGIS_CONSTITUTIONS.FOUR_OATHS,
        context,
        { recordViolations: true, incrementStats: true }
      );

      return {
        valid: result.passed,
        results: {
          transparency: { valid: !result.violations.some(v => v.rule_code === 'OATH-1') },
          boundaries: { valid: !result.violations.some(v => v.rule_code.startsWith('OATH-2')) },
          escalation: { valid: !result.violations.some(v => v.rule_code.startsWith('OATH-3')) },
          nonDeception: { valid: !result.violations.some(v => v.rule_code.startsWith('OATH-4')) }
        },
        violations: result.violations.map(v => ({
          oath: this._ruleCodeToOath(v.rule_code),
          issues: [v.message]
        })),
        aegis_enabled: true
      };
    }

    // Legacy fallback
    const results = {
      transparency: await this.validateTransparency(agentAction.decision || {}),
      boundaries: await this.validateBoundaries(agentAction.action || {}),
      escalation: await this.validateEscalationIntegrity(agentAction.decision || {}),
      nonDeception: await this.validateNonDeception(agentAction.output || {})
    };

    const allValid = Object.values(results).every(r => r.valid);
    const allIssues = Object.entries(results)
      .filter(([_, r]) => !r.valid)
      .map(([oath, r]) => ({ oath, issues: r.issues }));

    return {
      valid: allValid,
      results,
      violations: allIssues,
      aegis_enabled: false
    };
  }

  /**
   * Enforce all four oaths - throw on first violation
   */
  async enforceAllOaths(agentAction) {
    await this.enforceTransparency(agentAction.decision || {});
    await this.enforceBoundaries(agentAction.action || {});
    await this.enforceEscalationIntegrity(agentAction.decision || {});
    await this.enforceNonDeception(agentAction.output || {});

    return { valid: true };
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Validate a specific oath via AEGIS
   * @private
   */
  async _validateOathViaAegis(ruleCodePrefix, data, oathName) {
    const result = await this.enforcer.validate(
      AEGIS_CONSTITUTIONS.FOUR_OATHS,
      data,
      { recordViolations: true, incrementStats: true }
    );

    // Filter violations for this specific oath
    const oathViolations = result.violations.filter(v =>
      v.rule_code === ruleCodePrefix || v.rule_code.startsWith(ruleCodePrefix + '-')
    );

    const issues = oathViolations.map(v => v.message);

    return {
      oath: oathName,
      valid: oathViolations.length === 0,
      issues,
      aegis_violations: oathViolations
    };
  }

  /**
   * Map rule code to oath name
   * @private
   */
  _ruleCodeToOath(ruleCode) {
    if (ruleCode.startsWith('OATH-1')) return 'TRANSPARENCY';
    if (ruleCode.startsWith('OATH-2')) return 'BOUNDARIES';
    if (ruleCode.startsWith('OATH-3')) return 'ESCALATION_INTEGRITY';
    if (ruleCode.startsWith('OATH-4')) return 'NON_DECEPTION';
    return 'UNKNOWN';
  }

  /**
   * Log violation (maintains legacy behavior)
   * @private
   */
  _logViolation(violation) {
    this._violations.push(violation);
    console.log(`[FourOathsAdapter] Logged violation: ${violation.oath}`);
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

  /**
   * Enable or disable AEGIS mode
   */
  setAegisMode(enabled) {
    this.useAegis = enabled;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let _instance = null;

/**
 * Get the FourOathsAdapter singleton instance
 */
export function getFourOathsAdapter() {
  if (!_instance) {
    _instance = new FourOathsAdapter();
  }
  return _instance;
}

// =============================================================================
// CONVENIENCE FUNCTIONS (backward compatible)
// =============================================================================

/**
 * Quick check if an action violates any oath
 */
export async function isOathCompliant(agentAction) {
  const adapter = getFourOathsAdapter();
  const result = await adapter.validateAllOaths(agentAction);
  return result.valid;
}

/**
 * Get authority limits for an agent level
 */
export function getAuthorityLimits(agentLevel) {
  const levels = {
    L4_CREW: { spendLimit: 0, canKillVenture: false, canPivotStrategy: false },
    L3_VP: { spendLimit: 50, canKillVenture: false, canPivotStrategy: false },
    L2_CEO: { spendLimit: 500, canKillVenture: false, canPivotStrategy: 'minor' },
    L1_EVA: { spendLimit: 1000, canKillVenture: 'recommend', canPivotStrategy: 'recommend' },
    L0_CHAIRMAN: { spendLimit: Infinity, canKillVenture: true, canPivotStrategy: true }
  };
  return levels[agentLevel] || null;
}

/**
 * Get confidence threshold for an agent level
 */
export function getConfidenceThreshold(agentLevel) {
  const thresholds = {
    L4_CREW: 0.95,
    L3_VP: 0.85,
    L2_CEO: 0.75,
    L1_EVA: 0.70
  };
  return thresholds[agentLevel] || 0.95;
}

export default FourOathsAdapter;
