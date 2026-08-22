'use strict';
/**
 * dispatch-suggestions.cjs — SD-LEO-INFRA-INTELLIGENT-ROUTING-RANK-001 (FR-1/FR-4).
 *
 * ADVISORY ONLY. This module computes ranked (worker, model, effort) fit suggestions for
 * dispatchable belt items. It NEVER assigns: there is no import of tryClaim/claim_sd/sd-start
 * anywhere in this file, and every function here is pure or a read-only DB query. Enforced
 * structurally by tests/unit/fleet/dispatch-suggestions.test.js (TS-1).
 *
 * SCOPE NOTE — FR-2 was descoped from this module (worker self-claim "pickup intelligence").
 * An earlier iteration wired a shouldDeferForBetterFit primitive into
 * lib/checkin/steps/merged-pool-self-claim.cjs; investigating a real bug it produced surfaced
 * that lib/fleet/tier-backlog.cjs's lowerTierBacklog() + claim-eligibility.cjs's tierAxes
 * 'reserved_no_lower_backlog' branch (SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-E) ALREADY
 * implements this exact concern — an over-qualified worker is blocked from claiming strictly
 * lower-tier work unless that tier has a genuine backlog exceeding idle capacity there. That
 * mechanism is more mature (aggregate backlog-vs-idle-capacity, not a single live-peer
 * comparison) and already shipped; duplicating it produced two real bugs in quick succession.
 * FR-2's chairman intent ("workers decline poor-fit items when better-fit seats are live") is
 * therefore already satisfied — no new code, this is a documentation/verification finding.
 *
 * FIT IS RANK-SPACE, NOT A NEW METRIC (routing-doctrine anti-fork, TR-2). "Fit" here means
 * closeness to an item's min_tier_rank FLOOR among live, eligible workers — computed entirely
 * from lib/fleet/tier-ladder.cjs's EXISTING STATIC rank space (rankForModelEffort), the same
 * space classifyDispatchIneligibility's tier axis and computeMinTierRank's floor are expressed
 * in. No parallel capability-score formula is defined here (no MODEL_STRENGTH/EFFORT_STRENGTH
 * re-declaration) — this module only ever imports ranks, never re-derives them. Registered as a
 * documentation-contract consumer in lib/eval/routing-consumption.mjs's ROUTING_DOCTRINE_CONSUMERS.
 *
 * QUOTA POSTURE (FR-1/FR-3): there is no per-model account mapping anywhere in this codebase
 * (verified by grep at EXEC time — the 3-account registry in lib/fleet/account-usage-reader.cjs is
 * a credential/quota concept, not a model-pinning one). So "lean-Fable" posture is read from the
 * EXISTING chairman-toggled lib/fleet/tier-backlog.cjs fetchFableWindowActive() flag, optionally
 * corroborated by any registered account sitting near its weekly cap — both already-existing reads,
 * no new instrumentation (TR-1/out-of-scope).
 */

const ladder = require('./tier-ladder.cjs');
const { deriveWorkClass } = require('./work-class.cjs');

const { liveWorkerCapabilitySnapshot } = ladder;

/** Weekly usage percentage at/above which an account is treated as "near its cap" for FR-1/FR-3. */
const LEAN_ACCOUNT_WEEKLY_PCT = 90;

/**
 * FR-1 primitive: fit score + WHY breakdown for one (worker, item) candidate pair. Higher score
 * is a better fit. -Infinity marks an ineligible candidate (below the item's floor) so callers
 * can filter it out without a second eligibility check.
 * @param {{ workerRank?: number, minTierRank?: number, workerModel?: string,
 *   quotaPosture?: {leanFable?: boolean}, classFamiliarity?: number }} args
 */
function candidateFitScore({ workerRank, minTierRank, workerModel, quotaPosture, classFamiliarity } = {}) {
  const min = Number.isFinite(Number(minTierRank)) ? Number(minTierRank) : 1;
  const rank = Number(workerRank);
  if (!Number.isFinite(rank) || rank < min) {
    return { score: -Infinity, why: { eligible: false, reason: 'below_min_tier_rank', min_tier_rank: min, worker_rank: Number.isFinite(rank) ? rank : null } };
  }
  const overQualification = rank - min; // 0 = perfect fit; larger = more over-qualified
  const isFableWorker = typeof workerModel === 'string' && /fable/i.test(workerModel);
  const leanFable = !!(quotaPosture && quotaPosture.leanFable === true);
  const quotaPenalty = isFableWorker && leanFable ? 5 : 0;
  const familiarity = Number.isFinite(classFamiliarity) ? classFamiliarity : 0;
  const score = -overQualification - quotaPenalty + familiarity * 0.1;
  return {
    score,
    why: {
      eligible: true,
      min_tier_rank: min,
      worker_rank: rank,
      over_qualification: overQualification,
      lean_fable: leanFable,
      quota_penalty: quotaPenalty,
      class_familiarity: familiarity,
    },
  };
}

