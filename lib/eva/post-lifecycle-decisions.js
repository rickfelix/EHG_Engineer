/**
 * Post-Lifecycle Decision Handlers
 *
 * SD-MAN-ORCH-EVA-LIFECYCLE-COMPLETION-001-A
 *
 * When a venture completes Stage 25 (final lifecycle stage), the orchestrator
 * must decide what happens next. This module provides the decision framework
 * with 5 decision types: CONTINUE, PIVOT, EXPAND, SUNSET, EXIT.
 *
 * @module lib/eva/post-lifecycle-decisions
 */

import { markCompleted, ORCHESTRATOR_STATES } from './orchestrator-state-machine.js';
import { convertExpansionToSD } from './lifecycle-sd-bridge.js';

// ── Constants ───────────────────────────────────────────────

export const MODULE_VERSION = '1.0.0';

export const MAX_LIFECYCLE_STAGE = 25;

export const DECISION_TYPES = Object.freeze({
  CONTINUE: 'continue',
  PIVOT: 'pivot',
  EXPAND: 'expand',
  SUNSET: 'sunset',
  EXIT: 'exit',
});

export const DECISION_LABELS = Object.freeze({
  [DECISION_TYPES.CONTINUE]: 'Continue to Ops Monitoring',
  [DECISION_TYPES.PIVOT]: 'Pivot (Re-enter at Earlier Stage)',
  [DECISION_TYPES.EXPAND]: 'Expand (New Venture via SD Bridge)',
  [DECISION_TYPES.SUNSET]: 'Sunset (30-Day Wind-Down)',
  [DECISION_TYPES.EXIT]: 'Exit (Immediate Archive)',
});

// Default pivot re-entry stage
const DEFAULT_PIVOT_STAGE = 15;

// Sunset notice period in days
const SUNSET_NOTICE_DAYS = 30;

// ── Main Handler ────────────────────────────────────────────

/**
 * Handle post-lifecycle decision for a venture that has completed Stage 25.
 *
 * @param {Object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {Object} params.ventureContext - Venture data (id, name, status, etc.)
 * @param {Object} params.stageOutput - Output from Stage 25 execution
 * @param {Object} params.artifacts - Artifacts from Stage 25
 * @param {Object} [params.decision] - Pre-made decision { type, rationale, pivotStage }
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @returns {Promise<Object>} { handled: boolean, decision, result, error? }
 */
export async function handlePostLifecycleDecision(params, deps = {}) {
  const { ventureId, ventureContext, stageOutput, artifacts, decision } = params;
  const { supabase, logger = console } = deps;

  if (!supabase || !ventureId) {
    return { handled: false, error: 'Missing supabase client or ventureId' };
  }

  logger.log(`[PostLifecycle] Stage 25 completed for venture ${ventureId} (${ventureContext?.name || 'unknown'})`);

  // If no decision provided, return a REQUIRE_REVIEW signal
  if (!decision) {
    const decisionOptions = buildDecisionOptions(ventureContext, stageOutput);
    return {
      handled: false,
      requiresReview: true,
      decisionOptions,
      summary: `Venture "${ventureContext?.name || ventureId}" has completed all 25 lifecycle stages. Chairman decision required.`,
    };
  }

  // Validate decision type
  const validTypes = Object.values(DECISION_TYPES);
  if (!validTypes.includes(decision.type)) {
    return { handled: false, error: `Invalid decision type: ${decision.type}. Valid: ${validTypes.join(', ')}` };
  }

  // Execute the decision
  const handler = DECISION_HANDLERS[decision.type];
  const result = await handler({ ventureId, ventureContext, stageOutput, artifacts, decision }, deps);

  // Record the decision
  await recordDecision(supabase, ventureId, decision, result, logger);

  return { handled: true, decision, result };
}

// ── Decision Handlers ───────────────────────────────────────

const DECISION_HANDLERS = {
  [DECISION_TYPES.CONTINUE]: handleContinue,
  [DECISION_TYPES.PIVOT]: handlePivot,
  [DECISION_TYPES.EXPAND]: handleExpand,
  [DECISION_TYPES.SUNSET]: handleSunset,
  [DECISION_TYPES.EXIT]: handleExit,
};

/**
 * CONTINUE: Mark lifecycle complete, transition to ops monitoring.
 * The venture stays active with orchestrator_state = 'completed'.
 */
