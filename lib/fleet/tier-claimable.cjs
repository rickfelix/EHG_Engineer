'use strict';
/**
 * Shared tier-aware claimable rollup (SD-LEO-INFRA-BELT-TIER-AWARE-CLAIMABILITY-001).
 *
 * THE BUG THIS FIXES: a tier-3 worker sees the belt report N "ranked claimable" SDs but can claim 0 of
 * them (they all require a higher rung), so it idles for hours. The per-SD tier gate already exists
 * (claim-eligibility.cjs classifyDispatchIneligibility returns 'above_worker_tier' when a finite
 * metadata.min_tier_rank exceeds the worker's rung, given tier ctx), but the two surfaces a worker reads
 * are tier-blind: worker-checkin.cjs counts the FULL ranked pool and coordinator-capacity-forecast.mjs
 * reports a single aggregate. This module is the ONE rollup both surfaces consume.
 *
 * REUSE, DON'T RE-IMPLEMENT (TR-1, the sibling SD-FDBK-INFRA-RANKER-FORECAST-EXCLUSION-PARITY-001 lesson):
 * the tier comparison + the base exclusion axes are NOT re-derived here — they delegate to
 * classifyDispatchIneligibility (base axes without ctx; tier axis with ctx) and isExcludedFromBelt, so a
 * third drift surface cannot open against the gate.
 *
 * TWO SUBTLETIES (from the LEAD validation of this SD):
 *   - UNSCORED bucket: the gate only blocks a FINITE min_tier_rank > rung. An unscored SD (no finite
 *     min_tier_rank) is reachable by EVERY tier. It is counted once in the aggregate and appears in every
 *     tier's cumulative claimable-to-tier-N, so summing the EXACT-rank partition does not double-count it.
 *   - TIERING-OFF (degrade-to-1): with < MIN_LIVE_FOR_TIERING live workers the GLOBAL rung ladder is
 *     inert. FR-1 (BELT-CLAIMABLE-ACCURACY-FLOOR-001): an EXPLICITLY-stamped per-SD metadata.min_tier_rank
 *     is a FLOOR that is STILL honored when tiering is off (a Fable-only SD is never claimable by a
 *     Sonnet seat just because few workers are live). So with tiering off, claimableForTier / the
 *     breakdown exclude explicitly-floored above-rung SDs; only unscored SDs are reachable by every tier.
 *
 * @module lib/fleet/tier-claimable
 */

const { classifyDispatchIneligibility } = require('./claim-eligibility.cjs');
// require-of-ESM: Node >= 22.12 (this fleet runs Node 24) loads a synchronous ESM module from CJS.
// sd-exclusion.mjs is a pure, top-level-await-free classifier module, so this is safe.
const { isExcludedFromBelt } = require('../coordinator/sd-exclusion.mjs');
const { ladderTopRank } = require('./tier-ladder.cjs');

/** The stamped min-tier-rank the gate itself reads; null when unscored / non-finite (grouping only —
 *  the claim DECISION still goes through classifyDispatchIneligibility, never this reader). */
