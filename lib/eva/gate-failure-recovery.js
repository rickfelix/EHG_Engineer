/**
 * Gate Failure Recovery
 *
 * SD-MAN-ORCH-EVA-LIFECYCLE-COMPLETION-001-C
 *
 * Provides retry logic for Reality Gate failures:
 * - Classifies failure reasons by severity (critical vs non-critical)
 * - Retries failed analysis steps up to 3 times with failure context
 * - Routes exhausted failures by severity (DFE for critical, auto-track for non-critical)
 * - Marks ventures as killed_at_reality_gate after retry exhaustion
 *
 * @module lib/eva/gate-failure-recovery
 */

import { REASON_CODES } from './reality-gates.js';

const MAX_RETRIES = 3;

// US-001: Severity classification mapping
const CRITICAL_REASON_CODES = new Set([
  REASON_CODES.ARTIFACT_MISSING,
  REASON_CODES.DB_ERROR,
  REASON_CODES.CONFIG_ERROR,
  REASON_CODES.QUALITY_SCORE_MISSING,
]);

const NON_CRITICAL_REASON_CODES = new Set([
  REASON_CODES.QUALITY_SCORE_BELOW_THRESHOLD,
  REASON_CODES.URL_UNREACHABLE,
]);

/**
 * US-001: Classify gate failure reasons by severity.
 * Unknown reason codes default to critical (fail-safe).
 *
 * @param {Array<{code: string}>} reasons - Array of failure reason objects
 * @returns {'critical'|'non-critical'} Severity classification
 */
export function classifyFailureSeverity(reasons) {
  if (!Array.isArray(reasons) || reasons.length === 0) {
    return 'critical'; // fail-safe
  }

  for (const reason of reasons) {
    const code = reason?.code;
    if (CRITICAL_REASON_CODES.has(code)) {
      return 'critical';
    }
    if (!NON_CRITICAL_REASON_CODES.has(code)) {
      // Unknown code → critical (fail-safe)
      return 'critical';
    }
  }

  return 'non-critical';
}

/**
 * US-002: Retry a gate failure by re-running the analysis step with failure context.
 *
 * @param {Object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {number} params.fromStage - Stage the gate is on
 * @param {number} params.toStage - Target stage
 * @param {Array} params.failureReasons - Reasons from the failed gate
 * @param {Function} params.rerunAnalysisFn - async (ventureId, stageId, retryContext) => gateResult
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @returns {Promise<{status: 'recovered'|'exhausted', attempts: number, lastReasons: Array, gateResult?: Object}>}
 */
export async function retryGateFailure(params, deps) {
  const { ventureId, fromStage, toStage, failureReasons, rerunAnalysisFn } = params;
  const { supabase, logger = console } = deps;

  let lastReasons = failureReasons;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const retryContext = {
      attempt,
      maxRetries: MAX_RETRIES,
      previousReasons: lastReasons,
      fromStage,
      toStage,
    };

    logger.info(`[GateRecovery] Retry ${attempt}/${MAX_RETRIES} for venture ${ventureId} gate ${fromStage}->${toStage}`);

    // Log the retry attempt
    await logRetryEvent(supabase, ventureId, {
      event: 'gate_retry_attempt',
      attempt,
      fromStage,
      toStage,
      previousReasons: lastReasons,
    }, logger);

    try {
      const gateResult = await rerunAnalysisFn(ventureId, fromStage, retryContext);

      if (gateResult.status === 'PASS') {
        logger.info(`[GateRecovery] Retry ${attempt} succeeded for venture ${ventureId}`);
        await logRetryEvent(supabase, ventureId, {
          event: 'gate_retry_success',
          attempt,
          fromStage,
          toStage,
        }, logger);
        return { status: 'recovered', attempts: attempt, lastReasons: [], gateResult };
      }

      // Failed again - capture new reasons for next attempt
      lastReasons = gateResult.reasons || lastReasons;
    } catch (err) {
      logger.warn(`[GateRecovery] Retry ${attempt} error: ${err.message}`);
      lastReasons = [{ code: 'RETRY_ERROR', message: err.message }];
    }
  }

  // All retries exhausted
  logger.warn(`[GateRecovery] All ${MAX_RETRIES} retries exhausted for venture ${ventureId} gate ${fromStage}->${toStage}`);
  await logRetryEvent(supabase, ventureId, {
    event: 'gate_retries_exhausted',
    attempts: MAX_RETRIES,
    fromStage,
    toStage,
    lastReasons,
  }, logger);

  return { status: 'exhausted', attempts: MAX_RETRIES, lastReasons };
}

/**
 * US-003: Mark a venture as killed_at_reality_gate.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {Object} [opts]
 * @param {Array} [opts.reasons] - Final failure reasons
 * @param {number} [opts.fromStage] - Stage where the gate failed
 * @param {Object} [opts.logger] - Logger
 * @returns {Promise<{killed: boolean, error?: string}>}
 */
export async function markKilledAtGate(supabase, ventureId, opts = {}) {
  const { reasons = [], fromStage, logger = console } = opts;

  if (!supabase || !ventureId) {
    return { killed: false, error: 'Missing supabase client or ventureId' };
  }

  try {
    const { error } = await supabase
      .from('eva_ventures')
      .update({
        orchestrator_state: 'killed_at_reality_gate',
        orchestrator_lock_id: null,
        orchestrator_lock_acquired_at: null,
      })
      .eq('id', ventureId);

    if (error) {
      logger.error(`[GateRecovery] markKilledAtGate DB error: ${error.message}`);
      return { killed: false, error: error.message };
    }

    // Log terminal event
    await logRetryEvent(supabase, ventureId, {
      event: 'killed_at_reality_gate',
      fromStage,
      reasons,
    }, logger);

    logger.info(`[GateRecovery] Venture ${ventureId} marked killed_at_reality_gate`);
    return { killed: true };
  } catch (err) {
    logger.error(`[GateRecovery] markKilledAtGate error: ${err.message}`);
    return { killed: false, error: err.message };
  }
}