async function handleContinue({ ventureId, ventureContext }, { supabase, logger = console }) {
  logger.log(`[PostLifecycle] CONTINUE: ${ventureId} → ops monitoring`);

  const { completed, error: compError } = await markCompleted(supabase, ventureId, { logger });
  if (!compError) {
    // Set status to 'monitoring' for ops phase
    await supabase
      .from('eva_ventures')
      .update({ status: 'monitoring' })
      .eq('id', ventureId);
  }

  return {
    action: DECISION_TYPES.CONTINUE,
    success: completed,
    newStatus: 'monitoring',
    error: compError,
    message: completed
      ? `Venture "${ventureContext?.name}" transitioned to ops monitoring.`
      : `Failed to complete venture: ${compError}`,
  };
}

/**
 * PIVOT: Reset current_lifecycle_stage to an earlier stage for re-entry.
 * Resets orchestrator state to idle so it can be re-processed.
 */
async function handlePivot({ ventureId, ventureContext, decision }, { supabase, logger = console }) {
  const pivotStage = decision.pivotStage ?? DEFAULT_PIVOT_STAGE;
  logger.log(`[PostLifecycle] PIVOT: ${ventureId} → stage ${pivotStage}`);

  if (pivotStage < 1 || pivotStage > MAX_LIFECYCLE_STAGE) {
    return { action: DECISION_TYPES.PIVOT, success: false, error: `Invalid pivot stage: ${pivotStage} (must be 1-${MAX_LIFECYCLE_STAGE})` };
  }

  const { error } = await supabase
    .from('eva_ventures')
    .update({
      current_lifecycle_stage: pivotStage,
      orchestrator_state: ORCHESTRATOR_STATES.IDLE,
      orchestrator_lock_id: null,
      orchestrator_lock_acquired_at: null,
    })
    .eq('id', ventureId);

  return {
    action: DECISION_TYPES.PIVOT,
    success: !error,
    pivotStage,
    error: error?.message,
    message: error
      ? `Pivot failed: ${error.message}`
      : `Venture "${ventureContext?.name}" pivoted to stage ${pivotStage}.`,
  };
}

/**
 * EXPAND: Create a new venture SD via the lifecycle-sd-bridge.
 * Uses convertExpansionToSD to create a new strategic directive.
 */
async function handleExpand({ ventureId, ventureContext, stageOutput, decision }, { supabase, logger = console }) {
  logger.log(`[PostLifecycle] EXPAND: ${ventureId} → new venture SD`);

  const expansionParams = {
    parentVentureId: ventureId,
    parentVentureName: ventureContext?.name,
    expansionTitle: decision.expansionTitle || `${ventureContext?.name} - Expansion`,
    expansionDescription: decision.expansionDescription || `New venture expansion from completed lifecycle of ${ventureContext?.name}.`,
    expansionType: decision.expansionType || 'feature',
  };

  const bridgeResult = await convertExpansionToSD(
    { expansionParams, stageOutput, ventureContext },
    { supabase, logger },
  );

  // Mark parent as completed
  if (bridgeResult.created) {
    await markCompleted(supabase, ventureId, { logger });
  }

  return {
    action: DECISION_TYPES.EXPAND,
    success: bridgeResult.created,
    sdKey: bridgeResult.sdKey,
    errors: bridgeResult.errors,
    message: bridgeResult.created
      ? `Expansion SD created: ${bridgeResult.sdKey}. Parent venture completed.`
      : `Expansion failed: ${bridgeResult.errors.join(', ')}`,
  };
}

/**
 * SUNSET: Begin 30-day wind-down. Sets sunset_at timestamp,
 * marks orchestrator completed, status → 'sunsetting'.
 */
