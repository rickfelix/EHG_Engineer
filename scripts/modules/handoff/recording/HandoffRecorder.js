/**
 * HandoffRecorder - Records handoff executions and artifacts
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * Manages recording of successful/failed handoffs and creates artifacts.
 *
 * IMPORTANT DISTINCTION (Root Cause Fix - SD-VENTURE-STAGE0-UI-001):
 * - Phase TRANSITIONS (LEAD-TO-PLAN, PLAN-TO-EXEC, etc.) create artifacts in sd_phase_handoffs
 *   because they transfer work from one phase to another with from_phase → to_phase
 * - COMPLETION actions (LEAD-FINAL-APPROVAL) only record in leo_handoff_executions
 *   because they don't transfer work - they complete the SD lifecycle
 *
 * The sd_phase_handoffs table has a constraint: to_phase IN ('LEAD', 'PLAN', 'EXEC')
 * LEAD-FINAL-APPROVAL would parse to to_phase='APPROVAL' which violates this constraint.
 * Instead of forcing it, we recognize that completion actions are fundamentally different.
 */

import { randomUUID } from 'crypto';
import ContentBuilder from '../content/ContentBuilder.js';
import ValidationOrchestrator from '../validation/ValidationOrchestrator.js';

/**
 * Handoff types that are COMPLETION actions, not phase transitions.
 * These only record in leo_handoff_executions, not sd_phase_handoffs.
 *
 * Why: sd_phase_handoffs has constraint to_phase IN ('LEAD', 'PLAN', 'EXEC')
 * Completion actions don't have a valid to_phase - they end the lifecycle.
 */
const COMPLETION_ACTIONS = [
  'LEAD-FINAL-APPROVAL'  // Completes SD lifecycle after PLAN-TO-LEAD
];

/**
 * Check if a handoff type is a completion action (not a phase transition)
 * @param {string} handoffType - Handoff type to check
 * @returns {boolean} True if this is a completion action
 */
function isCompletionAction(handoffType) {
  return COMPLETION_ACTIONS.includes(handoffType.toUpperCase());
}

export class HandoffRecorder {
  constructor(supabase, options = {}) {
    if (!supabase) {
      throw new Error('HandoffRecorder requires a Supabase client');
    }
    this.supabase = supabase;
    this.contentBuilder = options.contentBuilder || new ContentBuilder();
    this.validationOrchestrator = options.validationOrchestrator || new ValidationOrchestrator(supabase);
  }

  /**
   * Validate SD ID exists in database
   *
   * FIX (2025-12-27): strategic_directives_v2.id uses VARCHAR format (e.g., "SD-UNIFIED-PATH-3.1.1"),
   * NOT UUIDs. The previous _resolveToUUID was incorrectly converting to UUIDs which caused
   * FK constraint failures when storing handoffs in sd_phase_handoffs table.
   *
   * @param {string} sdId - Strategic Directive ID (VARCHAR format like "SD-XXX")
   * @returns {Promise<string>} The validated SD ID (unchanged)
   */
  async _resolveToUUID(sdId) {
    // NOTE: Despite the method name, we do NOT convert to UUID.
    // strategic_directives_v2.id is VARCHAR, not UUID.
    // sd_phase_handoffs.sd_id references this VARCHAR column.
    // We just validate the ID exists and return it unchanged.

    const { data: sd, error } = await this.supabase
      .from('strategic_directives_v2')
      .select('id')
      .or(`id.eq.${sdId},legacy_id.eq.${sdId},sd_key.eq.${sdId}`)
      .single();

    if (error || !sd) {
      console.warn(`⚠️  Could not verify SD exists: ${sdId}`);
      // Return original - let FK constraint catch the error with clear message
      return sdId;
    }

    // Return the canonical ID from the database (ensures exact match)
    return sd.id;
  }

  /**
   * Normalize validation score to integer 0-100
   * @param {number} score - Raw score value
   * @returns {number} Normalized integer score
   */
  _normalizeValidationScore(score) {
    // Default to 100 if not provided
    if (score === null || score === undefined) {
      return 100;
    }

    // Convert to number if string
    const numScore = typeof score === 'string' ? parseFloat(score) : score;

    // Round to nearest integer
    const rounded = Math.round(numScore);

    // Clamp to 0-100 range
    return Math.max(0, Math.min(100, rounded));
  }

