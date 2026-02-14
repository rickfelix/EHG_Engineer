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
 * @param {Object} options.supabase - Supabase client
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{id: string, isNew: boolean}>}
 */
export async function createOrReusePendingDecision({
  ventureId,
  stageNumber,
  briefData = null,
  summary = null,
  supabase,
  logger = console,
}) {
  if (!ventureId || stageNumber === undefined || !supabase) {
    throw new ServiceError('INVALID_ARGS', 'ventureId, stageNumber, and supabase are required', 'ChairmanDecisionWatcher');
  }

  // Check for existing PENDING decision first
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

  // Create new PENDING decision
  const { data: created, error } = await supabase
    .from('chairman_decisions')
    .insert({
      venture_id: ventureId,
      lifecycle_stage: stageNumber,
      status: 'pending',
      decision: 'pending',
      summary: summary || `Gate decision required for stage ${stageNumber}`,
      brief_data: briefData,
    })
    .select('id')
    .single();

  if (error) {
    // Handle unique constraint violation (race condition)
    if (error.code === '23505') {
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
    }
    throw new ServiceError('DECISION_CREATE_FAILED', `Failed to create decision: ${error.message}`, 'ChairmanDecisionWatcher');
  }

  logger.log(`   New PENDING decision created: ${created.id}`);
  return { id: created.id, isNew: true };
}
