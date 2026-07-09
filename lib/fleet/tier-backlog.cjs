'use strict';
/**
 * Backlog-gated downward-claim helpers (SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-E, FR-6).
 *
 * Chairman directive: classifyDispatchIneligibility's tier axis was WORK-DOWN-ALWAYS (a worker
 * at tier R could freely claim any SD at or below R). This module implements
 * WORK-DOWN-ONLY-WHEN-LOWER-TIER-BACKLOGGED: a worker still claims AT its own tier freely, but
 * claiming a STRICTLY LOWER tier's work is gated on that lower tier having a genuine backlog
 * (unclaimed claimable work reachable at/below it exceeds the idle capacity of workers at/below
 * it) — otherwise the worker should idle and reserve its capability for its own-tier work.
 *
 * Both halves are DB-dependent (live worker census, claimable SD pool), so — matching the
 * existing worker_tier_rank/tiering_active pattern in claim-eligibility.cjs — the CALLER
 * precomputes them ONCE per check-in tick (or per dispatch decision) via tierClaimableBreakdown()
 * (reused verbatim, not re-derived) and idleWorkerCensusByTier() below, then passes the pair
 * through classifyDispatchIneligibility's ctx.lower_tier_backlog_data. lowerTierBacklog() itself
 * stays pure/synchronous so it can run inside the classifier.
 *
 * @module lib/fleet/tier-backlog
 */

const { resolveWorkerTierRank, ladderTopRank } = require('./tier-ladder.cjs');
// NB: tier-claimable.cjs is required LAZILY inside fetchLowerTierBacklogData below, not at module
// top level. claim-eligibility.cjs top-level-requires this module, and tier-claimable.cjs
// top-level-requires claim-eligibility.cjs — a top-level require here would complete the cycle
// (claim-eligibility -> tier-backlog -> tier-claimable -> claim-eligibility) and hand
// tier-claimable.cjs an incomplete claim-eligibility exports object at load time.

/**
 * Bucket already-IDLE, already-LIVE worker sessions by resolveWorkerTierRank. Idle/live
 * determination is the CALLER's job (worker-checkin.cjs / dispatch.cjs each already have their
 * own live-worker + claim-status joins — see coordinator-capacity-forecast.mjs's claimsBySession
 * join for the canonical "idle" definition, which is claiming_session_id-based, NOT
 * claude_sessions.sd_key, since the latter is not reliably cleared on release). This function is
 * a pure bucketing primitive only, so it stays reusable across both call sites without forcing a
 * second idle-determination implementation.
 * @param {Array<{ metadata?: { tier_rank?: number|string } }>} idleLiveWorkers
 * @returns {{ exact: Object<number,number>, cumulative: Object<number,number>, top: number }}
 */
function idleWorkerCensusByTier(idleLiveWorkers) {
  const top = ladderTopRank();
  const exact = {};
  for (let r = 1; r <= top; r += 1) exact[r] = 0;
  for (const w of (idleLiveWorkers || [])) {
    const rank = resolveWorkerTierRank(w);
    const r = Math.max(1, Math.min(top, Math.round(Number(rank)) || top));
    exact[r] += 1;
  }
  const cumulative = {};
  let running = 0;
  for (let r = 1; r <= top; r += 1) {
    running += exact[r];
    cumulative[r] = running;
  }
  return { exact, cumulative, top };
}

/**
 * Is the tier at/below `minTierRank` genuinely BACKLOGGED? True iff the claimable work reachable
 * by a worker at that rung (tierClaimableBreakdown's cumulative[minTierRank] — unscored + every
 * exact rank 1..minTierRank) exceeds the idle capacity of workers native to that rung or below
 * (idleWorkerCensusByTier's cumulative[minTierRank]). Both halves are CUMULATIVE, matching FR-6's
 * own definition ("... exceeds the idle capacity of workers at/below that tier").
 *
 * Pure/synchronous — `data` must already carry the precomputed breakdown + census (see module
 * docstring). Missing/malformed data resolves to `true` (treat as backlogged => admit the
 * downward claim) rather than `false` (reserve) — fail-OPEN, matching this codebase's dominant
 * philosophy of never stranding claimable work over a transient/missing-data fault; the
 * reservation is a utilization optimization, not a safety gate, so uncertainty must not block a
 * claim that would otherwise proceed under pre-FR-6 (WORK-DOWN-ALWAYS) behavior.
 * @param {number} minTierRank
 * @param {{ claimableBreakdown?: { cumulative?: Object<number,number> }, idleCensus?: { cumulative?: Object<number,number> } }} data
 * @returns {boolean}
 */
