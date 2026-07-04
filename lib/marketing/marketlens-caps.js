/**
 * Standing-caps enforcement for MarketLens's owned-audience content loop.
 * SD-LEO-FEAT-MARKETLENS-OWNED-AUDIENCE-001
 *
 * Mirrors lib/eva/utils/token-tracker.js's recordTokenUsage/checkBudget shape for the
 * write-cap ledger (a mechanism that did not exist before this SD), and adds an
 * instance-concurrency guard on factory_guardrail_state's active_content_loop_instances
 * column. All cap checks fail CLOSED: an RPC/lookup error blocks the write rather than
 * allowing it through.
 */

import { randomUUID } from 'crypto';

const MAX_CONCURRENT_INSTANCES = 2;

/**
 * Record a write-eligible operation (queue-insert/publish/measurement-write) into
 * venture_write_ledger. Fire-and-forget, mirrors recordTokenUsage.
 *
 * @param {Object} params
 * @param {string} params.ventureId
 * @param {string} params.operationType - e.g. 'queue_insert', 'publish', 'measurement_write'
 * @param {Object} [params.metadata]
 * @param {Object} deps
 * @param {Object} deps.supabase
 * @param {Object} [deps.logger]
 */
export function recordWrite({ ventureId, operationType, metadata = {} }, deps = {}) {
  const { supabase, logger = console } = deps;

  if (!supabase) {
    logger.warn('[MarketLensCaps] No supabase client — skipping write recording');
    return;
  }

  const row = {
    id: randomUUID(),
    venture_id: ventureId,
    operation_type: operationType,
    write_count: 1,
    metadata,
    created_at: new Date().toISOString(),
    created_by: 'eva-write-tracker',
  };

  supabase
    .from('venture_write_ledger')
    .insert(row)
    .then(({ error }) => {
      if (error) logger.warn(`[MarketLensCaps] Write-ledger insert failed (non-fatal): ${error.message}`);
    })
    .catch((err) => {
      logger.warn(`[MarketLensCaps] Write-ledger insert error (non-fatal): ${err.message}`);
    });
}

/**
 * Check the write-cap budget for a venture via get_venture_write_budget_status.
 * FAILS CLOSED: on any RPC error or timeout, returns { isOverBudget: true, error }
 * so callers block the write by default rather than allowing it through.
 *
 * @param {string} ventureId
 * @param {Object} deps
 * @param {Object} deps.supabase
 * @param {Object} [deps.logger]
 * @returns {Promise<{isOverBudget: boolean, writesUsed: number|null, writesRemaining: number|null, error?: string}>}
 */
export async function checkWriteBudget(ventureId, deps = {}) {
  const { supabase, logger = console } = deps;

  if (!supabase) {
    logger.warn('[MarketLensCaps] No supabase client — failing closed on write-budget check');
    return { isOverBudget: true, writesUsed: null, writesRemaining: null, error: 'no_supabase_client' };
  }

  try {
    const { data, error } = await supabase.rpc('get_venture_write_budget_status', { p_venture_id: ventureId });
    if (error) {
      logger.warn(`[MarketLensCaps] Write-budget RPC error, failing closed: ${error.message}`);
      return { isOverBudget: true, writesUsed: null, writesRemaining: null, error: error.message };
    }
    const status = Array.isArray(data) ? data[0] : data;
    if (!status) {
      return { isOverBudget: true, writesUsed: null, writesRemaining: null, error: 'no_status_returned' };
    }
    return {
      isOverBudget: status.is_over_budget === true,
      writesUsed: status.writes_used,
      writesRemaining: status.writes_remaining,
    };
  } catch (err) {
    logger.warn(`[MarketLensCaps] Write-budget check threw, failing closed: ${err.message}`);
    return { isOverBudget: true, writesUsed: null, writesRemaining: null, error: err.message };
  }
}

/**
 * Attempt to acquire a content-loop instance slot for a venture (max 2 concurrent).
 * Uses a single atomic UPDATE...WHERE guard so two concurrent callers cannot both
 * succeed past the cap (no read-then-write race).
 *
 * @param {string} ventureId
 * @param {Object} deps
 * @param {Object} deps.supabase
 * @param {Object} [deps.logger]
 * @returns {Promise<{acquired: boolean, reason?: string, currentCount?: number}>}
 */
export async function acquireInstanceSlot(ventureId, deps = {}) {
  const { supabase, logger = console } = deps;

  if (!supabase) {
    logger.warn('[MarketLensCaps] No supabase client — refusing to acquire instance slot');
    return { acquired: false, reason: 'no_supabase_client' };
  }

  try {
    const { data, error } = await supabase.rpc('acquire_content_loop_instance_slot', {
      p_venture_id: ventureId,
      p_max_instances: MAX_CONCURRENT_INSTANCES,
    });
    if (error) {
      logger.warn(`[MarketLensCaps] acquire_content_loop_instance_slot RPC error, refusing: ${error.message}`);
      return { acquired: false, reason: error.message };
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result || result.acquired !== true) {
      return { acquired: false, reason: 'instance_cap_reached', currentCount: result?.current_count ?? MAX_CONCURRENT_INSTANCES };
    }
    return { acquired: true, currentCount: result.current_count };
  } catch (err) {
    logger.warn(`[MarketLensCaps] Instance-slot acquire threw, refusing: ${err.message}`);
    return { acquired: false, reason: err.message };
  }
}

/**
 * Release a previously-acquired content-loop instance slot.
 *
 * @param {string} ventureId
 * @param {Object} deps
 * @param {Object} deps.supabase
 * @param {Object} [deps.logger]
 */
export async function releaseInstanceSlot(ventureId, deps = {}) {
  const { supabase, logger = console } = deps;
  if (!supabase) return;
  try {
    const { error } = await supabase.rpc('release_content_loop_instance_slot', { p_venture_id: ventureId });
    if (error) logger.warn(`[MarketLensCaps] release_content_loop_instance_slot RPC error (non-fatal): ${error.message}`);
  } catch (err) {
    logger.warn(`[MarketLensCaps] release_content_loop_instance_slot threw (non-fatal): ${err.message}`);
  }
}

export const _internal = { MAX_CONCURRENT_INSTANCES };
