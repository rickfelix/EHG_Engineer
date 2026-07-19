'use strict';
/**
 * Complexity-tier ladder + worker-tier resolution + degrade-to-1 invariant.
 * SD-LEO-INFRA-COMPLEXITY-TIERED-WORKER-ASSIGNMENT-001 (FR-2, FR-5).
 * SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-B (FR-1..FR-4): strength-engine rewrite.
 *
 * A model×effort STRENGTH ENGINE replaces the old static 4-rung ladder. Each worker's
 * capabilityScore is model-dominant (any stronger model outranks any weaker model
 * regardless of effort); tier_rank is the DENSE RANK of capabilityScore among the
 * DISTINCT scores present in a live fleet snapshot, mapped to 1..K. K is CACHED
 * (lastKnownTopRank) and refreshed only when a live fleet is actually observed, so
 * argument-free callers (clamp/ladderTopRank/resolveWorkerTierRank and their consumers
 * lib/fleet/sd-tier-rank.mjs, lib/fleet/tier-claimable.cjs, lib/coordinator/dispatch.cjs)
 * keep working unmodified against a safe default of K=4.
 *
 * Worker tier_rank is still ultimately a stamp on claude_sessions.metadata.tier_rank —
 * this module derives what that stamp SHOULD be; the write path is
 * scripts/worker-checkin.cjs. An UNSTAMPED worker resolves to the TOP rung so it is
 * never wrongly skipped-over (it can take any work; the conservative direction) — the
 * same rule extends to normalizeModel/normalizeEffort: an unrecognized value maps UP
 * to the strongest known value, never down.
 */

/** Model strength, weakest to strongest. */
// REVISIT-IF(condition=model lineup changes e.g. Gemini 3.5 GA or Claude 5.x delegate tiers) owner=coordinator provenance=SD-LEO-INFRA-BITTER-LESSON-AUDIT-001 note=the primary hand-baked name-to-rank map; PARAMETERIZE target — move to model-config as data per bitter-lesson ledger component 1
const MODEL_STRENGTH = Object.freeze({ haiku: 0, sonnet: 1, opus: 2, fable: 3 });

/** Effort strength, weakest to strongest. 'xhigh' is the canonical top spelling. */
const EFFORT_STRENGTH = Object.freeze({ low: 0, medium: 1, high: 2, xhigh: 3 });

/** Legacy effort spellings folded into the canonical set (conservative-UP). */
const EFFORT_SYNONYMS = Object.freeze({ max: 'xhigh' });

/** Width of the effort dimension — capabilityScore = model * EFFORT_SPAN + effort. */
const EFFORT_SPAN = Math.max(...Object.values(EFFORT_STRENGTH)) + 1;

const STRONGEST_MODEL = Object.keys(MODEL_STRENGTH).reduce(
  (a, b) => (MODEL_STRENGTH[b] > MODEL_STRENGTH[a] ? b : a)
);
const STRONGEST_EFFORT = Object.keys(EFFORT_STRENGTH).reduce(
  (a, b) => (EFFORT_STRENGTH[b] > EFFORT_STRENGTH[a] ? b : a)
);

