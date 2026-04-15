/**
 * Chairman Decision Watcher
 *
 * Monitors chairman_decisions table for status changes via Supabase Realtime.
 * Falls back to polling when Realtime is unavailable.
 *
 * Part of SD-EVA-FEAT-CHAIRMAN-API-001
 */

import { ServiceError } from './shared-services.js';

const POLLING_INTERVAL_MS = 10_000; // 10 seconds
const REALTIME_CHANNEL = 'chairman-decisions';

// SD-FIX-STAGE-TIMING-ZEROS-ORCH-001-B: Stages allowed to create chairman decisions.
// Gate stages (CHAIRMAN_GATES.BLOCKING): 3, 5, 10, 13, 17, 18, 19, 20, 23, 24, 25
// Review-mode stages: 7, 8, 9, 11
// Any stage not in this set will be silently skipped by createOrReusePendingDecision.
const DECISION_CREATING_STAGES = new Set([
  3, 5, 7, 8, 9, 10, 11, 13, 17, 18, 19, 20, 23, 24, 25,
]);

/**
 * Wait for a specific decision to be resolved (approved or rejected).
 *
 * @param {Object} options
 * @param {string} options.decisionId - UUID of the decision to watch
 * @param {Object} options.supabase - Supabase client
 * @param {Object} [options.logger] - Logger instance
 * @param {number} [options.timeoutMs] - Optional timeout in ms (0 = no timeout)
 * @returns {Promise<{status: string, rationale: string|null, decision: string}>}
 */
export async function waitForDecision({ decisionId, supabase, logger = console, timeoutMs = 0 }) {
  if (!decisionId || !supabase) {
    throw new ServiceError('INVALID_ARGS', 'decisionId and supabase are required', 'ChairmanDecisionWatcher');
  }

  // First check if already resolved
  const { data: current } = await supabase
    .from('chairman_decisions')
    .select('status, rationale, decision')
    .eq('id', decisionId)
    .single();

  if (current && current.status !== 'pending') {
    logger.log(`   Decision ${decisionId} already resolved: ${current.status}`);
    return current;
  }

  return new Promise((resolve, reject) => {
    let subscription = null;
    let pollingTimer = null;
    let timeoutTimer = null;
    let resolved = false;

    function cleanup() {
      if (resolved) return;
      resolved = true;
      if (subscription) {
        supabase.removeChannel(subscription);
        subscription = null;
      }
      if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = null;
      }
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
    }

    function onResolved(data) {
      cleanup();
      resolve({
        status: data.status,
        rationale: data.rationale || null,
        decision: data.decision || null,
      });
    }

    // Try Realtime first
    try {
      subscription = supabase
        .channel(REALTIME_CHANNEL)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'chairman_decisions',
            filter: `id=eq.${decisionId}`,
          },
          (payload) => {
            const newRow = payload.new;
            if (newRow && newRow.status !== 'pending') {
              logger.log(`   Realtime: Decision ${decisionId} → ${newRow.status}`);
              onResolved(newRow);
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            logger.log(`   Realtime subscription active for decision ${decisionId}`);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            logger.warn(`   Realtime unavailable (${status}), using polling fallback`);
            startPolling();
          }
        });
    } catch (err) {
      logger.warn(`   Realtime setup failed: ${err.message}, using polling fallback`);
      startPolling();
    }

    // Polling fallback
    function startPolling() {
      if (pollingTimer || resolved) return;
      logger.log(`   Polling fallback active (every ${POLLING_INTERVAL_MS / 1000}s)`);

      pollingTimer = setInterval(async () => {
        if (resolved) return;
        try {
          const { data } = await supabase
            .from('chairman_decisions')
            .select('status, rationale, decision')
            .eq('id', decisionId)
            .single();

          if (data && data.status !== 'pending') {
            logger.log(`   Poll: Decision ${decisionId} → ${data.status}`);
            onResolved(data);
          }
        } catch (err) {
          logger.warn(`   Poll error: ${err.message}`);
        }
      }, POLLING_INTERVAL_MS);
    }

    // Always start polling as a safety net alongside Realtime
    // This ensures detection even if Realtime misses an event
    setTimeout(() => {
      if (!resolved) startPolling();
    }, 5000); // Give Realtime 5s head start

    // Optional timeout
    if (timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        if (!resolved) {
          cleanup();
          reject(new ServiceError('DECISION_TIMEOUT', `Decision ${decisionId} timed out after ${timeoutMs}ms`, 'ChairmanDecisionWatcher'));
        }
      }, timeoutMs);
    }
  });
}

/**
 * Create a PENDING chairman decision for a gate stage.
 *
 * If a PENDING decision already exists for this venture+stage, returns it.
 * Uses ON CONFLICT to handle race conditions.
 *
 * @param {Object} options
 * @param {string} options.ventureId - UUID of the venture
 * @param {number} options.stageNumber - Lifecycle stage number (0, 10, 22, 25)
 * @param {Object} [options.briefData] - Venture brief context
 * @param {string} [options.summary] - One-line summary
 * @param {string} [options.decisionType='stage_gate'] - Decision type (stage_gate, review, etc.)
 * @param {Object} options.supabase - Supabase client
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{id: string, isNew: boolean}>}
 */
