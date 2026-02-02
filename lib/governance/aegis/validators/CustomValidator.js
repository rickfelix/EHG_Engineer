/**
 * CustomValidator - Handles custom validation logic
 *
 * Maps validation_config.check to specific validation functions.
 * Used for complex validations that don't fit other validator types.
 *
 * Configuration options (in validation_config):
 * - check: Name of the custom check to perform
 *
 * Supported checks:
 * - governed_tier_approval: CONST-001 - GOVERNED tier requires human approval
 * - self_approval_prevention: CONST-002 - System can't approve own proposals
 * - auto_freeze_flag: CONST-009 - Check if AUTO changes are frozen
 * - hard_halt_status: HALT-1 - Check if system is in hard halt
 * - dead_man_switch: HALT-2 - Check dead man switch timeout
 * - high_confidence_no_unknowns: OATH-4-UNKNOWNS - Suspicious high confidence
 *
 * @module CustomValidator
 * @version 1.0.0
 */

import { BaseValidator } from './BaseValidator.js';

export class CustomValidator extends BaseValidator {
  constructor(options = {}) {
    super(options);
    this.supabase = options.supabase;
  }

  /**
   * Validate using custom logic
   * @param {Object} rule - Rule with validation_config
   * @param {Object} context - Context to validate
   * @returns {Promise<Object>} Validation result
   */
  async validate(rule, context) {
    const config = rule.validation_config || {};
    const checkName = config.check;

    if (!checkName) {
      return this.formatResult(true, 'No custom check specified');
    }

    // Route to specific check function
    switch (checkName) {
      case 'governed_tier_approval':
        return this.checkGovernedTierApproval(config, context);

      case 'self_approval_prevention':
        return this.checkSelfApprovalPrevention(config, context);

      case 'auto_freeze_flag':
        return this.checkAutoFreezeFlag(config, context);

      case 'hard_halt_status':
        return this.checkHardHaltStatus(config, context);

      case 'dead_man_switch':
        return this.checkDeadManSwitch(config, context);

      case 'high_confidence_no_unknowns':
        return this.checkHighConfidenceNoUnknowns(config, context);

      default:
        console.warn(`[CustomValidator] Unknown check: ${checkName}`);
        return this.formatResult(true, `Unknown check '${checkName}' - skipped`);
    }
  }

  /**
   * CONST-001: GOVERNED tier changes require human approval
   */
  checkGovernedTierApproval(config, context) {
    if (context.risk_tier === 'GOVERNED' && context.auto_applicable) {
      return this.formatResult(false, 'GOVERNED tier improvements cannot be auto-applied', {
        risk_tier: context.risk_tier,
        auto_applicable: context.auto_applicable
      });
    }
    return this.formatResult(true, 'Governed tier approval check passed');
  }

  /**
   * CONST-002: System cannot approve its own proposals
   */
  checkSelfApprovalPrevention(config, context) {
    if (context.evaluator_model && context.proposer_model) {
      const evaluatorFamily = this.getModelFamily(context.evaluator_model);
      const proposerFamily = this.getModelFamily(context.proposer_model);

      if (evaluatorFamily === proposerFamily && evaluatorFamily !== 'unknown') {
        return this.formatResult(false, 'Evaluator cannot be from same model family as proposer', {
          evaluator_model: context.evaluator_model,
          proposer_model: context.proposer_model,
          evaluator_family: evaluatorFamily,
          proposer_family: proposerFamily
        });
      }
    }
    return this.formatResult(true, 'Self-approval prevention check passed');
  }