/**
 * v1 static ladder — the SAFE DEFAULT (K=4) before any live fleet has been observed.
 * QF-20260705-394: the ladder intentionally KEEPS K=4 — fable does not add rungs 5-8.
 * Growing the static K would shift every K-anchored consumer (sd-tier-rank's midRank
 * and risk floor, callsign tier bands), stranding mid-complexity SDs on opus fleets —
 * the "Opus-med floor" contract pinned by tests/unit/fleet/complexity-tiered-assignment.
 * Instead, rankForModelEffort() below dense-ranks against these rungs, so every fable
 * pair (score above ALL rungs) maps to the TOP static rung: fable ties opus/high at 4
 * in the static stamp space, and min_tier_rank=4 SDs dispatch to fable workers. The
 * fable>opus distinction still exists where it matters dynamically: capabilityScore is
 * model-dominant and deriveLiveLadder dense-ranks fable above opus in live fleets.
 *
 * QF-20260705-953: v1 placed EVERY sonnet effort at rank 1 (the rung was anchored at
 * sonnet/max, the single strongest sonnet score, so nothing sonnet could ever clear
 * it). A week of shipped evidence (zero tier-attributable failures on sonnet/high and
 * sonnet/xhigh workers claiming tier-2 SDs) contradicted that placement — Adam-endorsed
 * fix, scoped exactly to the evidenced efforts: sonnet/high and sonnet/xhigh now dense-
 * rank at 2 (the anchor moves from sonnet/max to sonnet/high, which is <= both of their
 * scores), while sonnet/low and sonnet/medium are UNCHANGED at rank 1 (no evidence covers
 * them, so they stay in the weakest band — not a blanket sonnet promotion). opus/low is
 * no longer a literal LADDER anchor, but its dense rank still computes to 2 via the gap
 * between the sonnet/high(2) and opus/medium(3) anchors — sd-tier-rank.mjs's
 * OPUS_LOW_RUNG lookup degrades to its documented literal-2 fallback, which still matches.
 * opus/medium=3 and opus/high=4 are untouched anchors.
 */
const LADDER = [
  { rank: 1, model: 'sonnet', effort: 'low' },
  { rank: 2, model: 'sonnet', effort: 'high' },
  { rank: 3, model: 'opus', effort: 'medium' },
  { rank: 4, model: 'opus', effort: 'high' },
];

/** Cached top rank. Starts at the static default; refreshed by deriveLiveLadder. */
let lastKnownTopRank = LADDER.length;

/**
 * Unknown/missing model maps conservative-UP to the strongest known model — never
 * silently down to the weakest, so an unrecognized-but-possibly-powerful worker is
 * never under-restricted.
 * @param {string} [model]
 * @returns {string} a key of MODEL_STRENGTH
 */
function normalizeModel(model) {
  const key = typeof model === 'string' ? model.toLowerCase().trim() : '';
  return Object.prototype.hasOwnProperty.call(MODEL_STRENGTH, key) ? key : STRONGEST_MODEL;
}

/**
 * Unknown/missing effort (including legacy 'max') maps conservative-UP to the
 * strongest known effort ('xhigh') — never silently down to the weakest.
 * @param {string} [effort]
 * @returns {string} a key of EFFORT_STRENGTH
 */
function normalizeEffort(effort) {
  const raw = typeof effort === 'string' ? effort.toLowerCase().trim() : '';
  const key = EFFORT_SYNONYMS[raw] || raw;
  return Object.prototype.hasOwnProperty.call(EFFORT_STRENGTH, key) ? key : STRONGEST_EFFORT;
}

/**
 * Model-dominant capability score: any stronger model outranks any weaker model
 * regardless of effort. Normalizes both inputs first (unknown => strongest).
 * @param {string} [model]
 * @param {string} [effort]
 * @returns {number}
 */
function capabilityScore(model, effort) {
  return MODEL_STRENGTH[normalizeModel(model)] * EFFORT_SPAN + EFFORT_STRENGTH[normalizeEffort(effort)];
}

/** Ascending capabilityScores of the static rungs — the canonical stamp rank space. */
const LADDER_SCORES = LADDER
  .map((rung) => capabilityScore(rung.model, rung.effort))
  .sort((a, b) => a - b);

/**
 * Reverse lookup: the STATIC-LADDER dense rank of a (model, effort) pair — the number
 * of static rungs whose capabilityScore is <= this pair's score, floored at 1.
 * QF-20260705-394: this REPLACES the old raw-lattice `score + 1` value. The lattice
 * value (up to model×effort = 16) was never a ladder rank; every caller had to clamp()
 * it against the CACHED top rank, and a live-shrunk cache (K=3 fleet) collapsed
 * fable/xhigh to 3 — below statically-stamped rank-4 SDs — clobbering coordinator
 * stamps on every re-derivation. The static dense rank is process-independent and
 * ladder-bounded by construction: rankForModelEffort('fable','xhigh') === LADDER.length,
 * rankForModelEffort('opus','high') === 4 (existing min_tier_rank stamps unchanged),
 * and a below-ladder pair (haiku/*, sonnet sub-max) floors at rank 1 instead of the old
 * absurdity of clamping UP to the top rung.
 * @param {string} [model]
 * @param {string} [effort]
 * @returns {number} a rank in [1, LADDER.length]
 */
