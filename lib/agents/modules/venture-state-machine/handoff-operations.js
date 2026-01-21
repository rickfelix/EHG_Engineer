/**
 * VentureStateMachine - Handoff Operations Module
 *
 * Handles handoff proposal, approval, rejection, and change requests.
 *
 * @module lib/agents/modules/venture-state-machine/handoff-operations
 */

import { v4 as uuidv4 } from 'uuid';
import {
  validateGoldenNuggets,
  getStageRequirements
} from '../../golden-nugget-validator.js';
import {
  GoldenNuggetValidationError,
  StageGateValidationError
} from './errors.js';
import { validateStageGate } from './stage-gates.js';
import { logPrediction, logOutcome } from './truth-layer.js';

/**
 * Required fields for handoff package
 */
export const REQUIRED_HANDOFF_FIELDS = [
  'artifacts',
  'key_decisions',
  'open_questions',
  'risks_identified'
];

/**
 * Validate handoff package structure
 *
 * @param {Object} pkg - Handoff package
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateHandoffPackage(pkg) {
  const errors = [];

  for (const field of REQUIRED_HANDOFF_FIELDS) {
    if (!pkg[field] || (Array.isArray(pkg[field]) && pkg[field].length === 0)) {
      if (field === 'artifacts' || field === 'key_decisions') {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }

  if (pkg.artifacts) {
    for (const artifact of pkg.artifacts) {
      if (!artifact.type || !artifact.content) {
        errors.push('Artifact missing type or content');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Verify CEO authority
 *
 * @param {Object} supabase - Supabase client
 * @param {string} agentId - Agent ID to verify
 * @returns {Promise<boolean>} Whether agent is CEO
 */
export async function verifyCeoAuthority(supabase, agentId) {
  const { data } = await supabase
    .from('agent_registry')
    .select('agent_type')
    .eq('id', agentId)
    .single();

  return data?.agent_type === 'venture_ceo';
}

/**
 * Approve handoff and advance stage
 * SD-HARDENING-V2-002C: Added idempotency support
 * SD-UNIFIED-PATH-1.2.1: JIT Truth Check + Write-Through
 * SD-HARDENING-V2-003: Golden Nugget validation BEFORE transition
 * TRUTH LAYER: Log prediction before, outcome after
 *
 * @param {Object} context - Execution context
 * @param {Object} handoff - Handoff to approve
 * @param {string} ceo_notes - CEO notes
 * @returns {Promise<Object>} Approval result
 */
