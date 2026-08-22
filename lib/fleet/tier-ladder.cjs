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
 *
 * QF-20260724-245: MODEL_STRENGTH's keys are bare FAMILY names, but workers self-report
 * their real model ID at checkin ('claude-opus-5', 'claude-opus-5[1m]', 'claude-opus-4-8').
 * An exact-key lookup misses every one of those and dropped them into the unknown branch,
 * so genuine Opus/Sonnet/Haiku seats scored as fable-tier. That is not the conservative-UP
 * rule working as intended — a recognizable id is not an unknown model. deriveLiveLadder
 * dense-ranks on capabilityScore, so an all-Opus fleet could dense-rank as if it were fable
 * seats, which matters under the 50% weekly Fable cap policy and fable_window_active gating.
 * Resolve the family out of a full id BEFORE falling back. When more than one family name
 * appears in a single id, take the STRONGEST match, so this stays in the same
 * conservative-UP direction as the unknown fallback it precedes. Truly unrecognized and
 * empty/missing values are untouched and still resolve to STRONGEST_MODEL.
 * @param {string} [model]
 * @returns {string} a key of MODEL_STRENGTH
 */
function normalizeModel(model) {
  const key = typeof model === 'string' ? model.toLowerCase().trim() : '';
  if (Object.prototype.hasOwnProperty.call(MODEL_STRENGTH, key)) return key;
  const families = Object.keys(MODEL_STRENGTH).filter((family) => key.includes(family));
  if (families.length > 0) {
    return families.reduce((a, b) => (MODEL_STRENGTH[b] > MODEL_STRENGTH[a] ? b : a));
  }
  return STRONGEST_MODEL;
}

/**
 * STRICT family resolution: the MODEL_STRENGTH family named inside a model id, or
 * null when the id names no known family. SD-LEO-INFRA-FLEET-MODEL-REGISTRY-001 FR-3.
 *
 * This is deliberately NOT normalizeModel. normalizeModel answers "how strong should
 * I assume this seat is?" and therefore resolves an unknown id conservative-UP to
 * STRONGEST_MODEL (fable). Callers that gate on IDENTITY rather than strength cannot
 * use that: an exclusivity check written as `normalizeModel(id) === 'fable'` would
 * admit every unrecognized model on earth, which is the exact inversion the one-way
 * door exists to prevent. Identity questions get null for unknown; strength questions
 * get conservative-UP. Same substring/strongest-match rule as normalizeModel for ids
 * that DO name a family, so a recognizable id resolves identically in both.
 * @param {string} [model]
 * @returns {string|null} a key of MODEL_STRENGTH, or null if no known family appears
 */
function familyFromModelId(model) {
  const key = typeof model === 'string' ? model.toLowerCase().trim() : '';
  if (!key) return null;
  if (Object.prototype.hasOwnProperty.call(MODEL_STRENGTH, key)) return key;
  const families = Object.keys(MODEL_STRENGTH).filter((family) => key.includes(family));
  if (families.length === 0) return null;
  return families.reduce((a, b) => (MODEL_STRENGTH[b] > MODEL_STRENGTH[a] ? b : a));
}

/**
 * The family a SEAT should be treated as declaring, preferring the explicit
 * metadata.model_family stamp and falling back to resolving it out of
 * metadata.model. SD-LEO-INFRA-FLEET-MODEL-REGISTRY-001 FR-3 / TR-2.
 *
 * The fallback is not an edge case: at the time this shipped, zero live seats
 * carried model_family, so the fallback is the ONLY populated path on day one.
 * An unrecognized model_family value is ignored in favour of the raw id rather
 * than trusted, so a malformed stamp cannot launder an unknown seat into a family.
 * @param {object} [metadata] a claude_sessions.metadata object
 * @returns {string|null}
 */
function declaredSeatFamily(metadata) {
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  const stamped = familyFromModelId(meta.model_family);
  return stamped || familyFromModelId(meta.model);
}

const WEAKEST_MODEL = Object.keys(MODEL_STRENGTH).reduce(
  (a, b) => (MODEL_STRENGTH[b] < MODEL_STRENGTH[a] ? b : a)
);

