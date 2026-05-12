/**
 * Stage Governance — single DB-backed source of truth for venture stage gating.
 *
 * SD-LEO-INFRA-VENTURE-GATE-UNIFICATION-001 FR-2.
 *
 * Replaces the hardcoded Sets in lib/eva/gate-constants.js. All callers (worker,
 * orchestrator, engine) should switch to this module. The DB table public.stage_config
 * is the canonical source; this module provides a cached, realtime-invalidated view.
 *
 * Cache strategy:
 *   - In-process module-level cache, 60s TTL.
 *   - Supabase realtime UPDATE/INSERT/DELETE on stage_config invalidates immediately.
 *   - If realtime subscription fails (CHANNEL_ERROR / CLOSED / TIMED_OUT), falls back
 *     to TTL-only refresh — the 60s ceiling caps staleness.
 *
 * Prerequisite (FR-1): stage_config must be a member of supabase_realtime publication.
 * Migration 20260512_stage_config_v2_parity_and_publication.sql adds it.
 */

const CACHE_TTL_MS = 60_000;

let _cache = null;
let _subscription = null;
let _subscriptionSupabase = null;

async function _readFresh(supabase) {
  const { data, error } = await supabase
    .from('stage_config')
    .select('stage_number, stage_name, stage_key, gate_type, review_mode, chunk, description')
    .order('stage_number');
  if (error) throw error;

  const killStages = new Set();
  const promotionStages = new Set();
  const reviewStages = new Set();
  const stages = new Map();

  // Defensive: null/undefined data (empty table or minimal test mocks) yields empty sets.
  // Worker callers degrade safely — isKill / isPromotion / isReview all return false,
  // which makes _canAutoAdvance fall through to whichever lower layer applies.
  for (const row of data || []) {
    if (row.gate_type === 'kill') killStages.add(row.stage_number);
    if (row.gate_type === 'promotion') promotionStages.add(row.stage_number);
    if (row.review_mode === 'review') reviewStages.add(row.stage_number);
    stages.set(row.stage_number, row);
  }
  const blockingStages = new Set([...killStages, ...promotionStages]);

  return { fetchedAt: Date.now(), killStages, promotionStages, reviewStages, blockingStages, stages };
}

function _ensureSubscription(supabase) {
  if (_subscription && _subscriptionSupabase === supabase) return;
  // Re-subscribe if supabase client changed (e.g. test isolation)
  if (_subscription) {
    try { _subscription.unsubscribe?.(); } catch { /* swallow */ }
    _subscription = null;
  }
  try {
    _subscription = supabase
      .channel('stage-governance-invalidation')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stage_config' },
        () => { _cache = null; }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
          // Subscription failed; rely on TTL-only refresh.
          try { _subscription?.unsubscribe?.(); } catch { /* swallow */ }
          _subscription = null;
          _subscriptionSupabase = null;
        }
      });
    _subscriptionSupabase = supabase;
  } catch {
    // Channel API unavailable (e.g. minimal test stub) — TTL-only.
    _subscription = null;
    _subscriptionSupabase = null;
  }
}

function _publicView(c) {
  return {
    killStages: c.killStages,
    promotionStages: c.promotionStages,
    reviewStages: c.reviewStages,
    blockingStages: c.blockingStages,
    isKill: (n) => c.killStages.has(n),
    isPromotion: (n) => c.promotionStages.has(n),
    isReview: (n) => c.reviewStages.has(n),
    isBlocking: (n) => c.blockingStages.has(n),
    getStage: (n) => c.stages.get(n) || null,
  };
}

/**
 * Returns the canonical stage governance view for the venture pipeline.
 * Reads from cache if fresh (<60s), else refetches from stage_config.
 * Realtime subscription invalidates cache on table change.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{
 *   killStages: Set<number>,
 *   promotionStages: Set<number>,
 *   reviewStages: Set<number>,
 *   blockingStages: Set<number>,
 *   isKill: (n: number) => boolean,
 *   isPromotion: (n: number) => boolean,
 *   isReview: (n: number) => boolean,
 *   isBlocking: (n: number) => boolean,
 *   getStage: (n: number) => object | null
 * }>}
 */
export async function getStageGovernance(supabase) {
  _ensureSubscription(supabase);
  if (_cache && (Date.now() - _cache.fetchedAt) < CACHE_TTL_MS) {
    return _publicView(_cache);
  }
  _cache = await _readFresh(supabase);
  return _publicView(_cache);
}

/**
 * Test-only: force a fresh DB read on next call and drop the realtime subscription.
 * Production callers should not need this — the realtime channel handles invalidation.
 */
export function _resetCacheForTest() {
  _cache = null;
  if (_subscription) {
    try { _subscription.unsubscribe?.(); } catch { /* swallow */ }
  }
  _subscription = null;
  _subscriptionSupabase = null;
}
