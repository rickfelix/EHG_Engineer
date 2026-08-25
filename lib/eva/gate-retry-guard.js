/**
 * SD-LEO-INFRA-STAGE-GATE-RETRY-001 (FR-1/FR-2): bounded retry ceiling + backoff for stage-gate
 * re-evaluation, and an explicit terminal MANUAL_REQUIRED state when the ceiling is hit.
 *
 * Single-sourced (TR-1) so eva-orchestrator.js and stage-execution-worker.js never duplicate
 * these constants. The attempt count/timestamp are read fresh from eva_stage_gate_attempts on
 * every call (TR-3) -- never cached in-process.
 *
 * CORRECTED after adversarial TESTING re-review (evidence 11345782-ebd6-4e74-82ff-b0bd0342809c):
 * the first implementation keyed backoff purely on attemptCount, but the worker SKIPS gate
 * evaluation (no new attempt row) while backing off -- so attemptCount never advanced past the
 * point backoff started, freezing the venture forever at a fixed attempt count with zero
 * visibility (invisible to FR-4's census, which only reports ventures AT or past the ceiling).
 * Backoff is now WALL-CLOCK-TIME-based (elapsed since the last recorded attempt), which always
 * advances every tick regardless of whether evaluation runs -- so a stuck venture eventually
 * clears each backoff window and proceeds, incrementing attemptCount and lengthening the next
 * window, until it genuinely reaches GATE_RETRY_CEILING.
 */

/** Hard ceiling: at this many attempts for one venture/stage, stop evaluating entirely. */
export const GATE_RETRY_CEILING = 20;

/** Below this many attempts, evaluate on every poll (no backoff). */
export const GATE_RETRY_BACKOFF_START = 5;

/** Base backoff delay once GATE_RETRY_BACKOFF_START is reached; doubles per attempt past it. */
export const GATE_RETRY_BACKOFF_BASE_MS = 60_000; // 1 minute

/** Backoff delay never exceeds this, so a stuck venture is always re-checked within a day. */
export const GATE_RETRY_BACKOFF_MAX_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Required wait since the last attempt before the next evaluation is allowed, given the current
 * attempt count. 0 below GATE_RETRY_BACKOFF_START (no backoff yet).
 */
export function computeBackoffDelayMs(attemptCount) {
  if (attemptCount < GATE_RETRY_BACKOFF_START) return 0;
  const over = attemptCount - GATE_RETRY_BACKOFF_START;
  return Math.min(GATE_RETRY_BACKOFF_BASE_MS * 2 ** over, GATE_RETRY_BACKOFF_MAX_MS);
}

/**
 * @param {number} attemptCount
 * @param {string|null} lastAttemptAt - ISO timestamp of the most recent recorded attempt
 * @param {number} [now] - epoch ms, injectable for tests
 * @returns {boolean} true if this poll cycle should be skipped (no evaluation this tick)
 */
export function shouldSkipForBackoff(attemptCount, lastAttemptAt, now = Date.now()) {
  const delayMs = computeBackoffDelayMs(attemptCount);
  if (delayMs === 0 || !lastAttemptAt) return false;
  const lastMs = new Date(lastAttemptAt).getTime();
  return now - lastMs < delayMs;
}

/**
 * Fresh, DB-sourced attempt count + most recent attempt timestamp for a venture/stage (all gate
 * types combined -- the P0 override guard and processStage() both write into the same per-stage
 * attempt history). Two lightweight queries (a head:true count, and a 1-row order-by) rather than
 * fetching every attempt row, so this stays cheap even for a venture/stage with thousands of
 * attempts.
 */
export async function getGateAttemptState(supabase, { ventureId, stageNumber }) {
  const { count, error: countErr } = await supabase
    .from('eva_stage_gate_attempts')
    .select('attempt_id', { count: 'exact', head: true })
    .eq('venture_id', ventureId)
    .eq('stage_number', stageNumber);
  if (countErr) {
    throw new Error(`[gate-retry-guard] attempt count query failed: ${countErr.message}`);
  }

  const { data: latest, error: latestErr } = await supabase
    .from('eva_stage_gate_attempts')
    .select('created_at')
    .eq('venture_id', ventureId)
    .eq('stage_number', stageNumber)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr) {
    throw new Error(`[gate-retry-guard] latest attempt query failed: ${latestErr.message}`);
  }

  return { attemptCount: count ?? 0, lastAttemptAt: latest?.created_at ?? null };
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
  const { attemptCount, lastAttemptAt } = await getGateAttemptState(supabase, { ventureId, stageNumber });

  if (attemptCount >= GATE_RETRY_CEILING) {
    await terminalizeVentureForRetryExhaustion(supabase, { ventureId, stageNumber, attemptCount, logger });
    return { action: 'terminalize', attemptCount };
  }

  if (shouldSkipForBackoff(attemptCount, lastAttemptAt)) {
    return { action: 'skip', attemptCount };
  }

  return { action: 'proceed', attemptCount };
}
