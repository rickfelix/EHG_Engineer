'use strict';
/**
 * Complexity-tier ladder + worker-tier resolution + degrade-to-1 invariant.
 * SD-LEO-INFRA-COMPLEXITY-TIERED-WORKER-ASSIGNMENT-001 (FR-2, FR-5).
 *
 * An ORDINAL model×effort ladder: each rung is cheaper-but-capable below, more
 * expensive above. v1 ladder maxes the CHEAP reasoning dial first (Sonnet@max),
 * then escalates Opus by effort. Cardinality is CONFIG-DRIVEN (read from LADDER),
 * never hardcoded — adding/removing a rung needs only this array, and every rank
 * comparison (clamp / top-rung default / rubric ceiling) keys off LADDER.length.
 *
 * Worker tier_rank is a CHAIRMAN-DECLARED stamp on claude_sessions.metadata.tier_rank
 * — this module does NOT build a worker self-advertisement mechanism. An UNSTAMPED
 * worker resolves to the TOP rung so it is never wrongly skipped-over (it can take any
 * work; the conservative direction).
 */

/** v1 ordinal ladder. rank 1 = cheapest-sufficient, rank N = most capable. */
const LADDER = [
  { rank: 1, model: 'sonnet', effort: 'max' },
  { rank: 2, model: 'opus', effort: 'low' },
  { rank: 3, model: 'opus', effort: 'medium' },
  { rank: 4, model: 'opus', effort: 'high' },
];

/** Top (most-capable) rung — config-driven, NOT a hardcoded 4. */
function ladderTopRank() {
  return LADDER.length;
}

/** Bound an arbitrary rank into the valid [1, ladderTopRank()] range. Non-numeric => top rung. */
function clamp(rank) {
  const n = Number(rank);
  if (!Number.isFinite(n)) return ladderTopRank();
  return Math.max(1, Math.min(ladderTopRank(), Math.round(n)));
}

/**
 * Resolve a worker session's declared tier_rank from claude_sessions.metadata.tier_rank.
 * Chairman/coordinator-declared stamp; defaults to the TOP rung when absent/invalid so an
 * unstamped worker is never wrongly skipped-over.
 * @param {{ metadata?: { tier_rank?: number|string } }} session
 * @returns {number} a rank in [1, ladderTopRank()]
 */
function resolveWorkerTierRank(session) {
  const raw = session && session.metadata && session.metadata.tier_rank;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1 && n <= ladderTopRank()) return Math.round(n);
  return ladderTopRank();
}

/** Tiering activates only at >= this many genuine live fleet workers (FR-5 degrade-to-1). */
const MIN_LIVE_FOR_TIERING = 2;

/**
 * Is complexity-tiering ACTIVE right now? True iff >= MIN_LIVE_FOR_TIERING genuine live
 * fleet workers exist (FR-5). With fewer, a lone worker takes ALL work regardless of rung,
 * so both enforcement points (claim-eligibility ctx.tiering_active, dispatch guard) gate on
 * this. It keys on live COUNT, never on which specific rungs are present, so any live SUBSET
 * of the ladder works. FAILS to DISABLED (degrade-to-1) on any uncertainty — tiering must
 * never strand the queue on a transient fault.
 * @param {object} supabase service-role client
 * @param {{ nowMs?: number }} [opts]
 * @returns {Promise<boolean>}
 */
async function isTieringActive(supabase, opts = {}) {
  try {
    const { getActiveCoordinatorId } = require('../coordinator/resolve.cjs');
    const { liveFleetWorkers } = await import('./genuine-worker.mjs');
    const coordinatorId = await getActiveCoordinatorId(supabase).catch(() => null);
    const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('session_id, status, metadata, heartbeat_at, sd_key, claimed_at, worktree_path, continuous_sds_completed')
      .in('status', ['active', 'idle'])
      .gte('heartbeat_at', new Date(nowMs - 900000).toISOString())
      .order('heartbeat_at', { ascending: false })
      .limit(200);
    if (error || !Array.isArray(data)) return false; // degrade-to-1 on uncertainty
    return liveFleetWorkers(data, coordinatorId, nowMs).length >= MIN_LIVE_FOR_TIERING;
  } catch {
    return false; // fail to DISABLED (degrade-to-1)
  }
}

module.exports = {
  LADDER,
  ladderTopRank,
  clamp,
  resolveWorkerTierRank,
  isTieringActive,
  MIN_LIVE_FOR_TIERING,
};