  /**
   * Record a successful handoff execution
   * @param {string} handoffType - Handoff type
   * @param {string} sdId - Strategic Directive ID
   * @param {object} result - Execution result
   * @param {object} template - Handoff template (optional)
   */
  async recordSuccess(handoffType, sdId, result, template = null) {
    const executionId = randomUUID();

    // SD-VENTURE-STAGE0-UI-001: Resolve to UUID for FK constraints
    const sdUuid = await this._resolveToUUID(sdId);

    // Use normalizedScore (weighted average) if available, otherwise calculate from totalScore/maxScore
    // This fixes the bug where summed scores (266) were being clamped to 100
    let rawScore;
    if (result.normalizedScore !== undefined) {
      rawScore = result.normalizedScore;
    } else if (result.qualityScore !== undefined) {
      rawScore = result.qualityScore;
    } else if (result.totalScore !== undefined && result.maxScore !== undefined && result.maxScore > 0) {
      rawScore = Math.round((result.totalScore / result.maxScore) * 100);
    } else {
      rawScore = result.totalScore || 100;
    }
    const normalizedScore = this._normalizeValidationScore(rawScore);

    console.log(`🔍 Validation score: ${rawScore}% (normalized: ${normalizedScore}%)`);

    const execution = {
      id: executionId,
      template_id: template?.id,
      from_agent: handoffType.split('-')[0],
      to_agent: handoffType.split('-')[2],
      sd_id: sdUuid,
      prd_id: result.prdId,
      handoff_type: handoffType,
      status: 'accepted',
      validation_score: normalizedScore,
      validation_passed: true,
      // FIX: Store validation summary instead of full result to prevent bloat
      validation_details: {
        summary: {
          passed: result.passed,
          score: result.normalizedScore || result.totalScore,
          gate_count: result.gateCount,
          failed_gate: result.failedGate || null,
          issue_count: (result.issues || []).length,
          warning_count: (result.warnings || []).length
        },
        verified_at: new Date().toISOString(),
        verifier: 'unified-handoff-system.js'
      },
      accepted_at: new Date().toISOString(),
      created_by: 'UNIFIED-HANDOFF-SYSTEM'
    };

    try {
      // Pre-validate execution data
      const preValidation = await this.validationOrchestrator.preValidateData('leo_handoff_executions', execution);
      if (!preValidation.valid) {
        throw new Error(`Pre-validation failed for leo_handoff_executions: ${preValidation.errors.map(e => e.message).join('; ')}`);
      }

      const { error } = await this.supabase
        .from('leo_handoff_executions')
        .insert(execution)
        .select();

      if (error) {
        console.error('❌ Failed to store handoff execution:', error.message);
        console.error('   Execution data:', JSON.stringify(execution, null, 2));
        throw error;
      }

      console.log(`📝 Success recorded: ${executionId}`);

      // Create handoff artifact ONLY for phase transitions, not completion actions
      // Root Cause Fix (SD-VENTURE-STAGE0-UI-001):
      // - Completion actions (LEAD-FINAL-APPROVAL) don't have a valid to_phase
      // - sd_phase_handoffs requires to_phase IN ('LEAD', 'PLAN', 'EXEC')
      // - Completion actions end the lifecycle, they don't transition to another phase
      if (isCompletionAction(handoffType)) {
        console.log(`ℹ️  ${handoffType} is a completion action - skipping sd_phase_handoffs artifact`);
        console.log(`   (Completion recorded in leo_handoff_executions: ${executionId})`);
      } else {
        await this.createArtifact(handoffType, sdId, result, executionId);
      }

      return executionId;

    } catch (error) {
      console.error('⚠️  Critical: Could not store execution:', error.message);
      throw error;
    }
  }

