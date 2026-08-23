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
 *   - sd_required stages (work_type='sd_required') are EXCLUDED from the above decision sets
 *   - automated_check stages (work_type='automated_check') are EXCLUDED from the above decision sets
 *   - artifact_only stages (work_type='artifact_only') are EXCLUDED from the above decision sets
 *
 * SD-LEO-INFRA-MINUS-GATE-SSOT-001 (T-minus P2, FR-3/TR-1): the work_type-filtered sets above
 * answer "does this stage carry a discrete DECISION record?" — a narrower question than "does
 * advancing past this stage require an approved decision at all?" For GATE-EVALUATION purposes
 * (stage-gates.js/devils-advocate.js and the SQL RPC advance_venture_stage), the raw gate_type
 * column is the correct SSOT: killStagesRaw/promotionStagesRaw below include EVERY stage with
 * gate_type='kill'/'promotion' regardless of work_type. This distinction is load-bearing: stage 19
 * (work_type='sd_required', is_high_consequence=true) is one of two stages with forensically-proven
 * historical damage (ventures advanced with no approved chairman decision, per
 * docs/architecture/stage-advancement-path-census.md) — the narrower work_type='decision_gate' view
 * excludes it, which would silently reopen the exact bypass this SD exists to close. Kill stages are
 * identical under both views ({3,5,13,23}); only the promotion set differs (raw: 7 stages
 * {10,16,17,18,19,24,25}; decision_gate-filtered: 4 stages {10,16,17,24}).
 *
 * FR-3 AC#3 (published stage/gate map artifact, generated not hand-maintained): satisfied by the
 * PRE-EXISTING scripts/generate-stage-config.cjs, which already emits lib/proving-companion/
 * stage-config.js's gateType field straight from venture_stages.gate_type per row (see its
 * mapGateType()) — no work_type filter, i.e. the SAME raw view this module's *Raw exports use —
 * with a CI drift guard (`--check`, 0-diff enforced). This module does NOT duplicate that
 * generator: two independent generators reading the same raw gate_type column would itself be a
 * second SSOT, the exact defect class this SD exists to close. Verified in sync during this SD's
 * EXEC (`node scripts/generate-stage-config.cjs --check` → CHECK PASSED, 2026-08-23).
 *
 * Cache strategy:
 *   - In-process module-level cache, 60s TTL.
 *   - Supabase realtime UPDATE/INSERT/DELETE on venture_stages invalidates immediately.
 *   - If realtime subscription fails, falls back to TTL-only refresh.
 */

import { RESERVED_CHAIRMAN_STAGES } from './autonomy-model.js';

const CACHE_TTL_MS = 60_000;

