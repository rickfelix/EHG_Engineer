/**
 * Constitution Validator
 * Phase 1: SD-LEO-SELF-IMPROVE-AIJUDGE-001
 *
 * Validates improvement proposals against the 9 immutable constitution rules
 *
 * AEGIS Integration (Phase 2):
 * This validator now supports routing through the AEGIS unified governance system.
 * AEGIS enforcement is now active by default. Set USE_AEGIS=false to disable.
 */

import { TABLES, VIOLATION_SEVERITY } from './config.js';

// AEGIS Integration - lazy loaded to avoid circular dependencies
let ConstitutionAdapter = null;
let aegisAdapter = null;

async function getAegisAdapter(supabase) {
  if (aegisAdapter) return aegisAdapter;

  try {
    const module = await import('../../../lib/governance/aegis/adapters/ConstitutionAdapter.js');
    ConstitutionAdapter = module.ConstitutionAdapter;
    aegisAdapter = new ConstitutionAdapter(supabase);
    return aegisAdapter;
  } catch (err) {
    console.warn('[ConstitutionValidator] AEGIS adapter not available:', err.message);
    return null;
  }
}

/**
 * ConstitutionValidator class
 * Validates improvements against protocol constitution rules
 */
export class ConstitutionValidator {
  constructor(supabase) {
    this.supabase = supabase;
    this.constitutionRules = null;
    // AEGIS enforcement active by default (GOV-008)
    // Set USE_AEGIS=false to explicitly disable
    this.useAegis = process.env.USE_AEGIS !== 'false';
  }

  /**
   * Enable or disable AEGIS mode
   * @param {boolean} enabled - Whether to use AEGIS
   */
  setAegisMode(enabled) {
    this.useAegis = enabled;
  }

  /**
   * Load constitution rules from database
   */
  async loadRules() {
    if (this.constitutionRules) return this.constitutionRules;

    const { data, error } = await this.supabase
      .from(TABLES.CONSTITUTION)
      .select('*')
      .order('rule_code');

    if (error) {
      throw new Error(`Failed to load constitution rules: ${error.message}`);
    }

    this.constitutionRules = data || [];
    return this.constitutionRules;
  }

  /**
   * Get violation severity for a rule
   */
  getViolationSeverity(ruleCode) {
    for (const [severity, config] of Object.entries(VIOLATION_SEVERITY)) {
      if (config.rules.includes(ruleCode)) {
        return severity;
      }
    }
    return 'MEDIUM'; // Default severity
  }