function rankForModelEffort(model, effort) {
  const score = capabilityScore(model, effort);
  let rank = 0;
  for (const rungScore of LADDER_SCORES) {
    if (rungScore <= score) rank += 1;
    else break;
  }
  return Math.max(1, rank);
}

/** Top (most-capable) rung — cached, refreshed only by deriveLiveLadder. */
function ladderTopRank() {
  return lastKnownTopRank;
}

/** Bound an arbitrary rank into the valid [1, ladderTopRank()] range. Non-numeric => top rung. */
function clamp(rank) {
  const n = Number(rank);
  if (!Number.isFinite(n)) return ladderTopRank();
  return Math.max(1, Math.min(ladderTopRank(), Math.round(n)));
}

/**
 * Resolve a worker session's declared tier_rank from claude_sessions.metadata.tier_rank.
 * SINGLE-ARG, unchanged signature (lib/coordinator/dispatch.cjs:238 and
 * scripts/worker-checkin.cjs call this argument-free-of-live-fleet). Defaults to the
 * TOP rung when absent/invalid so an unstamped worker is never wrongly skipped-over.
 * @param {{ metadata?: { tier_rank?: number|string } }} session
 * @returns {number} a rank in [1, ladderTopRank()]
 */
function resolveWorkerTierRank(session) {
  const raw = session && session.metadata && session.metadata.tier_rank;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1 && n <= ladderTopRank()) return Math.round(n);
  return ladderTopRank();
}

/**
 * Build a dense-ranked ladder from a live fleet snapshot ([{model, effort}, ...]).
 * Dense-ranks the DISTINCT capabilityScores actually present, 1..K, and REFRESHES the
 * cached lastKnownTopRank to K (only when the fleet is non-empty — an empty fleet
 * leaves the cache untouched, degrading safely to the prior/default K).
 * @param {Array<{model?: string, effort?: string}>} liveFleet
 * @returns {{ rankByScore: Map<number, number>, topRank: number, entries: Array<object> }}
 */
function deriveLiveLadder(liveFleet) {
  const list = Array.isArray(liveFleet) ? liveFleet : [];
  const scored = list.map((w) => ({
    model: normalizeModel(w && w.model),
    effort: normalizeEffort(w && w.effort),
    score: capabilityScore(w && w.model, w && w.effort),
  }));
  const distinctScores = [...new Set(scored.map((s) => s.score))].sort((a, b) => a - b);
  const rankByScore = new Map(distinctScores.map((score, i) => [score, i + 1]));
  const topRank = distinctScores.length > 0 ? distinctScores.length : lastKnownTopRank;
  if (distinctScores.length > 0) lastKnownTopRank = topRank;
  const entries = scored.map((s) => ({ ...s, rank: rankByScore.get(s.score) }));
  return { rankByScore, topRank, entries };
}

/**
 * Two-arg tier-rank resolution: prefers the live-fleet-derived dense rank for this
 * worker's model/effort when a live fleet is supplied; falls back to the single-arg
 * resolveWorkerTierRank behavior otherwise. Does NOT replace resolveWorkerTierRank —
 * added alongside it so existing single-arg callers are untouched.
 * @param {{ metadata?: { tier_rank?: number|string, model?: string, effort?: string } }} session
 * @param {Array<{model?: string, effort?: string}>} [liveFleet]
 * @returns {number}
 */
function deriveWorkerTierRank(session, liveFleet) {
  const model = session && session.metadata && session.metadata.model;
  const effort = session && session.metadata && session.metadata.effort;
  if (model && effort && Array.isArray(liveFleet) && liveFleet.length > 0) {
    const { rankByScore } = deriveLiveLadder(liveFleet);
    const rank = rankByScore.get(capabilityScore(model, effort));
    if (Number.isFinite(rank)) return rank;
  }
  return resolveWorkerTierRank(session);
}

