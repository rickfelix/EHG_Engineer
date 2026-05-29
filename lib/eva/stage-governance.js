/**
 * Stage Governance — single DB-backed source of truth for venture stage gating.
 *
 * SD-LEO-REFAC-CANONICALIZE-STAGE-CONFIG-001 FR-2: canonical sets are derived
 * from work_type (4-way enum), not from gate_type alone (lossy 3-value mirror).
 * This closes the 28th witness of PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.
 *
 * SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-B: read the unified `venture_stages`
 * table (a verified superset of the legacy stage_config + lifecycle_stage_config
 * created by Child A). Because each venture_stages row carries BOTH gate_type
 * AND work_type, the prior dual-table read + in-memory join on stage_number is
 * replaced by a SINGLE SELECT, and the two realtime channels collapse to one.
 * Behavior is byte-identical — gate classification is unchanged.
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
 *   - Supabase realtime UPDATE/INSERT/DELETE on venture_stages invalidates immediately.
 *   - If realtime subscription fails, falls back to TTL-only refresh.
 */

const CACHE_TTL_MS = 60_000;

let _cache = null;
let _subscription = null;
let _subscriptionSupabase = null;

async function _readFresh(supabase) {
  // SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-B: single read from the unified
  // `venture_stages` superset. Each row carries gate_type, review_mode AND
  // work_type, so the prior in-memory join of stage_config + lifecycle_stage_config
  // is no longer needed.
  const { data, error } = await supabase
    .from('venture_stages')
    .select('stage_number, stage_name, stage_key, gate_type, review_mode, chunk, description, work_type')
    .order('stage_number');
  if (error) throw error;

  const killStages = new Set();
  const promotionStages = new Set();
  const reviewStages = new Set();
  const stages = new Map();

  // Defensive: null/undefined data (empty table or minimal test mocks) yields empty sets.
  for (const row of data || []) {
    stages.set(row.stage_number, row);

    // Canonical rule: work_type='decision_gate' is required to participate
    // in kill/promotion classification. sd_required + automated_check +
    // artifact_only stages are EXCLUDED.
    if (row.work_type === 'decision_gate') {
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
    // SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-B: single channel on venture_stages
    // (which is in the supabase_realtime publication) replaces the prior two
    // channels on stage_config + lifecycle_stage_config — equivalent coverage.
    _subscription = supabase
      .channel('stage-governance-venture-stages-invalidation')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'venture_stages' },
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
 * Sets derived from the unified `venture_stages` table per the canonical rule
 * (kill/promotion require work_type='decision_gate').
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