export async function createOrReusePendingDecision({
  ventureId,
  stageNumber,
  briefData = null,
  summary = null,
  decisionType = 'stage_gate',
  supabase,
  logger = console,
}) {
  if (!ventureId || stageNumber === undefined || !supabase) {
    throw new ServiceError('INVALID_ARGS', 'ventureId, stageNumber, and supabase are required', 'ChairmanDecisionWatcher');
  }

  // SD-FIX-STAGE-TIMING-ZEROS-ORCH-001-B: Skip decision creation for non-gate/non-review stages.
  // This prevents spurious chairman decisions from cluttering the dashboard.
  if (!DECISION_CREATING_STAGES.has(stageNumber)) {
    logger.log(`[Decision] Skipping decision creation for non-gate stage ${stageNumber}`);
    return { id: null, isNew: false, skipped: true };
  }

  // Only reuse PENDING decisions — never reuse approved decisions from prior visits.
  // Each stage visit requires a fresh chairman decision to ensure current-state validation.
  const { data: existing } = await supabase
    .from('chairman_decisions')
    .select('id')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', stageNumber)
    .eq('status', 'pending')
    .single();

  if (existing) {
    // Update brief_data if newer data provided
    if (briefData) {
      await supabase
        .from('chairman_decisions')
        .update({ brief_data: briefData, summary })
        .eq('id', existing.id);
    }
    logger.log(`   Reusing existing PENDING decision: ${existing.id}`);
    return { id: existing.id, isNew: false };
  }

  // SD-MAN-FIX-PIPELINE-HEALTH-GAPS-ORCH-001-A: Populate health_score from latest stage
  let healthScore = null;
  try {
    const { data: latestStage } = await supabase
      .from('venture_stage_work')
      .select('health_score')
      .eq('venture_id', ventureId)
      .not('health_score', 'is', null)
      .order('lifecycle_stage', { ascending: false })
      .limit(1)
      .maybeSingle();
    healthScore = latestStage?.health_score || null;
  } catch (_) { /* non-fatal */ }

  // Create new PENDING decision — always set decision_type to avoid NULL
  // (SD-MAN-FIX-FIX-DUPLICATE-ARTIFACTS-001: NULL decision_type breaks .neq filters)
  const { data: created, error } = await supabase
    .from('chairman_decisions')
    .insert({
      venture_id: ventureId,
      lifecycle_stage: stageNumber,
      status: 'pending',
      decision: 'pending',
      decision_type: decisionType,
      summary: summary || `Gate decision required for stage ${stageNumber}`,
      brief_data: briefData,
      health_score: healthScore,
    })
    .select('id')
    .single();

  if (error) {
    // Handle unique constraint violation (race condition or re-entry after approval)
    if (error.code === '23505') {
      // First check for pending decisions (race condition)
      const { data: raced } = await supabase
        .from('chairman_decisions')
        .select('id')
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', stageNumber)
        .eq('status', 'pending')
        .single();

      if (raced) {
        logger.log(`   Race condition handled, reusing: ${raced.id}`);
        return { id: raced.id, isNew: false };
      }

      // SD-VW-FIX-WORKER-GATE-REENTRY-001: Check for already-resolved decisions
      // (re-entry after approval). Return the existing decision so the caller
      // can detect it's already been handled.
      const { data: resolved } = await supabase
        .from('chairman_decisions')
        .select('id')
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', stageNumber)
        .in('status', ['approved', 'rejected'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (resolved) {
        logger.log(`   Re-entry detected: decision ${resolved.id} already resolved`);
        return { id: resolved.id, isNew: false };
      }
    }
    throw new ServiceError('DECISION_CREATE_FAILED', `Failed to create decision: ${error.message}`, 'ChairmanDecisionWatcher');
  }

  logger.log(`   New PENDING decision created: ${created.id}`);
  return { id: created.id, isNew: true };
}

/**
 * Create a non-blocking advisory notification for informational stages.
 *
 * Unlike createOrReusePendingDecision(), advisory notifications are
 * fire-and-forget: they do not block the pipeline and failures are
 * logged but never propagated.
 *
 * @param {Object} options
 * @param {string} options.ventureId - UUID of the venture
 * @param {number} options.stageNumber - Lifecycle stage number (3, 5, 16, 23)
 * @param {Object} [options.briefData] - Stage output data for the brief
 * @param {string} [options.summary] - One-line summary of the advisory
 * @param {Object} options.supabase - Supabase client
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{id: string}|null>} Created record or null on failure
 */
export async function createAdvisoryNotification({
  ventureId,
  stageNumber,
  briefData = null,
  summary = null,
  supabase,
  logger = console,
}) {
  try {
    if (!ventureId || stageNumber === undefined || !supabase) {
      logger.warn('[Advisory] Missing required args (ventureId, stageNumber, supabase)');
      return null;
    }

    const { data, error } = await supabase
      .from('chairman_decisions')
      .insert({
        venture_id: ventureId,
        lifecycle_stage: stageNumber,
        status: 'approved',
        decision: 'advisory',
        decision_type: 'advisory',
        blocking: false,
        summary: summary || `Advisory checkpoint for stage ${stageNumber}`,
        brief_data: briefData,
      })
      .select('id')
      .single();

    if (error) {
      logger.warn(`[Advisory] Insert failed for stage ${stageNumber}: ${error.message}`);
      return null;
    }

    logger.log(`[Advisory] Notification created for stage ${stageNumber}: ${data.id}`);
    return { id: data.id };
  } catch (err) {
    logger.warn(`[Advisory] Unexpected error for stage ${stageNumber}: ${err.message}`);
    return null;
  }
}