function sdMinTierRank(sd) {
  // NB: read via a ternary, not `Number(sd && sd.metadata && ...)` — a falsy chain yields `null`, and
  // Number(null) === 0 would masquerade as a finite rank 0 (an unscored SD read as "rank 0").
  const raw = sd && sd.metadata ? sd.metadata.min_tier_rank : undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Base (tier-agnostic) eligibility — mirrors the forecaster's aggregate loop: not belt-excluded AND the
 * shared gate returns null on the DB-free axes (orchestrator/fixture/human-action/co-author/deferred/
 * terminal). An optional depSatisfied(sd)=>bool adds the dependency axis when the caller has dep state.
 * @param {object} sd
 * @param {{ depSatisfied?: (sd:object)=>boolean }} [opts]
 * @returns {boolean}
 */
function isBaseEligible(sd, opts = {}) {
  if (!sd) return false;
  try { if (isExcludedFromBelt(sd)) return false; } catch { /* fail-open: classifier fault never excludes */ }
  if (classifyDispatchIneligibility(sd) !== null) return false;
  if (typeof opts.depSatisfied === 'function' && !opts.depSatisfied(sd)) return false;
  return true;
}

/** Does the tier axis block this SD for the given rung? Delegates to the gate (reuse, not re-derive).
 *
 *  FR-1 (SD-LEO-INFRA-BELT-CLAIMABLE-ACCURACY-FLOOR-001): the GLOBAL rung floor is inert when tiering
 *  is off, BUT an EXPLICITLY-stamped finite per-SD metadata.min_tier_rank is an author reservation that
 *  is ALWAYS honored (min_tier_rank = FLOOR, not a degradable global rung). Otherwise a Fable-only
 *  (min_tier_rank=3) SD is self-claimable by a Sonnet (rank 2) worker whenever fewer than
 *  MIN_LIVE_FOR_TIERING workers are live and the global flag flips off (live-caught e80c07b0:
 *  SD-LEO-FEAT-AUTHOR-VENTURE-DESIGN-001 claimed by Golf-4/tier_rank:2).
 *
 *  REUSE, DON'T RE-DERIVE (TR-1): the tiering-OFF explicit-floor case evaluates the SAME gate axis with
 *  tiering_active:true and honors only the FLOOR outcomes — 'above_worker_tier' and the fail-closed
 *  'tier_stamp_missing' (an unstamped worker vs an explicit floor is blocked, matching the gate's
 *  QF-20260703-242 semantics). Other tier-axis outcomes (fable-window / reservation) stay inert when
 *  global tiering is off. Unscored SDs (no finite min_tier_rank) remain reachable by every tier. */
function tierBlocks(sd, workerTierRank, tieringActive) {
  if (tieringActive !== true) {
    if (sdMinTierRank(sd) === null) return false; // unscored => reachable by every rung
    const verdict = classifyDispatchIneligibility(sd, { worker_tier_rank: workerTierRank, tiering_active: true });
    return verdict === 'above_worker_tier' || verdict === 'tier_stamp_missing';
  }
  return classifyDispatchIneligibility(sd, { worker_tier_rank: workerTierRank, tiering_active: true }) === 'above_worker_tier';
}

/**
 * The subset of `pool` claimable AT workerTierRank: base-eligible AND tier-reachable. With tiering off,
 * returns the full base-eligible aggregate (tier axis inert). Pass preFiltered:true when `pool` is already
 * base-eligible (e.g. the forecaster's `claimable`) to skip the re-filter.
 * @param {object[]} pool
 * @param {{ workerTierRank?: number, tieringActive?: boolean, preFiltered?: boolean, depSatisfied?: Function }} opts
 * @returns {object[]}
 */
function claimableForTier(pool, opts = {}) {
  const { workerTierRank, tieringActive, preFiltered = false, depSatisfied } = opts;
  const base = preFiltered ? (pool || []).slice() : (pool || []).filter((sd) => isBaseEligible(sd, { depSatisfied }));
  // FR-1: always filter through tierBlocks (passing the real tieringActive). tierBlocks keeps the
  // GLOBAL rung floor inert when tiering is off but still honors an EXPLICIT per-SD min_tier_rank,
  // so a below-rung worker's claimable set never includes an explicitly-floored SD it cannot claim.
  return base.filter((sd) => !tierBlocks(sd, workerTierRank, tieringActive === true));
}

/**
 * Full per-tier breakdown for the capacity forecast. Returns the EXACT-rank partition (each base-eligible
 * SD in exactly one bucket — rank 1..top, plus `unscored`, plus `aboveTop` for a defensive finite rank >
 * top that no rung can claim) and the CUMULATIVE claimable-to-tier-N (what a tier-N worker can actually
 * reach = unscored + sum of exact ranks 1..N). Self-checking invariant: aggregate === unscored + aboveTop
 * + sum(exact). When tieringActive !== true, cumulative is the full aggregate for every rung.
 * @param {object[]} pool
 * @param {{ tieringActive?: boolean, preFiltered?: boolean, depSatisfied?: Function }} opts
 * @returns {{ aggregate:number, top:number, exact:Object, unscored:number, aboveTop:number, cumulative:Object, tieringActive:boolean, partitionSumsToAggregate:boolean }}
 */
function tierClaimableBreakdown(pool, opts = {}) {
  const { tieringActive, preFiltered = false, depSatisfied } = opts;
  const base = preFiltered ? (pool || []).slice() : (pool || []).filter((sd) => isBaseEligible(sd, { depSatisfied }));
  const top = ladderTopRank();
  const exact = {};
  for (let r = 1; r <= top; r += 1) exact[r] = 0;
  let unscored = 0;
  let aboveTop = 0;
  for (const sd of base) {
    const r = sdMinTierRank(sd);
    if (r === null || r < 1) unscored += 1;            // unscored / nonsensical => reachable by all rungs
    else if (r > top) aboveTop += 1;                    // defensive: a finite rank no rung can satisfy
    else exact[r] += 1;
  }
  const cumulative = {};
  let running = unscored;
  for (let r = 1; r <= top; r += 1) {
    running += exact[r];
    // FR-1 (BELT-CLAIMABLE-ACCURACY-FLOOR-001): an EXPLICIT per-SD min_tier_rank (the exact[] partition)
    // is honored in BOTH tiering states, so claimable-to-rung-r is always unscored + sum(exact 1..r).
    // The only floor this module knows is metadata.min_tier_rank (sdMinTierRank), so "tiering off" no
    // longer means "every rung claims the full aggregate" — explicitly-floored SDs stay above-rung.
    cumulative[r] = running;
  }
  const aggregate = base.length;
  const partitionSumsToAggregate = (unscored + aboveTop + Object.values(exact).reduce((a, b) => a + b, 0)) === aggregate;
  return { aggregate, top, exact, unscored, aboveTop, cumulative, tieringActive: tieringActive === true, partitionSumsToAggregate };
}

module.exports = {
  sdMinTierRank,
  isBaseEligible,
  tierBlocks,
  claimableForTier,
  tierClaimableBreakdown,
};