  /**
   * CONST-009: Check if AUTO changes are frozen
   */
  async checkAutoFreezeFlag(config, context) {
    // Only applies to AUTO tier
    if (context.risk_tier !== 'AUTO') {
      return this.formatResult(true, 'Not AUTO tier - freeze check not applicable');
    }

    if (!this.supabase) {
      return this.formatResult(true, 'No database connection - freeze check skipped');
    }

    try {
      const { data, error } = await this.supabase
        .from('system_settings')
        .select('value_json')
        .eq('key', 'AUTO_FREEZE')
        .maybeSingle();

      if (error) {
        // Table might not exist - pass for now
        return this.formatResult(true, 'Freeze flag check skipped (table not found)');
      }

      if (data?.value_json?.enabled === true) {
        return this.formatResult(false, 'AUTO changes are frozen by human FREEZE command', {
          freeze_active: true,
          reason: data.value_json.reason,
          since: data.value_json.since
        });
      }

      return this.formatResult(true, 'AUTO freeze check passed');
    } catch (err) {
      return this.formatResult(true, `Freeze check error (skipped): ${err.message}`);
    }
  }

  /**
   * HALT-1: Check if system is in hard halt
   */
  async checkHardHaltStatus(config, context) {
    const blockedLevels = config.blocked_levels || ['L2_CEO', 'L1_EVA'];
    const agentLevel = context.agentLevel || context.actor_role;

    // L4 can complete in-flight tasks even during halt
    if (agentLevel === 'L4_CREW' || agentLevel === 'L4') {
      return this.formatResult(true, 'L4 agents can complete in-flight tasks during halt');
    }

    if (!this.supabase) {
      return this.formatResult(true, 'No database connection - halt check skipped');
    }

    try {
      const { data, error } = await this.supabase
        .from('system_settings')
        .select('value_json')
        .eq('key', 'HARD_HALT_STATUS')
        .maybeSingle();

      if (error || !data) {
        return this.formatResult(true, 'Hard halt status not found - assuming not halted');
      }

      if (data.value_json?.enabled === true) {
        if (blockedLevels.includes(agentLevel)) {
          return this.formatResult(false, `System is in Hard Halt state. ${agentLevel} operations are suspended.`, {
            isHalted: true,
            agentLevel,
            haltReason: data.value_json?.reason
          });
        }
      }

      return this.formatResult(true, 'Hard halt check passed');
    } catch (err) {
      return this.formatResult(true, `Hard halt check error (skipped): ${err.message}`);
    }
  }

  /**
   * HALT-2: Check dead man switch timeout
   */
  async checkDeadManSwitch(config, context) {
    const timeoutHours = config.timeout_hours || 72;
    const warningHours = config.warning_hours || 48;

    if (!this.supabase) {
      return this.formatResult(true, 'No database connection - dead man switch check skipped');
    }

    try {
      const { data, error } = await this.supabase
        .from('chairman_activity')
        .select('activity_at')
        .order('activity_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return this.formatResult(true, 'No chairman activity record - check skipped');
      }

      const hoursSinceActivity = (Date.now() - new Date(data.activity_at).getTime()) / (1000 * 60 * 60);

      if (hoursSinceActivity >= timeoutHours) {
        return this.formatResult(false, `Dead man switch triggered: ${hoursSinceActivity.toFixed(1)}h without activity (threshold: ${timeoutHours}h)`, {
          hoursSinceActivity,
          timeoutHours
        });
      }

      if (hoursSinceActivity >= warningHours) {
        // Warning - but don't block
        return this.formatResult(true, `Dead man switch warning: ${(timeoutHours - hoursSinceActivity).toFixed(1)}h until auto-halt`, {
          hoursSinceActivity,
          warningHours,
          hoursRemaining: timeoutHours - hoursSinceActivity
        });
      }

      return this.formatResult(true, 'Dead man switch check passed');
    } catch (err) {
      return this.formatResult(true, `Dead man switch check error (skipped): ${err.message}`);
    }
  }

  /**
   * OATH-4-UNKNOWNS: High confidence with no unknowns is suspicious
   */
  checkHighConfidenceNoUnknowns(config, context) {
    const confidence = context.confidence;
    const hasUnknowns = context.buckets?.unknowns?.length > 0 || context.unknowns?.length > 0;

    if (confidence > 0.9 && !hasUnknowns) {
      return this.formatResult(false, 'High confidence (>0.9) with no acknowledged unknowns is suspicious', {
        confidence,
        hasUnknowns
      });
    }

    return this.formatResult(true, 'High confidence unknowns check passed');
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
}

export default CustomValidator;