  /**
   * Record a failed/rejected handoff execution
   * @param {string} handoffType - Handoff type
   * @param {string} sdId - Strategic Directive ID
   * @param {object} result - Failure result
   * @param {object} template - Handoff template (optional)
   */
  async recordFailure(handoffType, sdId, result, template = null) {
    const executionId = randomUUID();

    // SD-VENTURE-STAGE0-UI-001: Resolve to UUID for FK constraints
    const sdUuid = await this._resolveToUUID(sdId);

    const rejectionContent = this.contentBuilder.buildRejection(handoffType, sdId, result);

    // Normalize validation score
    const rawScore = result.actualScore || 0;
    const normalizedScore = this._normalizeValidationScore(rawScore);

    const execution = {
      id: executionId,
      template_id: template?.id,
      from_phase: handoffType.split('-')[0],
      to_phase: handoffType.split('-')[2],
      sd_id: sdUuid,
      handoff_type: handoffType,
      status: 'rejected',
      ...rejectionContent,
      validation_score: normalizedScore,
      validation_passed: false,
      // FIX: Store validation summary instead of full result to prevent bloat
      validation_details: {
        summary: {
          passed: false,
          score: result.normalizedScore || result.actualScore || 0,
          gate_count: result.gateCount,
          failed_gate: result.failedGate || null,
          issue_count: (result.issues || []).length,
          warning_count: (result.warnings || []).length
        },
        rejected_at: new Date().toISOString(),
        reason: result.reasonCode,
        message: result.message
      },
      rejection_reason: result.message,
      created_by: 'UNIFIED-HANDOFF-SYSTEM'
    };

    try {
      // Pre-validate - for rejections, try to fix common issues
      const preValidation = await this.validationOrchestrator.preValidateData('sd_phase_handoffs', execution);
      if (!preValidation.valid) {
        console.warn('⚠️  Pre-validation failed for rejection record, attempting with modified data');
        preValidation.errors.forEach(err => {
          if (err.validValues && err.validValues.length > 0) {
            execution[err.field] = err.validValues[0];
            console.log(`   Fixed ${err.field}: ${err.value} → ${err.validValues[0]}`);
          }
        });
      }

      const { error } = await this.supabase
        .from('sd_phase_handoffs')
        .insert(execution)
        .select();

      if (error) {
        console.error('❌ Failed to store handoff rejection:', error.message);
        throw error;
      }

      console.log(`📝 Failure recorded: ${executionId}`);
      return executionId;

    } catch (error) {
      console.error('⚠️  Critical: Could not store rejection:', error.message);
      // Don't throw - rejection recording is less critical
      return null;
    }
  }

  /**
   * Record a system error
   * @param {string} handoffType - Handoff type
   * @param {string} sdId - Strategic Directive ID
   * @param {string} errorMessage - Error message
   */
  async recordSystemError(handoffType, sdId, errorMessage) {
    const executionId = randomUUID();

    // SD-VENTURE-STAGE0-UI-001: Resolve to UUID for FK constraints
    const sdUuid = await this._resolveToUUID(sdId);

    const execution = {
      id: executionId,
      sd_id: sdUuid,
      handoff_type: handoffType,
      status: 'failed',
      executive_summary: `System error during ${handoffType} handoff: ${errorMessage}`,
      deliverables_manifest: 'Handoff could not be completed due to system error',
      key_decisions: 'No decisions made - system error occurred',
      known_issues: errorMessage,
      resource_utilization: '',
      action_items: '- [ ] Investigate and fix system error\n- [ ] Retry handoff',
      completeness_report: 'System Error - handoff incomplete',
      validation_score: 0,
      validation_passed: false,
      validation_details: {
        error: errorMessage,
        occurred_at: new Date().toISOString()
      },
      created_by: 'UNIFIED-HANDOFF-SYSTEM'
    };

    try {
      const { error } = await this.supabase
        .from('sd_phase_handoffs')
        .insert(execution)
        .select();

      if (error) {
        console.error('Failed to record system error:', error.message);
      } else {
        console.log(`📝 System error recorded: ${executionId}`);
      }
    } catch (e) {
      console.error('Could not record system error:', e.message);
    }
  }