  /**
   * Validate improvement against CONST-001: GOVERNED tier requires human approval
   */
  validateConst001(improvement) {
    const violations = [];

    // Check if this is a GOVERNED tier improvement being auto-applied
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
   * Validate improvement against CONST-002: System cannot approve its own proposals
   */
  validateConst002(improvement, evaluatorModel, proposerModel) {
    const violations = [];

    // Check if same model family is evaluating its own proposal
    if (evaluatorModel && proposerModel) {
      const evaluatorFamily = this.getModelFamily(evaluatorModel);
      const proposerFamily = this.getModelFamily(proposerModel);

      if (evaluatorFamily === proposerFamily) {
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
   * Validate improvement against CONST-003: All changes must be audit-logged
   */
  validateConst003(improvement) {
    const violations = [];

    // Check if improvement targets audit bypass
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
   * Validate improvement against CONST-004: Every change must be reversible
   */
  validateConst004(improvement) {
    const violations = [];

    // Check if improvement explicitly marks itself as irreversible
    const payload = improvement.payload || {};
    if (payload.irreversible === true) {
      violations.push({
        rule_code: 'CONST-004',
        message: 'Improvement is marked as irreversible',
        severity: 'HIGH',
        details: {
          irreversible: true
        }
      });
    }

    return violations;
  }

  /**
   * Validate improvement against CONST-005: Database-first architecture
   */
  validateConst005(improvement) {
    const violations = [];

    // Check if improvement has target_table specified
    if (!improvement.target_table) {
      violations.push({
        rule_code: 'CONST-005',
        message: 'Improvement must specify target_table (database-first)',
        severity: 'HIGH',
        details: {
          target_table: improvement.target_table
        }
      });
    }

    // Check for file-based targets (markdown, etc.)
    if (improvement.target_table && improvement.target_table.includes('.md')) {
      violations.push({
        rule_code: 'CONST-005',
        message: 'Cannot target markdown files directly (database-first)',
        severity: 'HIGH',
        details: {
          target_table: improvement.target_table
        }
      });
    }

    return violations;
  }

  /**
   * Validate improvement against CONST-006: Complexity conservation
   */
  validateConst006(improvement) {
    const violations = [];

    // Complexity conservation is advisory - flag for review if payload is complex
    const payload = improvement.payload || {};
    const payloadSize = JSON.stringify(payload).length;

    if (payloadSize > 5000) {
      violations.push({
        rule_code: 'CONST-006',
        message: 'Large payload may indicate complexity increase - review recommended',
        severity: 'MEDIUM',
        details: {
          payload_size: payloadSize,
          threshold: 5000
        }
      });
    }

    return violations;
  }

  /**
   * Validate improvement against CONST-007: Max 3 AUTO changes per 24h
   */
  async validateConst007(improvement) {
    const violations = [];

    // Only check for AUTO tier improvements
    if (improvement.risk_tier !== 'AUTO') {
      return violations;
    }

    // Count AUTO changes in last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count, error } = await this.supabase
      .from(TABLES.QUEUE)
      .select('*', { count: 'exact', head: true })
      .eq('risk_tier', 'AUTO')
      .eq('status', 'APPLIED')
      .gte('applied_at', twentyFourHoursAgo);

    if (error) {
      // Fail safe - if we can't check, flag as violation
      violations.push({
        rule_code: 'CONST-007',
        message: 'Cannot verify AUTO change count - flagging for review',
        severity: 'CRITICAL',
        details: {
          error: error.message
        }
      });
      return violations;
    }

    if (count >= 3) {
      violations.push({
        rule_code: 'CONST-007',
        message: 'Maximum AUTO changes per 24h reached (3)',
        severity: 'CRITICAL',
        details: {
          auto_changes_in_24h: count,
          max_allowed: 3
        }
      });
    }

    return violations;
  }

  /**
   * Validate improvement against CONST-008: Chesterton's Fence
   */
  validateConst008(improvement) {
    const violations = [];

    // Check if removing a rule without reviewing original retrospective
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
   * Validate improvement against CONST-009: Human FREEZE command
   */
  async validateConst009(improvement) {
    const violations = [];

    // Only affects AUTO tier
    if (improvement.risk_tier !== 'AUTO') {
      return violations;
    }

    // Check if FREEZE flag is set in unified system_settings table
    const { data, error } = await this.supabase
      .from('system_settings')
      .select('value_json')
      .eq('key', 'AUTO_FREEZE')
      .maybeSingle();

    // If table doesn't exist or no flag, assume not frozen
    if (error) {
      // Table might not exist yet - pass for now
      console.warn('[ConstitutionValidator] CONST-009 check skipped:', error.message);
      return violations;
    }

    if (data?.value_json?.enabled === true) {
      violations.push({
        rule_code: 'CONST-009',
        message: 'AUTO changes are frozen by human FREEZE command',
        severity: 'CRITICAL',
        details: {
          freeze_active: true,
          reason: data.value_json.reason,
          since: data.value_json.since
        }
      });
    }

    return violations;
  }

  /**
   * Validate improvement against CONST-010: Non-Manipulation Principle
   * SD-LEO-INFRA-CONST-AMEND-001
   *
   * Detects potentially manipulative framing in AI-generated improvement proposals.
   * Based on Anthropic's Claude Constitution principle of non-manipulative persuasion.
   *
   * Severity: MEDIUM (advisory - flags for human review but does not block)
   */
  validateConst010(improvement) {
    const violations = [];

    // Combine description and payload text for analysis
    const description = improvement.description || '';
    const payloadText = JSON.stringify(improvement.payload || {});
    const combinedText = `${description} ${payloadText}`;

    // Define manipulative language patterns
    const manipulativePatterns = [
      // Urgent/pressure language
      /\b(URGENT|CRITICAL|IMMEDIATE|ASAP|RIGHT NOW|MUST ACT|TIME-SENSITIVE)\b/i,
      // Certainty claims that bypass nuance
      /\b(MUST|ALWAYS|NEVER|DEFINITELY|CERTAINLY|OBVIOUSLY|CLEARLY MUST)\b/i,
      // Emotional appeals / fear tactics
      /\b(DISASTER|CATASTROPHIC|CRISIS|EMERGENCY|DEVASTATING|DANGEROUS|FATAL)\b/i,
      // False scarcity / no-alternative framing
      /\b(ONLY OPTION|NO ALTERNATIVE|NO CHOICE|ONLY WAY|MUST IMMEDIATELY)\b/i
    ];

    // Count how many patterns match
    const matchedPatterns = manipulativePatterns.filter(pattern => pattern.test(combinedText));
    const matchCount = matchedPatterns.length;

    // Require 2+ pattern matches to flag (reduces false positives)
    if (matchCount >= 2) {
      violations.push({
        rule_code: 'CONST-010',
        message: 'Improvement description contains potentially manipulative language patterns. Rewrite with neutral, factual language.',
        severity: 'MEDIUM',
        details: {
          pattern_matches: matchCount,
          threshold: 2,
          recommendation: 'Use factual evidence and reasoning instead of urgency or emotional framing'
        }
      });
    }

    return violations;
  }

  /**
   * Validate improvement against CONST-011: Value Priority Hierarchy
   * SD-LEO-INFRA-CONST-AMEND-001
   *
   * Provides advisory guidance when multiple constitutional rules may conflict.
   * Based on Anthropic's Claude Constitution value ordering (Safe > Ethical > Compliant > Helpful).
   *
   * Priority Order:
   *   1. Human Safety (CONST-001, CONST-002, CONST-009)
   *   2. System Integrity (CONST-004, CONST-007)
   *   3. Audit Compliance (CONST-003, CONST-008)
   *   4. Operational Efficiency (CONST-005, CONST-006, CONST-010)
   *
   * Severity: ADVISORY (informational only - helps human reviewers)
   */
  validateConst011(improvement, context = {}) {
    const violations = [];

    // CONST-011 is advisory only - does not generate violations by itself
    // It provides guidance when multiple violations exist from different categories

    // Define value hierarchy categories
    const valueHierarchy = {
      humanSafety: {
        priority: 1,
        rules: ['CONST-001', 'CONST-002', 'CONST-009'],
        description: 'Human Safety - highest priority'
      },
      systemIntegrity: {
        priority: 2,
        rules: ['CONST-004', 'CONST-007'],
        description: 'System Integrity'
      },
      auditCompliance: {
        priority: 3,
        rules: ['CONST-003', 'CONST-008'],
        description: 'Audit Compliance'
      },
      operationalEfficiency: {
        priority: 4,
        rules: ['CONST-005', 'CONST-006', 'CONST-010'],
        description: 'Operational Efficiency - lowest priority'
      }
    };

    // If context includes existing violations from multiple categories,
    // provide advisory guidance on priority order
    if (context.existing_violations && context.existing_violations.length >= 2) {
      const violatedRules = context.existing_violations.map(v => v.rule_code);
      const categoriesViolated = new Set();

      for (const [category, config] of Object.entries(valueHierarchy)) {
        if (config.rules.some(rule => violatedRules.includes(rule))) {
          categoriesViolated.add(category);
        }
      }

      if (categoriesViolated.size >= 2) {
        // Multiple categories violated - provide hierarchy guidance
        violations.push({
          rule_code: 'CONST-011',
          message: 'Multiple rule categories violated. When resolving conflicts, prioritize: Human Safety > System Integrity > Audit Compliance > Operational Efficiency.',
          severity: 'ADVISORY',
          details: {
            categories_violated: Array.from(categoriesViolated),
            hierarchy_guidance: true,
            value_hierarchy: valueHierarchy
          }
        });
      }
    }

    return violations;
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
   * @param {Object} improvement - The improvement to validate
   * @param {Object} context - Additional context (evaluator_model, proposer_model)
   * @returns {Object} Validation result
   */
  async validate(improvement, context = {}) {
    // AEGIS Integration: Route through unified governance system if enabled
    if (this.useAegis) {
      try {
        const adapter = await getAegisAdapter(this.supabase);
        if (adapter) {
          console.log('[ConstitutionValidator] Using AEGIS for validation');
          return await adapter.validate(improvement, context);
        }
        console.warn('[ConstitutionValidator] AEGIS adapter unavailable, falling back to legacy');
      } catch (err) {
        console.warn('[ConstitutionValidator] AEGIS validation failed, falling back:', err.message);
      }
    }

    // Legacy validation path
    await this.loadRules();

    const allViolations = [];

    // Run all constitution validations
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
    allViolations.push(...this.validateConst010(improvement));

    // Run CONST-011 with existing violations as context for hierarchy guidance
    allViolations.push(...this.validateConst011(improvement, {
      ...context,
      existing_violations: allViolations
    }));

    // Categorize violations
    const criticalViolations = allViolations.filter(v => v.severity === 'CRITICAL');
    const highViolations = allViolations.filter(v => v.severity === 'HIGH');
    const mediumViolations = allViolations.filter(v => v.severity === 'MEDIUM');
    const advisoryViolations = allViolations.filter(v => v.severity === 'ADVISORY');

    // Determine overall result
    const passed = criticalViolations.length === 0;
    const requiresHumanReview = highViolations.length > 0 || mediumViolations.length > 0;

    return {
      passed,
      requires_human_review: requiresHumanReview,
      violations: allViolations,
      critical_count: criticalViolations.length,
      high_count: highViolations.length,
      medium_count: mediumViolations.length,
      advisory_count: advisoryViolations.length,
      rules_checked: this.constitutionRules.length,
      evaluated_at: new Date().toISOString(),
      aegis_enabled: false
    };
  }
}

export default ConstitutionValidator;