/**
 * US-004: Route gate outcome by severity.
 * Critical → DFE escalation record.
 * Non-critical → stored in venture metadata for auto-retry on next cycle.
 *
 * @param {string} ventureId - Venture UUID
 * @param {string} severity - 'critical' or 'non-critical'
 * @param {Object} context - { reasons, fromStage, toStage }
 * @param {Object} deps - { supabase, logger }
 * @returns {Promise<{routed: boolean, path: 'dfe'|'auto_track', error?: string}>}
 */
export async function routeGateOutcome(ventureId, severity, context, deps) {
  const { supabase, logger = console } = deps;
  const { reasons = [], fromStage, toStage } = context;

  if (!supabase || !ventureId) {
    return { routed: false, error: 'Missing supabase client or ventureId' };
  }

  if (severity === 'critical') {
    // Create DFE escalation record
    try {
      const { error } = await supabase.from('chairman_decisions').insert({
        venture_id: ventureId,
        decision_type: 'gate_failure_escalation',
        status: 'pending',
        context: {
          source: 'gate_failure_recovery',
          fromStage,
          toStage,
          reasons,
          severity: 'critical',
        },
      });

      if (error) {
        logger.error(`[GateRecovery] DFE escalation insert failed: ${error.message}`);
        return { routed: false, path: 'dfe', error: error.message };
      }

      logger.info(`[GateRecovery] Critical failure for ${ventureId} routed to DFE`);
      return { routed: true, path: 'dfe' };
    } catch (err) {
      logger.error(`[GateRecovery] DFE routing error: ${err.message}`);
      return { routed: false, path: 'dfe', error: err.message };
    }
  }

  // Non-critical: store in venture metadata for auto-retry
  try {
    const { data: venture } = await supabase
      .from('eva_ventures')
      .select('metadata')
      .eq('id', ventureId)
      .single();

    const updatedMetadata = {
      ...(venture?.metadata || {}),
      gate_retry_context: {
        fromStage,
        toStage,
        reasons,
        severity: 'non-critical',
        stored_at: new Date().toISOString(),
      },
    };

    const { error } = await supabase
      .from('eva_ventures')
      .update({ metadata: updatedMetadata })
      .eq('id', ventureId);

    if (error) {
      logger.error(`[GateRecovery] Metadata update failed: ${error.message}`);
      return { routed: false, path: 'auto_track', error: error.message };
    }

    logger.info(`[GateRecovery] Non-critical failure for ${ventureId} stored for auto-retry`);
    return { routed: true, path: 'auto_track' };
  } catch (err) {
    logger.error(`[GateRecovery] Auto-track routing error: ${err.message}`);
    return { routed: false, path: 'auto_track', error: err.message };
  }
}

/**
 * US-005: Attempt gate recovery in the orchestrator flow.
 * Called when a reality gate fails in processStage.
 *
 * @param {Object} params
 * @param {string} params.ventureId - Venture UUID
 * @param {number} params.fromStage - Current stage
 * @param {number} params.toStage - Target stage
 * @param {Object} params.gateResult - Failed gate result with reasons
 * @param {Function} params.rerunAnalysisFn - Function to re-run analysis
 * @param {Object} deps - { supabase, logger }
 * @returns {Promise<{recovered: boolean, gateResult?: Object, killed?: boolean}>}
 */
export async function attemptGateRecovery(params, deps) {
  const { ventureId, fromStage, toStage, gateResult, rerunAnalysisFn } = params;
  const { supabase, logger = console } = deps;

  const reasons = gateResult?.reasons || [];
  const severity = classifyFailureSeverity(reasons);

  // Only retry non-critical failures
  if (severity === 'critical') {
    logger.info(`[GateRecovery] Critical failure for ${ventureId} — skipping retry, routing to DFE`);
    await routeGateOutcome(ventureId, 'critical', { reasons, fromStage, toStage }, deps);
    await markKilledAtGate(supabase, ventureId, { reasons, fromStage, logger });
    return { recovered: false, killed: true };
  }

  // Non-critical: attempt retries
  const retryResult = await retryGateFailure(
    { ventureId, fromStage, toStage, failureReasons: reasons, rerunAnalysisFn },
    deps
  );

  if (retryResult.status === 'recovered') {
    return { recovered: true, gateResult: retryResult.gateResult };
  }

  // Retries exhausted — route and kill
  await routeGateOutcome(ventureId, severity, { reasons: retryResult.lastReasons, fromStage, toStage }, deps);
  await markKilledAtGate(supabase, ventureId, { reasons: retryResult.lastReasons, fromStage, logger });
  return { recovered: false, killed: true };
}

// ── Internal helpers ────────────────────────────────────────

async function logRetryEvent(supabase, ventureId, eventData, logger) {
  try {
    await supabase.from('eva_event_log').insert({
      venture_id: ventureId,
      event_type: eventData.event,
      event_data: eventData,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn(`[GateRecovery] Event log failed: ${err.message}`);
  }
}

// ── Exports ─────────────────────────────────────────────────

export const _internal = {
  MAX_RETRIES,
  CRITICAL_REASON_CODES,
  NON_CRITICAL_REASON_CODES,
  logRetryEvent,
};