/**
 * FR-5 observability sink for capability resolved from absent or unrecognized evidence.
 *
 * Both failure directions are silent without this. BEFORE this SD an unknown model scored
 * as the STRONGEST seat in the fleet and was handed the hardest work; AFTER FR-4 it scores
 * below the lowest rung and can claim almost nothing. Over-permission and starvation are
 * equally invisible if nobody is told, and the SD's own mitigation — the /v1/models
 * discovery loop — is deferred, so this is the only tripwire in the interim.
 *
 * Events go to an in-process buffer (assertable by tests without spying on console) AND
 * to stderr with a distinct greppable token, since a SessionStart hook is short-lived and
 * an in-memory buffer alone would never reach the coordinator.
 */
const UNRESOLVED_CAPABILITY_TOKEN = 'UNRESOLVED_SEAT_CAPABILITY';
const unresolvedCapabilityEvents = [];
let unresolvedCapabilitySink = null;

/** Install a sink for FR-5 events (tests + any consumer that wants them structured). */
function setUnresolvedCapabilitySink(fn) { unresolvedCapabilitySink = typeof fn === 'function' ? fn : null; }
/** Drain the in-process FR-5 event buffer. */
function drainUnresolvedCapabilityEvents() { return unresolvedCapabilityEvents.splice(0); }

function reportUnresolvedCapability(rawModel, context) {
  const event = {
    token: UNRESOLVED_CAPABILITY_TOKEN,
    raw_model: rawModel === undefined ? null : rawModel,
    reason: (typeof rawModel === 'string' && rawModel.trim()) ? 'unrecognized_model' : 'no_model_stamp',
    resolved_to: WEAKEST_MODEL,
    context: context || null,
  };
  unresolvedCapabilityEvents.push(event);
  try {
    if (unresolvedCapabilitySink) unresolvedCapabilitySink(event);
    else process.stderr.write(`[tier-ladder] ${UNRESOLVED_CAPABILITY_TOKEN} ${JSON.stringify(event)}\n`);
  } catch { /* observability must never break ranking */ }
  return event;
}

/**
 * SEAT capability resolution: an unknown model resolves to the WEAKEST known model.
 * SD-LEO-INFRA-FLEET-MODEL-REGISTRY-001 FR-4.
 *
 * This is the deliberate OPPOSITE of normalizeModel, and the split is the point. Fail-safe
 * for SEAT CAPABILITY and fail-safe for WORK DEMAND run in opposite directions: assuming an
 * unmeasured WORKER is strong hands it work it may not be able to do, while assuming
 * unclassified WORK is easy routes it to a seat that cannot handle it. A single shared
 * "unknown resolves to X" helper cannot serve both, which is how a seat with zero capability
 * evidence came to be rated top-tier. normalizeModel keeps its conservative-UP contract for
 * every demand-side and family-resolution caller; only seat-capability paths come here.
 *
 * A RECOGNIZABLE id is never "unknown" — claude-opus-5[1m] resolves to opus in both, so the
 * QF-20260724-245 fix is preserved and no currently-live seat changes rank.
 * @param {string} [model]
 * @param {string} [context] optional label for the FR-5 event (e.g. a session id)
 * @returns {string} a key of MODEL_STRENGTH
 */
function resolveSeatModel(model, context) {
  const family = familyFromModelId(model);
  if (family) return family;
  reportUnresolvedCapability(model, context);
  return WEAKEST_MODEL;
}

/**
 * Does this seat carry POSITIVE evidence of its own capability?
 * SD-LEO-INFRA-FLEET-MODEL-REGISTRY-001 FR-6 (added at EXEC on live coordinator evidence).
 *
 * ADMISSION CONTROL, NOT ROUTING. A coordinator that refuses to dispatch to an unverified
 * seat does not stop that seat CLAIMING, because self-claim consults the persisted stamp,
 * not the coordinator. Observed live 2026-07-25: seat 08d7f71d, carrying tier_rank=4 with
 * metadata.model AND metadata.effort both UNSET, self-claimed a QF while both the
 * coordinator and Adam had spent the day explicitly routing around it. Re-stamping alone
 * cannot fix that: the stale rank is already persisted and self-claim reads it directly.
 *
 * Deliberately a POSITIVE test — a seat must prove capability, not merely fail to disprove
 * it, which is the whole inversion this SD exists to correct.
 * @param {object} [metadata] a claude_sessions.metadata object
 * @returns {boolean}
 */
function seatCapabilityIsVerified(metadata) {
  const m = metadata && typeof metadata === 'object' ? metadata : {};
  return !!(familyFromModelId(m.model_family) || familyFromModelId(m.model));
}

/** Seat-scoped capabilityScore — identical to capabilityScore except unknown fails DOWN. */
function seatCapabilityScore(model, effort, context) {
  return MODEL_STRENGTH[resolveSeatModel(model, context)] * EFFORT_SPAN
    + EFFORT_STRENGTH[normalizeEffort(effort)];
}

