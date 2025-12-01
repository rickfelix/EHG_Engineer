/**
 * HandoffRecorder - Records handoff executions and artifacts
 * Part of LEO Protocol Unified Handoff System refactor
 *
 * Manages recording of successful/failed handoffs and creates artifacts.
 */

import { randomUUID } from 'crypto';
import ContentBuilder from '../content/ContentBuilder.js';
import ValidationOrchestrator from '../validation/ValidationOrchestrator.js';

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
   * Record a successful handoff execution
   * @param {string} handoffType - Handoff type
   * @param {string} sdId - Strategic Directive ID
   * @param {object} result - Execution result
   * @param {object} template - Handoff template (optional)
   */
  async recordSuccess(handoffType, sdId, result, template = null) {
    const executionId = randomUUID();

    const execution = {
      id: executionId,
      template_id: template?.id,
      from_agent: handoffType.split('-')[0],
      to_agent: handoffType.split('-')[2],
      sd_id: sdId,
      prd_id: result.prdId,
      handoff_type: handoffType,
      status: 'accepted',
      validation_score: result.qualityScore || 100,
      validation_passed: true,
      validation_details: {
        result: result,
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
        throw error;
      }

      console.log(`📝 Success recorded: ${executionId}`);

      // Create the actual handoff artifact
      await this.createArtifact(handoffType, sdId, result, executionId);

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

    const rejectionContent = this.contentBuilder.buildRejection(handoffType, sdId, result);

    const execution = {
      id: executionId,
      template_id: template?.id,
      from_phase: handoffType.split('-')[0],
      to_phase: handoffType.split('-')[2],
      sd_id: sdId,
      handoff_type: handoffType,
      status: 'rejected',
      ...rejectionContent,
      validation_score: result.actualScore || 0,
      validation_passed: false,
      validation_details: {
        result: result,
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

    const execution = {
      id: executionId,
      sd_id: sdId,
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
      // Get SD details
      const { data: sd } = await this.supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('id', sdId)
        .single();

      if (!sd) {
        console.warn('⚠️  Cannot create handoff artifact: SD not found');
        return null;
      }

      // Get sub-agent results
      const { data: subAgentResults } = await this.supabase
        .from('sub_agent_execution_results')
        .select('*')
        .eq('sd_id', sdId)
        .order('created_at', { ascending: false })
        .limit(10);

      // Build content
      const [fromPhase, , toPhase] = handoffType.split('-');
      const handoffContent = this.contentBuilder.build(handoffType, sd, result, subAgentResults);

      const handoffId = randomUUID();
      const handoffRecord = {
        id: handoffId,
        sd_id: sdId,
        from_phase: fromPhase,
        to_phase: toPhase,
        handoff_type: handoffType,
        status: 'pending_acceptance', // Insert as pending first
        ...handoffContent,
        validation_score: result.qualityScore || 100,
        validation_passed: result.success !== false,
        validation_details: result.validation || {},
        metadata: {
          execution_id: executionId,
          quality_score: result.qualityScore || 100,
          created_via: 'unified-handoff-system',
          sub_agent_count: subAgentResults?.length || 0
        },
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
