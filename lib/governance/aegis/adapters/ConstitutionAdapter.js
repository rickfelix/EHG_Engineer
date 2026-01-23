/**
 * ConstitutionAdapter - Backward-compatible wrapper for Protocol Constitution
 *
 * Provides the same interface as the legacy ConstitutionValidator but routes
 * all validation through AEGIS. This enables gradual migration without
 * breaking existing callers.
 *
 * @module ConstitutionAdapter
 * @version 1.0.0
 */

import { getAegisEnforcer } from '../AegisEnforcer.js';
import { AegisRuleLoader } from '../AegisRuleLoader.js';
import { AEGIS_CONSTITUTIONS } from '../index.js';

/**
 * Maps AEGIS severity to legacy severity format
 */
const SEVERITY_MAP = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  ADVISORY: 'LOW'
};

/**
 * ConstitutionAdapter - Wraps AEGIS for Protocol Constitution validation
 *
 * Maintains the same API as the legacy ConstitutionValidator class.
 */
export class ConstitutionAdapter {
  constructor(supabase = null) {
    this.supabase = supabase;
    // Only pass supabase if truthy, otherwise let defaults handle initialization
    const options = supabase ? { supabase } : {};
    this.enforcer = getAegisEnforcer(options);
    this.ruleLoader = new AegisRuleLoader(options);
    this.constitutionRules = null;
    this.useAegis = true; // Feature flag for gradual rollout
  }

  /**
   * Load constitution rules from AEGIS
   * Maintains same signature as legacy loadRules()
   */
  async loadRules() {
    if (this.constitutionRules) return this.constitutionRules;

    const rules = await this.ruleLoader.loadRulesForConstitution(AEGIS_CONSTITUTIONS.PROTOCOL);

    // Transform to legacy format for backward compatibility
    this.constitutionRules = rules.map(rule => ({
      id: rule.id,
      rule_code: rule.rule_code,
      rule_text: rule.rule_text,
      category: rule.category,
      rationale: rule.rationale,
      // AEGIS-specific fields
      severity: rule.severity,
      enforcement_action: rule.enforcement_action,
      validation_type: rule.validation_type,
      validation_config: rule.validation_config
    }));

    return this.constitutionRules;
  }

  /**
   * Get violation severity for a rule
   * Maintains same signature as legacy getViolationSeverity()
   */
  getViolationSeverity(ruleCode) {
    const rules = this.constitutionRules || [];
    const rule = rules.find(r => r.rule_code === ruleCode);
    return rule ? SEVERITY_MAP[rule.severity] || 'MEDIUM' : 'MEDIUM';
  }

  /**
   * Validate CONST-001: GOVERNED tier requires human approval
   */
  validateConst001(improvement) {
    const violations = [];

    if (improvement.risk_tier === 'GOVERNED' && improvement.auto_applicable) {
      violations.push({
        rule_code: 'CONST-001',
        message: 'GOVERNED tier improvements cannot be auto-applied',
        severity: 'CRITICAL',
        details: {
          risk_tier: improvement.risk_tier,
          auto_applicable: improvement.auto_applicable
        }
      });
    }

    return violations;
  }

  /**
   * Validate CONST-002: System cannot approve its own proposals
   */
  validateConst002(improvement, evaluatorModel, proposerModel) {
    const violations = [];

    if (evaluatorModel && proposerModel) {
      const evaluatorFamily = this.getModelFamily(evaluatorModel);
      const proposerFamily = this.getModelFamily(proposerModel);

      if (evaluatorFamily === proposerFamily && evaluatorFamily !== 'unknown') {
        violations.push({
          rule_code: 'CONST-002',
          message: 'Evaluator cannot be from same model family as proposer',
          severity: 'CRITICAL',
          details: {
            evaluator_model: evaluatorModel,
            proposer_model: proposerModel,
            evaluator_family: evaluatorFamily,
            proposer_family: proposerFamily
          }
        });
      }
    }

    return violations;
  }

  /**
   * Validate CONST-003: All changes must be audit-logged
   */
  validateConst003(improvement) {
    const violations = [];

    if (improvement.target_table === 'audit_log' &&
        improvement.target_operation === 'DELETE') {
      violations.push({
        rule_code: 'CONST-003',
        message: 'Cannot delete audit log entries',
        severity: 'HIGH',
        details: {
          target_table: improvement.target_table,
          target_operation: improvement.target_operation
        }
      });
    }

    return violations;
  }

