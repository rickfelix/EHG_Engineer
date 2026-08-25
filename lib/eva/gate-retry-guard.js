/**
 * SD-LEO-INFRA-STAGE-GATE-RETRY-001 (FR-1/FR-2): bounded retry ceiling + backoff for stage-gate
 * re-evaluation, and an explicit terminal MANUAL_REQUIRED state when the ceiling is hit.
 *
 * Single-sourced (TR-1) so eva-orchestrator.js and stage-execution-worker.js never duplicate
 * these constants. The attempt count is read fresh from eva_stage_gate_attempts on every call
 * (TR-3) -- never cached in-process -- so a terminalization decision is never made against a
 * stale count.
 */

/** Hard ceiling: at this many attempts for one venture/stage, stop evaluating entirely. */
export const GATE_RETRY_CEILING = 20;

/** Below this many attempts, evaluate on every poll (no backoff). */
export const GATE_RETRY_BACKOFF_START = 5;

/**
 * Exponential backoff schedule between GATE_RETRY_BACKOFF_START and GATE_RETRY_CEILING: as the
 * attempt count grows, an increasing fraction of poll cycles are skipped (no evaluation, no new
 * attempt row) before the venture is fully terminalized at the ceiling.
 *
 * @param {number} attemptCount
 * @returns {boolean} true if this poll cycle should be skipped (no evaluation this tick)
 */
export function shouldSkipForBackoff(attemptCount) {
  if (attemptCount < GATE_RETRY_BACKOFF_START) return false;
  const over = attemptCount - GATE_RETRY_BACKOFF_START;
  // Interval doubles every 3 attempts past the backoff start, capped at 16: 1,1,1,2,2,2,4,4,4,...
  const interval = Math.min(2 ** Math.floor(over / 3), 16);
  return over % interval !== 0;
}

/**
 * Fresh, DB-sourced attempt count for a venture/stage (all gate types combined -- the P0
 * override guard and processStage() both write into the same per-stage attempt history).
 */
export async function getGateAttemptCount(supabase, { ventureId, stageNumber }) {
  const { count, error } = await supabase
    .from('eva_stage_gate_attempts')
    .select('attempt_id', { count: 'exact', head: true })
    .eq('venture_id', ventureId)
    .eq('stage_number', stageNumber);
  if (error) {
    throw new Error(`[gate-retry-guard] attempt count query failed: ${error.message}`);
  }
  return count ?? 0;
}

/**
 * Mark a venture terminal (MANUAL_REQUIRED) via the existing gating_decision metadata pattern
 * (the same shape already used for manual chairman-initiated parks -- see
 * SD-LEO-INFRA-APEXNICHE-STAGE-RUNAWAY-001), so it is queryable by the same tooling and does not
 * introduce a second storage location for "this venture is not moving."
 */
export async function terminalizeVentureForRetryExhaustion(supabase, { ventureId, stageNumber, attemptCount, logger }) {
  const { data: venture, error: fetchErr } = await supabase
    .from('ventures')
    .select('metadata')
    .eq('id', ventureId)
    .single();
  if (fetchErr || !venture) {
    logger?.error?.(`[gate-retry-guard] terminalize: failed to fetch venture ${ventureId}: ${fetchErr?.message}`);
    return false;
  }

  const decision = {
    at: new Date().toISOString(),
    by: 'SD-LEO-INFRA-STAGE-GATE-RETRY-001',
    parked: true,
    decision: `Stage ${stageNumber} gate retry ceiling (${GATE_RETRY_CEILING}) exceeded (${attemptCount} attempts) -- MANUAL_REQUIRED`,
    reason: 'gate_retry_ceiling_exceeded',
    context: `Auto-terminalized by the bounded-retry guard: ${attemptCount} attempts recorded for stage ${stageNumber} with no advance, which exceeds GATE_RETRY_CEILING=${GATE_RETRY_CEILING}. This is a fail-safe, not a diagnosis -- a human must review why the gate keeps failing/re-evaluating and either fix the underlying cause or issue a chairman override.`,
    unpark_trigger: 'Human review of the stuck gate, followed by a corrective fix or an explicit chairman override.',
  };

  const existingMeta = venture.metadata || {};
  const history = Array.isArray(existingMeta.gating_decision_history) ? existingMeta.gating_decision_history : [];
  const alreadyTerminalForThisReason = existingMeta.gating_decision?.parked === true
    && existingMeta.gating_decision?.reason === 'gate_retry_ceiling_exceeded';
  if (alreadyTerminalForThisReason) {
    // Already terminalized (a prior poll cycle set it) -- do not append a duplicate history entry.
    return true;
  }

  if (existingMeta.gating_decision) {
    history.push(existingMeta.gating_decision);
  }

  const { error: updateErr } = await supabase
    .from('ventures')
    .update({
      metadata: {
        ...existingMeta,
        gating_decision: decision,
        gating_decision_history: history,
      },
    })
    .eq('id', ventureId);

  if (updateErr) {
    logger?.error?.(`[gate-retry-guard] terminalize: failed to write gating_decision for ${ventureId}: ${updateErr.message}`);
    return false;
  }

  logger?.log?.(`[gate-retry-guard] VENTURE_TERMINALIZED venture=${ventureId} stage=${stageNumber} attempts=${attemptCount} -- MANUAL_REQUIRED`);
  return true;
}

/**
 * Check the retry ceiling/backoff for a venture/stage before allowing gate evaluation to
 * proceed. Call this fresh on every poll tick -- never cache the result.
 *
 * @returns {Promise<{ action: 'proceed'|'skip'|'terminalize', attemptCount: number }>}
 */
export async function checkGateRetryCeiling(supabase, { ventureId, stageNumber, logger }) {
  const attemptCount = await getGateAttemptCount(supabase, { ventureId, stageNumber });

  if (attemptCount >= GATE_RETRY_CEILING) {
    await terminalizeVentureForRetryExhaustion(supabase, { ventureId, stageNumber, attemptCount, logger });
    return { action: 'terminalize', attemptCount };
  }

  if (shouldSkipForBackoff(attemptCount)) {
    return { action: 'skip', attemptCount };
  }

  return { action: 'proceed', attemptCount };
}