export async function approveHandoff(context, handoff, ceo_notes) {
  const { supabase, ventureId, ceoAgentId, verifyStateFreshness, updateLocalState } = context;

  // SD-UNIFIED-PATH-1.2.1: JIT Truth Check BEFORE any mutation
  await verifyStateFreshness();

  console.log(`   Approving handoff for stage ${handoff.from_stage}`);

  // SD-INDUSTRIAL-2025-001: VALIDATE STAGE-SPECIFIC GATES FIRST
  const stageGateResult = await validateStageGate(supabase, ventureId, handoff.from_stage, handoff.to_stage);

  if (!stageGateResult.passed) {
    console.error('\nSTAGE GATE VALIDATION FAILED - TRANSITION BLOCKED');
    console.error(`   Gate: ${stageGateResult.gate_name}`);
    console.error(`   Stage ${handoff.from_stage} -> ${handoff.to_stage} REJECTED`);
    console.error(`   Failed checks: ${stageGateResult.checks.filter(c => !c.passed).map(c => c.check).join(', ')}`);

    // Log gate failure to system events
    await supabase.from('system_events').insert({
      event_type: 'STAGE_GATE_VALIDATION_FAILURE',
      correlation_id: handoff.id,
      event_data: {
        venture_id: ventureId,
        from_stage: handoff.from_stage,
        to_stage: handoff.to_stage,
        gate_name: stageGateResult.gate_name,
        gate_results: stageGateResult,
        timestamp: new Date().toISOString()
      },
      metadata: {
        source: 'VentureStateMachine',
        severity: 'high'
      }
    });

    throw new StageGateValidationError(
      `Stage gate validation failed: ${stageGateResult.gate_name}. ` +
      `Failed checks: ${stageGateResult.checks.filter(c => !c.passed).map(c => c.reason).join('; ')}. ` +
      'Transition blocked until gate requirements are met.',
      stageGateResult
    );
  }

  if (stageGateResult.gate_name) {
    console.log(`   Stage Gate ${stageGateResult.gate_name} PASSED - proceeding to artifact validation`);
  }

  // SD-HARDENING-V2-003: VALIDATE GOLDEN NUGGETS BEFORE TRANSITION
  const validationResults = await validateGoldenNuggets(
    handoff.from_stage,
    handoff.package.artifacts || []
  );

  if (!validationResults.passed) {
    console.error('\nGOLDEN NUGGET VALIDATION FAILED - TRANSITION BLOCKED');
    console.error(`   Stage ${handoff.from_stage} -> ${handoff.to_stage} REJECTED`);
    console.error(`   Missing artifacts: ${validationResults.missing_artifacts.length}`);
    console.error(`   Quality failures: ${validationResults.quality_failures.length}`);
    console.error(`   Epistemic gaps: ${validationResults.epistemic_gaps.length}`);

    await supabase.from('system_events').insert({
      event_type: 'GOLDEN_NUGGET_VALIDATION_FAILURE',
      correlation_id: handoff.id,
      event_data: {
        venture_id: ventureId,
        from_stage: handoff.from_stage,
        to_stage: handoff.to_stage,
        validation_results: validationResults,
        timestamp: new Date().toISOString()
      },
      metadata: {
        source: 'VentureStateMachine',
        severity: 'high'
      }
    });

    throw new GoldenNuggetValidationError(
      `Golden Nugget validation failed for stage ${handoff.from_stage}. ` +
      `Missing: ${validationResults.missing_artifacts.join(', ')}. ` +
      `Quality issues: ${validationResults.quality_failures.map(f => f.artifact_type).join(', ')}. ` +
      'Transition blocked until artifacts meet quality standards.',
      validationResults
    );
  }

  console.log('   Golden Nugget validation PASSED - proceeding with transition');

  // TRUTH LAYER: Log prediction before RPC
  const prediction = {
    action: 'stage_transition',
    from_stage: handoff.from_stage,
    to_stage: handoff.to_stage,
    expected_success: true
  };
  const predictionEventId = await logPrediction(supabase, ceoAgentId, ventureId, prediction, handoff.id);

  const idempotencyKey = uuidv4();
  const startTime = Date.now();

  // SD-HARDENING-V2-002B: fn_advance_venture_stage is the ONLY gateway
  const { data: result, error } = await supabase
    .rpc('fn_advance_venture_stage', {
      p_venture_id: ventureId,
      p_from_stage: handoff.from_stage,
      p_to_stage: handoff.to_stage,
      p_handoff_data: {
        ...handoff.package,
        stage_gate_validation: stageGateResult,
        golden_nugget_validation: validationResults,
        ceo_approval: {
          ceo_agent_id: ceoAgentId,
          approved_at: new Date().toISOString(),
          notes: ceo_notes
        }
      },
      p_idempotency_key: idempotencyKey
    });

  const executionTime = Date.now() - startTime;

  if (error) {
    const outcome = {
      action: 'stage_transition',
      success: false,
      error: error.message,
      execution_time_ms: executionTime
    };
    await logOutcome(supabase, ceoAgentId, ventureId, predictionEventId, outcome, prediction);

    console.error('GATEWAY RPC FAILURE:', JSON.stringify({
      venture_id: ventureId,
      from_stage: handoff.from_stage,
      to_stage: handoff.to_stage,
      idempotency_key: idempotencyKey,
      error_message: error.message,
      timestamp: new Date().toISOString()
    }, null, 2));

    throw new Error(`Stage transition failed: ${error.message}. ` +
      `Venture: ${ventureId}, From: ${handoff.from_stage}, To: ${handoff.to_stage}. ` +
      'Gateway fn_advance_venture_stage() is required for audit trail compliance.');
  }

  const wasDuplicate = result?.was_duplicate === true;
  if (wasDuplicate) {
    console.log('   Duplicate transition detected (idempotent) - no action taken');
  }

  // TRUTH LAYER: Log success outcome
  const outcome = {
    action: 'stage_transition',
    success: true,
    new_stage: handoff.to_stage,
    was_duplicate: wasDuplicate,
    execution_time_ms: executionTime,
    golden_nugget_validation_passed: true
  };
  await logOutcome(supabase, ceoAgentId, ventureId, predictionEventId, outcome, prediction);

  // Resolve pending handoff in database
  await supabase.rpc('fn_resolve_pending_handoff', {
    p_handoff_id: handoff.id,
    p_status: 'approved',
    p_reviewed_by: ceoAgentId,
    p_review_notes: ceo_notes
  });

  // Update local state
  updateLocalState(handoff);

  // SD-UNIFIED-PATH-1.2.1: Write-through to venture_stage_work
  const { error: upsertError } = await supabase
    .from('venture_stage_work')
    .upsert({
      venture_id: ventureId,
      lifecycle_stage: handoff.from_stage,
      stage_status: 'completed',
      health_score: 'green',
      updated_at: new Date().toISOString()
    }, { onConflict: 'venture_id,lifecycle_stage' });

  if (upsertError) {
    console.warn(`   Write-through to venture_stage_work failed: ${upsertError.message}`);
  }

  console.log(`   Venture advanced to stage ${handoff.to_stage}`);

  return {
    success: true,
    was_duplicate: wasDuplicate,
    new_stage: handoff.to_stage,
    transition_logged: true,
    stage_gate_validation: stageGateResult,
    golden_nugget_validation: validationResults,
    idempotency_key: result?.idempotency_key || idempotencyKey
  };
}