  /**
   * Validate CONST-004: Every change must be reversible
   */
  validateConst004(improvement) {
    const violations = [];

    const payload = improvement.payload || {};
    if (payload.irreversible === true) {
      violations.push({
        rule_code: 'CONST-004',
        message: 'Improvement is marked as irreversible',
        severity: 'HIGH',
        details: { irreversible: true }
      });
    }

    return violations;
  }

  /**
   * Validate CONST-005: Database-first architecture
   */
  validateConst005(improvement) {
    const violations = [];

    if (!improvement.target_table) {
      violations.push({
        rule_code: 'CONST-005',
        message: 'Improvement must specify target_table (database-first)',
        severity: 'HIGH',
        details: { target_table: improvement.target_table }
      });
    }

    if (improvement.target_table && improvement.target_table.includes('.md')) {
      violations.push({
        rule_code: 'CONST-005',
        message: 'Cannot target markdown files directly (database-first)',
        severity: 'HIGH',
        details: { target_table: improvement.target_table }
      });
    }

    return violations;
  }

  /**
   * Validate CONST-006: Complexity conservation
   */
  validateConst006(improvement) {
    const violations = [];

    const payload = improvement.payload || {};
    const payloadSize = JSON.stringify(payload).length;

    if (payloadSize > 5000) {
      violations.push({
        rule_code: 'CONST-006',
        message: 'Large payload may indicate complexity increase - review recommended',
        severity: 'MEDIUM',
        details: { payload_size: payloadSize, threshold: 5000 }
      });
    }

    return violations;
  }

  /**
   * Validate CONST-007: Max 3 AUTO changes per 24h
   * Note: This requires database access for counting
   */
  async validateConst007(improvement) {
    if (improvement.risk_tier !== 'AUTO') {
      return [];
    }

    // Use AEGIS enforcer for this check (it has the CountLimitValidator)
    const result = await this.enforcer.validate(AEGIS_CONSTITUTIONS.PROTOCOL, {
      risk_tier: improvement.risk_tier,
      target_table: improvement.target_table || 'protocol_improvement_queue'
    }, { recordViolations: false, incrementStats: false });

    // Extract CONST-007 violation if present
    return result.violations
      .filter(v => v.rule_code === 'CONST-007')
      .map(v => ({
        rule_code: v.rule_code,
        message: v.message,
        severity: 'CRITICAL',
        details: v.details
      }));
  }

  /**
   * Validate CONST-008: Chesterton's Fence
   */
  validateConst008(improvement) {
    const violations = [];

    if (improvement.target_operation === 'DELETE' ||
        (improvement.payload?.action === 'remove')) {
      if (!improvement.source_retro_id) {
        violations.push({
          rule_code: 'CONST-008',
          message: 'Removal requires review of original retrospective (Chesterton\'s Fence)',
          severity: 'MEDIUM',
          details: {
            operation: improvement.target_operation,
            source_retro_id: improvement.source_retro_id
          }
        });
      }
    }

    return violations;
  }

  /**
   * Validate CONST-009: Human FREEZE command
   */
  async validateConst009(improvement) {
    if (improvement.risk_tier !== 'AUTO') {
      return [];
    }

    // Use AEGIS enforcer for this check
    const result = await this.enforcer.validate(AEGIS_CONSTITUTIONS.PROTOCOL, {
      risk_tier: improvement.risk_tier,
      target_table: improvement.target_table || 'protocol_improvement_queue'
    }, { recordViolations: false, incrementStats: false });

    // Extract CONST-009 violation if present
    return result.violations
      .filter(v => v.rule_code === 'CONST-009')
      .map(v => ({
        rule_code: v.rule_code,
        message: v.message,
        severity: 'CRITICAL',
        details: v.details
      }));
  }

  /**
   * Get model family from model name
   */
  getModelFamily(modelName) {
    if (!modelName) return 'unknown';

    const lowerName = modelName.toLowerCase();

    if (lowerName.includes('claude') || lowerName.includes('anthropic')) {
      return 'anthropic';
    }
    if (lowerName.includes('gpt') || lowerName.includes('openai')) {
      return 'openai';
    }
    if (lowerName.includes('gemini') || lowerName.includes('google')) {
      return 'google';
    }

    return 'unknown';
  }