/**
 * FR-1: rank every live worker's fit for one dispatchable item, best-fit first.
 * @param {{ item: object, liveWorkers: Array<{session_id,model,effort,rank}>,
 *   quotaPosture?: object, familiarityBySdType?: Record<string, number> }} args
 * @returns {Array<{ session_id: string, model?: string, effort?: string, score: number, why: object }>}
 */
function rankCandidatesForItem({ item, liveWorkers, quotaPosture, familiarityBySdType } = {}) {
  const minTierRank = item && item.metadata && item.metadata.min_tier_rank;
  const familiarity = (familiarityBySdType && item && familiarityBySdType[item.sd_type]) || 0;
  return (Array.isArray(liveWorkers) ? liveWorkers : [])
    .map((w) => {
      const { score, why } = candidateFitScore({
        workerRank: w.rank, minTierRank, workerModel: w.model, quotaPosture, classFamiliarity: familiarity,
      });
      return { session_id: w.session_id, model: w.model, effort: w.effort, score, why };
    })
    .filter((c) => c.score !== -Infinity)
    .sort((a, b) => b.score - a.score);
}

/**
 * Fail-safe defaults so downstream callers always fail OPEN on a fault (never a crashed run,
 * never a dropped item) — see TR-7. When fit resolution throws, the caller falls back to this.
 */
function fitErrorFallback(reason) {
  return { score: 0, why: { eligible: true, quota_or_fit_error: true, reason: String(reason || 'unknown') } };
}

// ---- I/O (async; every function below is a thin, fail-open read) ----------------------------

/**
 * FR-1/FR-3 quota posture: lean-Fable if the chairman-toggled window is off, or any registered
 * account sits at/above LEAN_ACCOUNT_WEEKLY_PCT. Both reads are existing primitives (TR-1: no new
 * quota instrumentation). Fail-open to {leanFable:false} — a quota-read fault must never suppress
 * or distort suggestions/refill, only skip the (optional) weighting.
 * @param {object} sb service-role client
 */
async function fetchQuotaPosture(sb) {
  const reasons = [];
  let leanFable = false;
  try {
    const { fetchFableWindowActive } = require('./tier-backlog.cjs');
    const active = await fetchFableWindowActive(sb);
    if (active !== true) { leanFable = true; reasons.push('fable_window_inactive'); }
  } catch { /* fail-open: no fable-window signal */ }
  try {
    const { getAccountUsage } = require('./account-usage-reader.cjs');
    const accounts = await getAccountUsage();
    for (const a of Array.isArray(accounts) ? accounts : []) {
      if (a && a.state === 'ok' && Number(a.weeklyPct) >= LEAN_ACCOUNT_WEEKLY_PCT) {
        leanFable = true;
        reasons.push(`account_near_cap:${a.name}`);
      }
    }
  } catch { /* fail-open: no account-usage signal */ }
  return { leanFable, reasons };
}

/**
 * FR-1 class-familiarity signal (the corrected, honest version of "worker history affinity" —
 * see PRD note: no persistent per-worker identity exists in claude_sessions across restarts, so
 * this is a FLEET-WIDE completion-rate-by-sd_type signal, not a per-worker one). Normalized to
 * [0,1] against the max count observed. Fail-open to {} (candidateFitScore treats absence as 0).
 * @param {object} sb
 */
async function fetchSdTypeFamiliarity(sb) {
  try {
    const { data, error } = await sb
      .from('strategic_directives_v2')
      .select('sd_type')
      .eq('status', 'completed')
      .limit(1000);
    if (error || !Array.isArray(data)) return {};
    const counts = {};
    for (const row of data) {
      const t = row && row.sd_type;
      if (typeof t === 'string' && t) counts[t] = (counts[t] || 0) + 1;
    }
    const max = Math.max(1, ...Object.values(counts));
    const normalized = {};
    for (const [t, c] of Object.entries(counts)) normalized[t] = c / max;
    return normalized;
  } catch {
    return {};
  }
}

/**
 * FR-1: the dispatchable belt items to suggest for — the SAME v_sd_next_candidates view
 * lib/checkin/steps/merged-pool-self-claim.cjs already treats as the canonical "belt" definition,
 * joined for the fields fit-scoring needs (min_tier_rank, sd_type). Bounded by `limit`.
 * @param {object} sb
 * @param {{ limit?: number }} [opts]
 */