  /**
   * Create the actual handoff artifact in sd_phase_handoffs table
   * @param {string} handoffType - Handoff type
   * @param {string} sdId - Strategic Directive ID
   * @param {object} result - Execution result
   * @param {string} executionId - Related execution record ID
   */
  async createArtifact(handoffType, sdId, result, executionId) {
    try {
      // SD-VENTURE-STAGE0-UI-001: Resolve to UUID for FK constraints and queries
      const sdUuid = await this._resolveToUUID(sdId);

      // Get SD details (using UUID)
      const { data: sd } = await this.supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('id', sdUuid)
        .single();

      if (!sd) {
        console.warn('⚠️  Cannot create handoff artifact: SD not found');
        return null;
      }

      // Get sub-agent results (using UUID)
      const { data: subAgentResults } = await this.supabase
        .from('sub_agent_execution_results')
        .select('*')
        .eq('sd_id', sdUuid)
        .order('created_at', { ascending: false })
        .limit(10);

      // Build content
      const [fromPhase, , toPhase] = handoffType.split('-');
      const handoffContent = this.contentBuilder.build(handoffType, sd, result, subAgentResults);

      // Use normalizedScore (weighted average) if available, otherwise calculate from totalScore/maxScore
      let rawScore;
      if (result.normalizedScore !== undefined) {
        rawScore = result.normalizedScore;
      } else if (result.qualityScore !== undefined) {
        rawScore = result.qualityScore;
      } else if (result.totalScore !== undefined && result.maxScore !== undefined && result.maxScore > 0) {
        rawScore = Math.round((result.totalScore / result.maxScore) * 100);
      } else {
        rawScore = result.totalScore || 100;
      }
      const normalizedScore = this._normalizeValidationScore(rawScore);

      const handoffId = randomUUID();

      // Build metadata with gate-specific validation results for downstream handoffs
      // PlanToLeadExecutor expects metadata.gate2_validation from EXEC-TO-PLAN
      // LeadFinalApprovalExecutor expects metadata.gate1_validation from PLAN-TO-EXEC
      const metadata = {
        execution_id: executionId,
        quality_score: normalizedScore,
        created_via: 'unified-handoff-system',
        sub_agent_count: subAgentResults?.length || 0
      };

      // Extract gate validation results for cross-handoff traceability
      if (result.gateResults) {
        // EXEC-TO-PLAN: Store Gate 2 results for PLAN-TO-LEAD
        if (handoffType === 'EXEC-TO-PLAN' && result.gateResults.GATE2_IMPLEMENTATION_FIDELITY) {
          metadata.gate2_validation = result.gateResults.GATE2_IMPLEMENTATION_FIDELITY;
        }
        // PLAN-TO-EXEC: Store Gate 1 results for LEAD-FINAL-APPROVAL
        if (handoffType === 'PLAN-TO-EXEC' && result.gateResults.GATE1_PRD_QUALITY) {
          metadata.gate1_validation = result.gateResults.GATE1_PRD_QUALITY;
        }
        // Store all gate results for comprehensive audit trail
        metadata.gate_results = result.gateResults;
      }

      const handoffRecord = {
        id: handoffId,
        sd_id: sdUuid,
        from_phase: fromPhase,
        to_phase: toPhase,
        handoff_type: handoffType,
        status: 'pending_acceptance', // Insert as pending first
        ...handoffContent,
        validation_score: normalizedScore,
        validation_passed: result.success !== false,
        validation_details: result.validation || {},
        metadata,
        created_by: 'UNIFIED-HANDOFF-SYSTEM'
      };

      // Log elements for debugging
      this.contentBuilder.logElements(handoffRecord);

      // Pre-validate
      const preValidation = await this.validationOrchestrator.preValidateData('sd_phase_handoffs', handoffRecord);
      if (!preValidation.valid) {
        console.error('❌ Handoff artifact pre-validation failed');
        throw new Error(`Pre-validation failed: ${preValidation.errors.map(e => e.message).join('; ')}`);
      }

      // Insert as pending
      const { error: insertError } = await this.supabase
        .from('sd_phase_handoffs')
        .insert(handoffRecord);

      if (insertError) {
        console.error('❌ Failed to create handoff artifact:', insertError.message);
        throw insertError;
      }

      console.log('📄 Handoff artifact created (pending validation)...');

      // Update to accepted
      const { error: updateError } = await this.supabase
        .from('sd_phase_handoffs')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .eq('id', handoffId);

      if (updateError) {
        console.error('❌ Failed to accept handoff:', updateError.message);
        // Clean up
        await this.supabase.from('sd_phase_handoffs').delete().eq('id', handoffId);
        throw updateError;
      }

      console.log('✅ Handoff accepted and stored in sd_phase_handoffs');
      return handoffId;

    } catch (error) {
      console.error('⚠️  Could not create handoff artifact:', error.message);
      return null;
    }
  }
}

export default HandoffRecorder;