/**
 * QF-20260705-394: the rank to STAMP on a worker session — the live-fleet dense rank
 * FLOORED at the static rankForModelEffort when model+effort are known. The identity
 * assigner cron (scripts/assign-fleet-identities.cjs, the authoritative tier_rank
 * writer per -001-C FR-4) previously wrote the raw live dense rank: in any fleet with
 * fewer distinct capability scores than static rungs (K<4), that COMPRESSED the
 * strongest workers below rank 4 — while SD min_tier_rank thresholds are written in
 * the STATIC space (sd-tier-rank risk floor = 4) — so rank-4 SDs were refused against
 * fable/xhigh (live specimen 4901448b: stamped 3, DISPATCH_ABOVE_WORKER_TIER, and the
 * cron re-clobbered any corrective stamp within minutes). When model+effort are known
 * the stamp is the PURE static rank — no live-relative raise either: a tall live fleet
 * (5+ distinct scores) would otherwise inflate a weak pair ABOVE its static rung and
 * dispatch static-space min_tier_rank work above its capability (adversarial-review
 * finding on this QF), and it keeps this writer formula-identical to worker-checkin's
 * self-report stamp so the two authoritative writers can never disagree. Unknown
 * model/effort keeps today's behavior (deriveWorkerTierRank -> existing stamp or top).
 * @param {{ metadata?: { model?: string, effort?: string, tier_rank?: number|string } }} session
 * @param {Array<{model?: string, effort?: string}>} [liveFleet]
 * @returns {number}
 */
function stampRankForWorker(session, liveFleet) {
  const m = session && session.metadata && session.metadata.model;
  const e = session && session.metadata && session.metadata.effort;
  if (m && e) return rankForModelEffort(m, e);
  return deriveWorkerTierRank(session, liveFleet);
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

/**
 * FR-4.3 (SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-002-D): dispatch tiering's routing-score
 * resolution — a behavior-preserving adapter over the ONE routing-doctrine seam
 * (lib/eval/routing-consumption.mjs). The seam's fallback SSOT is this module's own
 * capabilityScore, so with zero trusted_for_routing rows (or no shape for the tuple)
 * this returns exactly capabilityScore(model, effort) — a no-op until the
 * model_capability_reference table binds (child C). SINGLE-DOCTRINE GUARD: no other
 * routing metric may be defined here or in any consumer; graded scores enter dispatch
 * tiering ONLY through this function. NEVER throws (fail-open to the static score).
 * @param {{ supabase?: object|null, shape?: string|null, model?: string, effort?: string }} args
 * @returns {Promise<number>}
 */
async function resolveRoutingScore({ supabase = null, shape = null, model, effort } = {}) {
  try {
    const { resolveCapabilityRouting } = await import('../eval/routing-consumption.mjs');
    return await resolveCapabilityRouting({ supabase, shape, model, effort });
  } catch {
    return capabilityScore(model, effort);
  }
}

/**
 * Test-only: reset the cached lastKnownTopRank back to the static default (LADDER.length).
 * lastKnownTopRank is module-level mutable state, so tests that call deriveLiveLadder must
 * reset it (e.g. in beforeEach) to avoid leaking a cached K across unrelated test cases.
 */
function __resetLadderCacheForTests() {
  lastKnownTopRank = LADDER.length;
}

module.exports = {
  LADDER,
  ladderTopRank,
  clamp,
  resolveWorkerTierRank,
  isTieringActive,
  MIN_LIVE_FOR_TIERING,
  MODEL_STRENGTH,
  EFFORT_STRENGTH,
  EFFORT_SPAN,
  capabilityScore,
  rankForModelEffort,
  normalizeModel,
  normalizeEffort,
  deriveLiveLadder,
  deriveWorkerTierRank,
  stampRankForWorker,
  resolveRoutingScore,
  __resetLadderCacheForTests,
};