function lowerTierBacklog(minTierRank, data) {
  const r = Number(minTierRank);
  if (!Number.isFinite(r) || r < 1) return true; // unscored/invalid rank -> nothing to reserve against
  const claimable = data && data.claimableBreakdown && data.claimableBreakdown.cumulative
    ? Number(data.claimableBreakdown.cumulative[r]) : NaN;
  const idle = data && data.idleCensus && data.idleCensus.cumulative
    ? Number(data.idleCensus.cumulative[r]) : NaN;
  if (!Number.isFinite(claimable) || !Number.isFinite(idle)) return true; // fail-open: missing data never reserves
  return claimable > idle;
}

/**
 * Shared async fetcher: builds ctx.lower_tier_backlog_data from live DB state. ONE fleet-wide
 * SD scan + ONE live-session scan, reused by BOTH enforcement sites (worker-checkin.cjs self-claim
 * loop AND dispatch.cjs assertWorkerTierAllowed) so the backlog verdict can never drift between
 * the pull path and the directed-dispatch path — a worker correctly reserved-and-idle under
 * self-claim must see the SAME verdict if a WORK_ASSIGNMENT tries to hand it the same lower-tier
 * work (risk-agent LEAD-phase finding). Fail-open: any query fault returns null, and callers
 * treat a null return as "no backlog data" (byte-identical pre-FR-6 fallback).
 * @param {object} supabase service-role client
 * @returns {Promise<{ claimableBreakdown: object, idleCensus: object }|null>}
 */
async function fetchLowerTierBacklogData(supabase) {
  try {
    const { tierClaimableBreakdown } = require('./tier-claimable.cjs');
    const { liveFleetWorkers } = await import('./genuine-worker.mjs');
    const { getActiveCoordinatorId } = require('../coordinator/resolve.cjs');
    const liveCutoffIso = new Date(Date.now() - 900000).toISOString();
    const [{ data: fleetSds }, { data: fleetSessions }] = await Promise.all([
      supabase.from('strategic_directives_v2')
        .select('sd_key, sd_type, status, description, title, metadata, target_application, claiming_session_id')
        .not('status', 'in', '("completed","cancelled","deferred")'),
      supabase.from('claude_sessions')
        .select('session_id, status, metadata, heartbeat_at, sd_key, claimed_at, worktree_path, continuous_sds_completed')
        .in('status', ['active', 'idle'])
        .gte('heartbeat_at', liveCutoffIso)
        // SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-A hardened isTieringActive's identical bounded
        // query with this ordering after an unordered LIMIT silently dropped the 2 genuinely-live
        // workers behind a >1000-row stale-session page; mirrored here for the same reason.
        .order('heartbeat_at', { ascending: false })
        .limit(200),
    ]);
    const claimedSessionIds = new Set(
      (fleetSds || []).filter((d) => d.claiming_session_id).map((d) => d.claiming_session_id)
    );
    const claimablePool = (fleetSds || []).filter((d) => !d.claiming_session_id);
    const coordinatorId = await getActiveCoordinatorId(supabase).catch(() => null);
    const live = liveFleetWorkers(fleetSessions || [], coordinatorId, Date.now());
    // "idle" = no active SD claim ANYWHERE on the fleet, per claiming_session_id (mirrors
    // coordinator-capacity-forecast.mjs's claimsBySession join) — not claude_sessions.sd_key,
    // which is not reliably cleared on release.
    const idleWorkers = live.filter((w) => !claimedSessionIds.has(w.session_id));
    return {
      claimableBreakdown: tierClaimableBreakdown(claimablePool, { tieringActive: true }),
      idleCensus: idleWorkerCensusByTier(idleWorkers),
    };
  } catch {
    return null; // fail-open: caller treats null as "no backlog data"
  }
}

/**
 * QF-20260709-881: is the chairman-toggled Fable-window burn-down guard currently active?
 * Reads chairman_dashboard_config.metadata.fable_window_active (config_key='default'), the same
 * JSONB flag-bag lib/claim-guard.mjs's fetchClaimTTL reads claim_ttl_minutes from. Fail-open to
 * false — a config-fetch fault must never block a claim that would otherwise proceed.
 * @param {object} supabase service-role client
 * @returns {Promise<boolean>}
 */
async function fetchFableWindowActive(supabase) {
  try {
    const { data } = await supabase
      .from('chairman_dashboard_config')
      .select('metadata')
      .eq('config_key', 'default')
      .single();
    return data?.metadata?.fable_window_active === true;
  } catch {
    return false; // fail-open: config unavailable, never block a claim over this
  }
}

module.exports = { idleWorkerCensusByTier, lowerTierBacklog, fetchLowerTierBacklogData, fetchFableWindowActive };