async function handleSunset({ ventureId, ventureContext }, { supabase, logger = console }) {
  logger.log(`[PostLifecycle] SUNSET: ${ventureId} → ${SUNSET_NOTICE_DAYS}-day wind-down`);

  const sunsetAt = new Date();
  sunsetAt.setDate(sunsetAt.getDate() + SUNSET_NOTICE_DAYS);

  await markCompleted(supabase, ventureId, { logger });

  const { error } = await supabase
    .from('eva_ventures')
    .update({
      status: 'sunsetting',
      metadata: supabase.rpc ? undefined : undefined, // metadata handled below
    })
    .eq('id', ventureId);

  // Update metadata with sunset date (merge with existing)
  await supabase.rpc('jsonb_merge_metadata', {
    p_table: 'eva_ventures',
    p_id: ventureId,
    p_metadata: { sunset_at: sunsetAt.toISOString(), sunset_notice_days: SUNSET_NOTICE_DAYS },
  }).catch(() => {
    // Fallback: direct update if RPC doesn't exist
    supabase
      .from('eva_ventures')
      .update({ status: 'sunsetting' })
      .eq('id', ventureId);
  });

  return {
    action: DECISION_TYPES.SUNSET,
    success: !error,
    sunsetAt: sunsetAt.toISOString(),
    noticeDays: SUNSET_NOTICE_DAYS,
    error: error?.message,
    message: `Venture "${ventureContext?.name}" entering ${SUNSET_NOTICE_DAYS}-day sunset period (until ${sunsetAt.toISOString().split('T')[0]}).`,
  };
}

/**
 * EXIT: Immediate archive. Marks orchestrator completed, status → 'archived'.
 */
async function handleExit({ ventureId, ventureContext }, { supabase, logger = console }) {
  logger.log(`[PostLifecycle] EXIT: ${ventureId} → immediate archive`);

  await markCompleted(supabase, ventureId, { logger });

  const { error } = await supabase
    .from('eva_ventures')
    .update({
      status: 'archived',
      completed_at: new Date().toISOString(),
    })
    .eq('id', ventureId);

  return {
    action: DECISION_TYPES.EXIT,
    success: !error,
    error: error?.message,
    message: error
      ? `Archive failed: ${error.message}`
      : `Venture "${ventureContext?.name}" archived immediately.`,
  };
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Build the decision options to present to the chairman for review.
 */
function buildDecisionOptions(ventureContext, stageOutput) {
  return Object.entries(DECISION_LABELS).map(([type, label]) => ({
    type,
    label,
    description: getDecisionDescription(type, ventureContext),
  }));
}

function getDecisionDescription(type, ventureContext) {
  const name = ventureContext?.name || 'this venture';
  switch (type) {
    case DECISION_TYPES.CONTINUE:
      return `${name} transitions to operational monitoring. No new stages are executed.`;
    case DECISION_TYPES.PIVOT:
      return `Re-enter the lifecycle at an earlier stage (default: stage ${DEFAULT_PIVOT_STAGE}).`;
    case DECISION_TYPES.EXPAND:
      return `Create a new venture SD from ${name}'s outputs via the lifecycle-SD bridge.`;
    case DECISION_TYPES.SUNSET:
      return `Begin a ${SUNSET_NOTICE_DAYS}-day wind-down period before archiving ${name}.`;
    case DECISION_TYPES.EXIT:
      return `Immediately archive ${name}. No wind-down period.`;
    default:
      return '';
  }
}

/**
 * Record the post-lifecycle decision as a venture artifact.
 */
async function recordDecision(supabase, ventureId, decision, result, logger) {
  try {
    await supabase.from('venture_artifacts').insert({
      venture_id: ventureId,
      lifecycle_stage: MAX_LIFECYCLE_STAGE,
      artifact_type: 'post_lifecycle_decision',
      title: `Post-Lifecycle Decision: ${decision.type.toUpperCase()}`,
      content: JSON.stringify({
        decision,
        result,
        decidedAt: new Date().toISOString(),
      }),
      metadata: {
        decision_type: decision.type,
        success: result.success,
      },
      quality_score: result.success ? 100 : 0,
      validation_status: result.success ? 'validated' : 'failed',
      validated_by: 'post-lifecycle-decisions',
      is_current: true,
      source: 'post-lifecycle-decisions',
    });
  } catch (err) {
    logger.warn(`[PostLifecycle] Failed to record decision artifact: ${err.message}`);
  }
}

/**
 * Check if a stage is the final lifecycle stage.
 *
 * @param {number} stageId - Current stage number
 * @returns {boolean} True if this is Stage 25 (final)
 */
export function isFinalStage(stageId) {
  return stageId >= MAX_LIFECYCLE_STAGE;
}

// ── Exports for testing ─────────────────────────────────────

export const _internal = {
  DECISION_HANDLERS,
  DECISION_TYPES,
  MAX_LIFECYCLE_STAGE,
  DEFAULT_PIVOT_STAGE,
  SUNSET_NOTICE_DAYS,
  buildDecisionOptions,
  recordDecision,
};