/**
 * Reject handoff
 * SD-HARDENING-V2-002C: Persist rejection to database
 *
 * @param {Object} context - Execution context
 * @param {Object} handoff - Handoff to reject
 * @param {string} ceo_notes - CEO notes
 * @returns {Promise<Object>} Rejection result
 */
export async function rejectHandoff(context, handoff, ceo_notes) {
  const { supabase, ceoAgentId, currentStage, verifyStateFreshness, removeFromCache } = context;

  await verifyStateFreshness();

  console.log(`   Rejecting handoff for stage ${handoff.from_stage}`);

  const { error } = await supabase.rpc('fn_resolve_pending_handoff', {
    p_handoff_id: handoff.id,
    p_status: 'rejected',
    p_reviewed_by: ceoAgentId,
    p_review_notes: ceo_notes
  });

  if (error) {
    console.warn(`   Failed to persist rejection: ${error.message}`);
  }

  removeFromCache(handoff.id);
  return { success: true, status: 'rejected', stage_unchanged: currentStage };
}

/**
 * Request changes from VP
 * SD-HARDENING-V2-002C: Persist changes_requested to database
 *
 * @param {Object} context - Execution context
 * @param {Object} handoff - Handoff to request changes for
 * @param {string} ceo_notes - CEO notes
 * @returns {Promise<Object>} Request changes result
 */
export async function requestChanges(context, handoff, ceo_notes) {
  const { supabase, ceoAgentId, currentStage, verifyStateFreshness, updateCacheStatus } = context;

  await verifyStateFreshness();

  console.log(`   Requesting changes for stage ${handoff.from_stage}`);

  const { error } = await supabase.rpc('fn_resolve_pending_handoff', {
    p_handoff_id: handoff.id,
    p_status: 'changes_requested',
    p_reviewed_by: ceoAgentId,
    p_review_notes: ceo_notes
  });

  if (error) {
    console.warn(`   Failed to persist changes_requested: ${error.message}`);
  }

  updateCacheStatus(handoff.id, 'changes_requested');

  return {
    success: true,
    status: 'changes_requested',
    required_changes: ceo_notes,
    stage_unchanged: currentStage
  };
}

// Re-export getStageRequirements for use by VentureStateMachine
export { getStageRequirements };