async function fetchDispatchableItems(sb, opts = {}) {
  const limit = Number.isInteger(opts.limit) && opts.limit > 0 ? opts.limit : 50;
  try {
    const { data: cands, error } = await sb
      .from('v_sd_next_candidates')
      .select('sd_id, track, status, priority')
      .limit(limit);
    if (error || !Array.isArray(cands) || cands.length === 0) return [];
    const keys = cands.map((c) => c.sd_id).filter(Boolean);
    if (!keys.length) return [];
    const { data: rows, error: rowsErr } = await sb
      .from('strategic_directives_v2')
      .select('sd_key, sd_type, target_application, title, metadata')
      .in('sd_key', keys);
    if (rowsErr || !Array.isArray(rows)) return [];
    const byKey = new Map(rows.map((r) => [r.sd_key, r]));
    return cands.map((c) => byKey.get(c.sd_id)).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * FR-1/FR-4: write one advisory suggestion row for an item. Reuses session_coordination — the
 * fleet's existing advisory channel (idle-qf-hint's PROPOSE-ONLY pattern) — rather than a new
 * table (TR-1). NEVER writes claim_sd/status columns; this is INFO-only.
 *
 * Routed through the CANONICAL choke point (insertCoordinationRow, lib/coordinator/dispatch.cjs)
 * rather than a raw `.insert()` — required both by the repo's no-raw-session-coordination-insert
 * ESLint rule and by the table's own `subject` NOT NULL + `valid_target` CHECK constraints (a raw
 * insert with only {message_type, payload} violates both; caught live by testing-agent evidence
 * db80264a). target_session uses the 'broadcast' sentinel (lib/coordinator/dispatch.cjs
 * SENTINEL_TARGETS) — this is a fleet-wide advisory, not addressed to one session.
 * @param {object} sb
 * @param {object} item
 * @param {Array<object>} ranked
 * @returns {Promise<string|null>} the written row's id, or null on failure
 */
async function writeSuggestionRow(sb, item, ranked) {
  try {
    const { insertCoordinationRow } = require('../coordinator/dispatch.cjs');
    const res = await insertCoordinationRow(sb, {
      sender_type: 'system',
      target_session: 'broadcast',
      message_type: 'INFO',
      subject: `[DISPATCH_SUGGESTION] ${item.sd_key}`,
      body: `Ranked (worker, model, effort) fit suggestion for ${item.sd_key} — advisory only, never auto-dispatch.`,
      payload: {
        kind: 'dispatch_suggestion',
        sd_key: item.sd_key,
        sd_type: item.sd_type,
        target_application: item.target_application,
        ranked: ranked.map((r) => ({ session_id: r.session_id, model: r.model, effort: r.effort, score: r.score })),
        why: ranked.map((r) => ({ session_id: r.session_id, ...r.why })),
        generated_at: new Date().toISOString(),
      },
    }, { select: 'id', single: true });
    if (!res || res.error) return null;
    return res.data ? res.data.id : null;
  } catch {
    return null;
  }
}

/**
 * FR-1 orchestrator: compute + persist ranked suggestions for up to `limit` dispatchable items.
 * ADVISORY ONLY — no claim/assignment side effect anywhere in this call graph.
 * @param {object} sb
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ items_considered: number, suggestions_written: number, results: Array<object> }>}
 */
async function generateAndPersistSuggestions(sb, opts = {}) {
  const [items, quotaPosture, familiarityBySdType, snapshot] = await Promise.all([
    fetchDispatchableItems(sb, opts),
    fetchQuotaPosture(sb),
    fetchSdTypeFamiliarity(sb),
    liveWorkerCapabilitySnapshot(sb),
  ]);
  const results = [];
  let written = 0;
  for (const item of items) {
    let ranked;
    try {
      ranked = rankCandidatesForItem({ item, liveWorkers: snapshot.workers, quotaPosture, familiarityBySdType });
    } catch (e) {
      // TR-7 fail-open: a fit-resolution fault degrades to an empty ranking for this item, never
      // a crashed run and never a dropped item from `results`.
      ranked = [];
      results.push({ sd_key: item.sd_key, ranked, error: fitErrorFallback(e && e.message) });
      continue;
    }
    const rowId = await writeSuggestionRow(sb, item, ranked);
    if (rowId) written += 1;
    results.push({ sd_key: item.sd_key, ranked, suggestion_row_id: rowId });
  }
  return { items_considered: items.length, suggestions_written: written, results };
}

module.exports = {
  LEAN_ACCOUNT_WEEKLY_PCT,
  candidateFitScore,
  rankCandidatesForItem,
  fitErrorFallback,
  fetchQuotaPosture,
  fetchSdTypeFamiliarity,
  fetchDispatchableItems,
  writeSuggestionRow,
  generateAndPersistSuggestions,
  deriveWorkClass, // re-exported: FR-3's refill reordering reuses this same classifier
};