// SD-LEO-INFRA-EVA-RESERVED-GATES-ENFORCEMENT-001 FR-3: map a stage's row gate_type to the
// autonomy gate-behavior vocabulary. This is SEPARATE from the canonical work_type-driven
// kill/promotion DECISION sets (deliberately work_type-based, SD-LEO-REFAC-CANONICALIZE-STAGE-
// CONFIG-001) — it answers "how should the autonomy matrix treat this gate?" so S18/S19
// (gate_type='promotion' but artifact_only/sd_required work_type) no longer fall into the
// stage_gate catch-all. Reserved stages are independently forced manual by FR-1.
function _autonomyGateType(row) {
  const gt = row?.gate_type;
  if (gt === 'kill') return 'kill_gate';
  if (gt === 'promotion') return 'promotion_gate';
  return 'stage_gate';
}

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
    .select('stage_number, stage_name, stage_key, gate_type, review_mode, chunk, description, work_type, is_high_consequence')
    .order('stage_number');
  if (error) throw error;

  // SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A (FR-1): venture_stages.is_high_consequence
  // classification, consumed by both JS chokepoints (stage-execution-worker.js's
  // per-tick review-mode block and its _advanceStage 4th backstop) via
  // isHighConsequence/highConsequenceStages.
  //
  // QF-20260712-716 (Adam flag-gov ruling 8118abe7, 2026-08-16): GRADUATED. The
  // leo_feature_flags.HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED cutover read was
  // removed — it was enabled-never-rolled-out (live is_enabled=true throughout,
  // seeded ON at deploy because stage 24 was already live-enforced), so this now
  // permanently classifies is_high_consequence=true rows rather than reading a
  // flag that has never been flipped off. The DB-side fn_advance_venture_stage
  // read of this same flag_key is a SEPARATE, out-of-scope surface (not touched
  // by this QF) and continues reading the flag row unchanged.
  const killStages = new Set();
  const promotionStages = new Set();
  // SD-LEO-INFRA-MINUS-GATE-SSOT-001 (FR-3/TR-1): raw gate_type-derived sets, independent of
  // work_type, for gate-EVALUATION consumers (see canonical-rule comment above).
  const killStagesRaw = new Set();
  const promotionStagesRaw = new Set();
  const reviewStages = new Set();
  // SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001 FR-1: chairman-configurable, DB-backed
  // classification independent of gate_type/review_mode/work_type — deliberately
  // NOT named isBlocking (already taken by kill∪promotion, see _publicView below;
  // per validation-agent finding, avoid the name collision).
  const highConsequenceStages = new Set();
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
    // FR-3/TR-1: raw gate_type, independent of work_type.
    if (row.gate_type === 'kill') killStagesRaw.add(row.stage_number);
    if (row.gate_type === 'promotion') promotionStagesRaw.add(row.stage_number);
    // review_mode is independent of work_type — applies to any stage
    if (row.review_mode === 'review') reviewStages.add(row.stage_number);
    // is_high_consequence is independent of gate_type/review_mode/work_type —
    // a stage with gate_type='none' can still be chairman-designated high-consequence.
    if (row.is_high_consequence === true) highConsequenceStages.add(row.stage_number);
  }
  const blockingStages = new Set([...killStages, ...promotionStages]);
  const blockingStagesRaw = new Set([...killStagesRaw, ...promotionStagesRaw]);

  return {
    fetchedAt: Date.now(),
    killStages, promotionStages, reviewStages, blockingStages, highConsequenceStages, stages,
    killStagesRaw, promotionStagesRaw, blockingStagesRaw,
  };
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
          // QF-20260701-709: drop the reference only -- do NOT call unsubscribe()
          // OR supabase.removeChannel() from inside this callback. Both internally
          // invoke phoenix's Channel.leave(), which under CI's no-reachable-Realtime-
          // server condition synchronously re-fires this same CLOSED callback before
          // settling, causing unbounded recursion (RangeError: Maximum call stack
          // size exceeded) regardless of which teardown method is used.
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
    // SD-LEO-INFRA-MINUS-GATE-SSOT-001 (FR-3/TR-1): raw gate_type-derived view for gate-evaluation
    // consumers (stage-gates.js, devils-advocate.js) — see the canonical-rule comment above.
    killStagesRaw: c.killStagesRaw,
    promotionStagesRaw: c.promotionStagesRaw,
    blockingStagesRaw: c.blockingStagesRaw,
    isKillRaw: (n) => c.killStagesRaw.has(n),
    isPromotionRaw: (n) => c.promotionStagesRaw.has(n),
    isBlockingRaw: (n) => c.blockingStagesRaw.has(n),
    // SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001 FR-1: chairman-configurable classification
    // driving chairman_decisions.blocking=true at creation (FR-2) — see createOrReusePendingDecision.
    highConsequenceStages: c.highConsequenceStages,
    isHighConsequence: (n) => c.highConsequenceStages.has(n),
    getStage: (n) => c.stages.get(n) || null,
    // SD-LEO-INFRA-MINUS-GATE-SSOT-001 (FR-6): total pipeline stage count, derived from the SSOT
    // row count rather than a pinned literal — the class of drift this FR exists to close (a
    // prior pinned "25" literal silently diverged from the live 26-row table).
    totalStages: c.stages.size,
    // FR-3: reserved-chairman-stage awareness + autonomy gate-type resolution (additive; does not
    // alter the canonical work_type-driven kill/promotion decision sets above).
    reservedStages: new Set(RESERVED_CHAIRMAN_STAGES),
    isReserved: (n) => RESERVED_CHAIRMAN_STAGES.has(n),
    gateTypeForAutonomy: (n) => _autonomyGateType(c.stages.get(n)),
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