/** Seat-scoped rankForModelEffort — same dense-rank arithmetic, seat-scoped model resolution. */
function seatRankForModelEffort(model, effort, context) {
  const score = seatCapabilityScore(model, effort, context);
  let rank = 0;
  for (const rungScore of LADDER_SCORES) {
    if (rungScore <= score) rank += 1;
    else break;
  }
  return Math.max(1, rank);
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
 * QF-20260807-159 (item 2): was the effort RECOGNISED, or did normalizeEffort fall back?
 *
 * normalizeEffort already computes this and then throws it away, so the caller cannot
 * distinguish `--effort xhigh` (a report) from `--effort tuesday` (a guess that happens to
 * land on xhigh). Both then get stamped effort_source='worker_self_report', which dresses a
 * guess as a report — and the check-in contract keys authoritative-wins-over-worker on that
 * field, so an unrecognised value inherits the standing of a real one.
 *
 * Deliberately a SEPARATE predicate rather than changing normalizeEffort's return shape:
 * every existing caller keeps its contract, and a recognition check that nobody is forced to
 * read cannot break a ranking path.
 */
function isKnownEffort(effort) {
  const raw = typeof effort === 'string' ? effort.toLowerCase().trim() : '';
  const key = EFFORT_SYNONYMS[raw] || raw;
  return Object.prototype.hasOwnProperty.call(EFFORT_STRENGTH, key);
}

/** Same question for a model id: does it resolve to a known family, or is the rank a guess? */
function isKnownModel(model) {
  return Boolean(familyFromModelId(model));
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
 * SD-LEO-INFRA-SELF-CLAIM-TIER-ENFORCEMENT-001 (FR-4): the ONE tier-rank comparison, shared by
 * lib/fleet/claim-eligibility.cjs's tierAxes (self-claim ladder) and
 * lib/coordinator/dispatch.cjs's assertWorkerTierAllowed (directed-dispatch choke).
 *
 * Before this extraction the two were independent, hand-rolled implementations sharing only the
 * resolveWorkerTierRank/lowerTierBacklog primitives, not the comparison itself. tierAxes
 * defensively checked Number.isFinite(workerTierRank) before comparing (QF-20260703-242,
 * fail-closed on a missing/non-finite rank for a SCORED SD); assertWorkerTierAllowed did not --
 * it compared `minRank > workerRank` directly, correct ONLY because it always sources workerRank
 * from resolveWorkerTierRank(sess) on a real session row, which today never returns non-finite
 * (it defaults to the top rung instead). That made assertWorkerTierAllowed correct BY COINCIDENCE
 * of resolveWorkerTierRank's current contract, not by its own construction -- a future change to
 * that contract, or a caller of THIS shared function that sources workerTierRank some other way,
 * would silently allow above-tier work through the un-guarded comparison. This function closes
 * that gap once, for both callers, regardless of what either caller's rank ultimately came from.
 *
 * @param {number|undefined} workerTierRank - the calling worker's resolved tier rank
 * @param {number|undefined} minTierRank - the SD's metadata.min_tier_rank (may be unscored)
 * @returns {'above_worker_tier'|'tier_stamp_missing'|null}
 */
function tierRankVerdict(workerTierRank, minTierRank) {
  const minRank = Number(minTierRank);
  if (!Number.isFinite(minRank)) return null; // unscored SD -> no floor to enforce
  if (!Number.isFinite(Number(workerTierRank))) return 'tier_stamp_missing'; // fail closed, scored SD
  const workerRank = Number(workerTierRank);
  if (minRank > workerRank) return 'above_worker_tier';
  return null;
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
  // FR-4: a live fleet snapshot is a set of SEATS, so unknown resolves DOWN here. Using the
  // demand-side normalizeModel let one unrecognized seat dense-rank as though it were the
  // most capable model in the fleet, shifting every rung for everyone else.
  const scored = list.map((w) => ({
    model: resolveSeatModel(w && w.model, 'deriveLiveLadder'),
    effort: normalizeEffort(w && w.effort),
    score: seatCapabilityScore(w && w.model, w && w.effort, 'deriveLiveLadder'),
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
  // FR-4: this stamps a SEAT, so unknown resolves DOWN.
  if (m && e) return seatRankForModelEffort(m, e, session && session.session_id);
  // FR-5: an UNSET model short-circuits here, never reaching any model resolver — this is
  // why seat 08d7f71d carried tier_rank=4 with no capability evidence at all, and why the
  // FR-4 flip alone would not have touched it. The ladderTopRank default below is left
  // DELIBERATELY UNCHANGED (out of scope for this SD); it is now merely observable.
  reportUnresolvedCapability(m, session && session.session_id);
  return deriveWorkerTierRank(session, liveFleet);
}

/** Tiering activates only at >= this many genuine live fleet workers (FR-5 degrade-to-1). */
const MIN_LIVE_FOR_TIERING = 2;

/**
 * Shared fetch behind isTieringActive/liveWorkerCapabilitySnapshot: the genuine-live-fleet
 * claude_sessions rows, filtered through lib/fleet/genuine-worker.mjs (the one SSOT for "is
 * this row a live fleet worker"). Extracted (SD-LEO-INFRA-INTELLIGENT-ROUTING-RANK-001) so a
 * second caller needing the per-worker rows, not just the count, does not hand-roll a second
 * copy of this query and drift from it — grep-for-the-chokepoint-first per CLAUDE_EXEC.md.
 * Returns [] on any fault (fail-open; callers already treat an empty live set as "degrade").
 * @param {object} supabase service-role client
 * @param {{ nowMs?: number }} [opts]
 * @returns {Promise<Array<object>>} claude_sessions rows (session_id, status, metadata, ...)
 */
async function fetchLiveFleetRows(supabase, opts = {}) {
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
    if (error || !Array.isArray(data)) return [];
    return liveFleetWorkers(data, coordinatorId, nowMs);
  } catch {
    return [];
  }
}

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
  const live = await fetchLiveFleetRows(supabase, opts);
  return live.length >= MIN_LIVE_FOR_TIERING;
}

/**
 * SD-LEO-INFRA-INTELLIGENT-ROUTING-RANK-001 (FR-1/FR-2): the live fleet's per-worker dense
 * ranks AND model/effort, for the two callers that need more than isTieringActive's boolean —
 * lib/fleet/dispatch-suggestions.cjs (FR-1 ranked suggestions) and
 * lib/checkin/steps/merged-pool-self-claim.cjs (FR-2 pickup-fit defer check). Reuses
 * fetchLiveFleetRows + deriveLiveLadder rather than re-deriving either. Fail-open to an empty
 * snapshot ({ workers: [], ranks: [] }) on any fault — both callers already treat an empty
 * live set as "no tiering signal, behave as before".
 * @param {object} supabase service-role client
 * @param {{ nowMs?: number, excludeSessionId?: string }} [opts]
 * @returns {Promise<{ workers: Array<{session_id:string, model:(string|undefined), effort:(string|undefined), rank:number}>, ranks: number[] }>}
 */
async function liveWorkerCapabilitySnapshot(supabase, opts = {}) {
  try {
    const live = await fetchLiveFleetRows(supabase, opts);
    const rows = opts.excludeSessionId
      ? live.filter((s) => s.session_id !== opts.excludeSessionId)
      : live;
    const fleetForLadder = rows.map((s) => ({
      model: s?.metadata?.model,
      effort: s?.metadata?.effort,
    }));
    const { entries } = deriveLiveLadder(fleetForLadder);
    const workers = rows.map((s, i) => ({
      session_id: s.session_id,
      model: entries[i]?.model,
      effort: entries[i]?.effort,
      rank: entries[i]?.rank,
    }));
    return { workers, ranks: workers.map((w) => w.rank).filter((r) => Number.isFinite(r)) };
  } catch {
    return { workers: [], ranks: [] };
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
  tierRankVerdict,
  isTieringActive,
  liveWorkerCapabilitySnapshot,
  MIN_LIVE_FOR_TIERING,
  MODEL_STRENGTH,
  EFFORT_STRENGTH,
  EFFORT_SPAN,
  capabilityScore,
  isKnownEffort,
  isKnownModel,
  rankForModelEffort,
  normalizeModel,
  familyFromModelId,
  declaredSeatFamily,
  resolveSeatModel,
  seatCapabilityScore,
  seatRankForModelEffort,
  seatCapabilityIsVerified,
  setUnresolvedCapabilitySink,
  drainUnresolvedCapabilityEvents,
  UNRESOLVED_CAPABILITY_TOKEN,
  WEAKEST_MODEL,
  normalizeEffort,
  deriveLiveLadder,
  deriveWorkerTierRank,
  stampRankForWorker,
  resolveRoutingScore,
  __resetLadderCacheForTests,
};