  /**
   * Validate improvement against all constitution rules
   *
   * This is the main entry point, maintaining the same signature as legacy.
   *
   * @param {Object} improvement - The improvement to validate
   * @param {Object} context - Additional context (evaluator_model, proposer_model)
   * @returns {Object} Validation result in legacy format
   */
  async validate(improvement, context = {}) {
    await this.loadRules();

    // Option 1: Use full AEGIS validation (recommended)
    if (this.useAegis) {
      return this._validateViaAegis(improvement, context);
    }

    // Option 2: Use legacy individual rule methods (fallback)
    return this._validateLegacy(improvement, context);
  }

  /**
   * Validate using AEGIS enforcer
   * @private
   */
  async _validateViaAegis(improvement, context) {
    // Build AEGIS context from improvement and context
    const aegisContext = {
      // From improvement
      risk_tier: improvement.risk_tier,
      target_table: improvement.target_table,
      target_operation: improvement.target_operation,
      payload: improvement.payload,
      source_retro_id: improvement.source_retro_id,
      auto_applicable: improvement.auto_applicable,

      // From context
      evaluator_model: context.evaluator_model,
      proposer_model: context.proposer_model,

      // Required by some validators
      actor: context.actor || 'system',
      timestamp: context.timestamp || new Date().toISOString()
    };

    const result = await this.enforcer.validate(
      AEGIS_CONSTITUTIONS.PROTOCOL,
      aegisContext,
      { recordViolations: true, incrementStats: true }
    );

    // Transform to legacy format
    const allViolations = [
      ...result.violations,
      ...result.warnings
    ].map(v => ({
      rule_code: v.rule_code,
      message: v.message,
      severity: v.severity,
      details: v.details || {}
    }));

    const criticalViolations = allViolations.filter(v => v.severity === 'CRITICAL');
    const highViolations = allViolations.filter(v => v.severity === 'HIGH');
    const mediumViolations = allViolations.filter(v => v.severity === 'MEDIUM');

    const passed = criticalViolations.length === 0;
    const requiresHumanReview = highViolations.length > 0 || mediumViolations.length > 0;

    return {
      passed,
      requires_human_review: requiresHumanReview,
      violations: allViolations,
      critical_count: criticalViolations.length,
      high_count: highViolations.length,
      medium_count: mediumViolations.length,
      rules_checked: result.rulesChecked,
      evaluated_at: result.evaluatedAt,
      // AEGIS metadata
      aegis_enabled: true,
      aegis_constitution: AEGIS_CONSTITUTIONS.PROTOCOL
    };
  }

  /**
   * Validate using legacy individual methods (fallback)
   * @private
   */
  async _validateLegacy(improvement, context) {
    const allViolations = [];

    allViolations.push(...this.validateConst001(improvement));
    allViolations.push(...this.validateConst002(
      improvement,
      context.evaluator_model,
      context.proposer_model
    ));
    allViolations.push(...this.validateConst003(improvement));
    allViolations.push(...this.validateConst004(improvement));
    allViolations.push(...this.validateConst005(improvement));
    allViolations.push(...this.validateConst006(improvement));
    allViolations.push(...await this.validateConst007(improvement));
    allViolations.push(...this.validateConst008(improvement));
    allViolations.push(...await this.validateConst009(improvement));

    const criticalViolations = allViolations.filter(v => v.severity === 'CRITICAL');
    const highViolations = allViolations.filter(v => v.severity === 'HIGH');
    const mediumViolations = allViolations.filter(v => v.severity === 'MEDIUM');

    const passed = criticalViolations.length === 0;
    const requiresHumanReview = highViolations.length > 0 || mediumViolations.length > 0;

    return {
      passed,
      requires_human_review: requiresHumanReview,
      violations: allViolations,
      critical_count: criticalViolations.length,
      high_count: highViolations.length,
      medium_count: mediumViolations.length,
      rules_checked: this.constitutionRules.length,
      evaluated_at: new Date().toISOString(),
      aegis_enabled: false
    };
  }

  /**
   * Enable or disable AEGIS mode
   * @param {boolean} enabled - Whether to use AEGIS
   */
  setAegisMode(enabled) {
    this.useAegis = enabled;
  }
}

export default ConstitutionAdapter;
