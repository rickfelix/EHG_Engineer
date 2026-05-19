/**
 * Stage Governance — single DB-backed source of truth for venture stage gating.
 *
 * SD-LEO-REFAC-CANONICALIZE-STAGE-CONFIG-001 FR-2: canonical sets are now
 * derived from `lifecycle_stage_config.work_type` (4-way enum), not from
 * `stage_config.gate_type` (lossy 3-value mirror). This closes the 28th
 * witness of PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.
 *
 * Canonical rule:
 *   - killStages       = stages where work_type='decision_gate' AND gate_type='kill'
 *   - promotionStages  = stages where work_type='decision_gate' AND gate_type='promotion'
 *   - reviewStages     = stages where review_mode='review'
 *   - sd_required stages (work_type='sd_required') are EXCLUDED from all decision sets
 *   - automated_check stages (work_type='automated_check') are EXCLUDED from all decision sets
 *   - artifact_only stages (work_type='artifact_only') are EXCLUDED from all decision sets
 *
 * Cache strategy:
 *   - In-process module-level cache, 60s TTL.
 *   - Supabase realtime UPDATE/INSERT/DELETE on either stage_config or
 *     lifecycle_stage_config invalidates immediately.
 *   - If realtime subscription fails, falls back to TTL-only refresh.
 */

const CACHE_TTL_MS = 60_000;

let _cache = null;
let _subscription = null;
let _subscriptionSupabase = null;

async function _readFresh(supabase) {
  // Read both canonical sources and JOIN in-memory on stage_number.
  // lifecycle_stage_config.work_type is canonical; stage_config supplies
  // gate_type/review_mode/stage_name/stage_key/chunk/description.
  const [stageRes, lifecycleRes] = await Promise.all([
    supabase.from('stage_config').select('stage_number, stage_name, stage_key, gate_type, review_mode, chunk, description').order('stage_number'),
    supabase.from('lifecycle_stage_config').select('stage_number, work_type').order('stage_number'),
  ]);
  if (stageRes.error) throw stageRes.error;
  if (lifecycleRes.error) throw lifecycleRes.error;

  // Build work_type lookup
  const workTypeByStage = new Map();
  for (const row of lifecycleRes.data || []) {
    workTypeByStage.set(row.stage_number, row.work_type);
  }

  const killStages = new Set();
  const promotionStages = new Set();
  const reviewStages = new Set();
  const stages = new Map();

  // Defensive: null/undefined data (empty table or minimal test mocks) yields empty sets.
  for (const row of stageRes.data || []) {
    const workType = workTypeByStage.get(row.stage_number);
    const merged = { ...row, work_type: workType };
    stages.set(row.stage_number, merged);

    // Canonical rule: work_type='decision_gate' is required to participate
    // in kill/promotion classification. sd_required + automated_check +
    // artifact_only stages are EXCLUDED.
    if (workType === 'decision_gate') {
      if (row.gate_type === 'kill') killStages.add(row.stage_number);
      if (row.gate_type === 'promotion') promotionStages.add(row.stage_number);
    }
    // review_mode is independent of work_type — applies to any stage
    if (row.review_mode === 'review') reviewStages.add(row.stage_number);
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lifecycle_stage_config' },
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
 * Sets derived from lifecycle_stage_config.work_type (canonical) joined
 * with stage_config (auxiliary).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function getStageGovernance(supabase) {
  _ensureSubscription(supabase);
  if (_cache && (Date.now() - _cache.fetchedAt) < CACHE_TTL_MS) {
    return _publicView(_cache);
  }
  _cache = await _readFresh(supabase);
  return _publicView(_cache);
}

/** Test-only: force fresh DB read on next call and drop realtime subscription. */
export function _resetCacheForTest() {
  _cache = null;
  if (_subscription) {
    try { _subscription.unsubscribe?.(); } catch { /* swallow */ }
  }
  _subscription = null;
  _subscriptionSupabase = null;
}
