/**
 * Worker-engagement ratio gauge — SD-FDBK-FIX-WORKER-ENGAGEMENT-RATIO-001.
 *
 * Chairman commission (verbatim, terminal ~17:3xZ): "how many active workers we have versus
 * the total number of workers... supply versus demand." Active = holds a claim / working now;
 * complement = idle-waiting. Joint coordinator+Solomon spec: four buckets — ENGAGED (incl.
 * cross-repo claimants), TAIL (released <= grace window, post-completion), IDLE (live +
 * dispatchable + no claim), ZOMBIE (heartbeat fresh but last_tool_at stale past the calibrated
 * cut point — its own named bucket, never folded into IDLE).
 *
 * STANDALONE MODULE, DELIBERATELY (FR-7). Colocating this inside capacity-inputs.mjs or an
 * unexported forecaster function leaves it with no real test seam in this repo (no working
 * ESM-monkey-patch pattern exists here, and coordinator-capacity-forecast.mjs's main() is
 * deliberately unexported). This file is imported independently by both integration points —
 * scripts/lib/capacity-inputs.mjs (forecaster side) and scripts/adam-coordinator-health.mjs
 * (KPI-1 side) — so both count the SAME base population via the SAME predicate (TR-1).
 *
 * SINGLE DEDICATED BASE POPULATION (TR-1), NOT EITHER EXISTING WRAPPER. PLAN-phase sub-agent
 * review measured a 29% live population-count disagreement between routing ENGAGED/IDLE through
 * isLiveCountableWorker/isDispatchableFleetMember and routing ZOMBIE through
 * liveFleetWorkers/isFleetWorker: isFleetWorker's everClaimed gate structurally excludes
 * released-claim workers (starves TAIL), and isDispatchableFleetMember's quarantine/park
 * exclusion structurally excludes wedged workers (starves ZOMBIE — a confirmed wedge IS a
 * ZOMBIE). isEngagementBasePopulationMember() below reuses the exclusion logic common to BOTH
 * existing predicates (role/non_fleet/is_coordinator/fixture) while dropping both narrowing
 * gates. Neither lib/fleet/genuine-worker.mjs nor lib/fleet/session-predicates.mjs is modified
 * by this SD (TR-2) — this is a NEW, separate predicate.
 */

'use strict';

import { createRequire } from 'module';
import { isFixtureSession } from '../../lib/fleet/session-predicates.mjs';

// Lazy + memoised CJS interop, mirroring lib/fleet/genuine-worker.mjs's own pattern for the
// same underlying module — a top-level require would defeat fail-open on a load failure.
let _stuckSeat;
const loadStuckSeat = () => (_stuckSeat ??= createRequire(import.meta.url)('../../lib/fleet/stuck-seat-predicate.cjs'));
let _detectors;
const loadDetectors = () => (_detectors ??= createRequire(import.meta.url)('../../lib/coordinator/detectors.cjs'));

/** The extent label for this classifier's base population (mirrors capacity-inputs.mjs's beltExtent precedent). */
export const ENGAGEMENT_POPULATION_EXTENT = 'engagement-base';

/**
 * The heartbeat-liveness window this classifier applies UNIFORMLY, regardless of what recency
 * window (if any) the caller's own host query happened to apply for its own purposes.
 *
 * TR-1 CORRECTION (SD-FDBK-FIX-WORKER-ENGAGEMENT-RATIO-001, EXEC-phase TESTING review, DEF-2):
 * a shared EXCLUSION predicate alone does not guarantee a shared POPULATION — the forecaster's
 * session read applies a 5-minute heartbeat cutoff (capacity-inputs.mjs HEARTBEAT_LIVE_MS) while
 * KPI-1's read applies none at all (select('*').order(heartbeat_at desc).limit(1000), unbounded
 * age). Measured: a 31-row fixture spanning 0-580min of heartbeat age produced forecaster
 * population=1 vs KPI-1 population=30 — the exact disagreement TR-1 exists to close, relocated
 * from the predicate layer to the query layer. Fixed by applying ONE liveness window HERE, inside
 * the classifier itself, so the result is identical no matter how stale a row either caller's own
 * query happens to hand it. 15 minutes matches lib/fleet/genuine-worker.mjs's liveFleetWorkers
 * default windowMs — the established fleet-wide "is this session live" convention — rather than
 * either host query's own narrower/absent window.
 */
export const ENGAGEMENT_LIVE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Rollout flag (FR-6). Defaults ON (unlike LEO_MASKED_STALL_DETECT, which defaults OFF) — the
 * gauge is additive/observational, not an escalation trigger, so it ships live from merge with
 * this flag as the rollback lever, not an opt-in gate. Defensively wrapped (DEF-5, uniformity
 * audit): a process.env read essentially never throws, but every other predicate in this file
 * fails toward a safe default on error, and this one should too rather than being the exception.
 */
export function engagementGaugeOn() {
  try {
    const v = process.env.ENGAGEMENT_GAUGE_ENABLED;
    return v !== 'false' && v !== '0';
  } catch {
    return true; // fail toward the documented default
  }
}

/**
 * Identity/role-level base-population membership for the engagement gauge (FR-1/TR-1).
 *
 * Reuses the role/non_fleet/is_coordinator/fixture exclusion logic common to isFleetWorker
 * (lib/fleet/genuine-worker.mjs) and isDispatchableFleetMember (lib/fleet/session-predicates.mjs)
 * — deliberately WITHOUT isFleetWorker's everClaimed requirement and WITHOUT
 * isDispatchableFleetMember's quarantined_at/parked_until exclusion, both of which starve a
 * bucket this gauge needs to report. FAILS toward "member" on garbage input, matching the
 * fail-open convention of both source predicates — a quirk must never hide a real worker from
 * the census.
 *
 * @param {object} session - claude_sessions row (session_id, metadata, status)
 * @param {string} coordinatorId - the active coordinator's session_id (excluded)
 * @returns {boolean}
 */
export function isEngagementBasePopulationMember(session, coordinatorId) {
  try {
    if (!session || typeof session !== 'object') return false;
    if (session.session_id && coordinatorId && session.session_id === coordinatorId) return false;
    if (session.metadata?.role === 'adam') return false;
    if (session.metadata?.is_coordinator === true) return false;
    if (String(session.metadata?.is_coordinator) === 'true') return false; // stored as JSON string in some rows
    if (session.metadata?.non_fleet) return false;
    if (isFixtureSession(session)) return false;
    return true;
  } catch {
    return true; // fail toward "member" — never hide a real worker from the census
  }
}

/**
 * Classify one session into ENGAGED / TAIL / ZOMBIE / IDLE / UNKNOWN / EXCLUDED.
 * Precedence: ENGAGED > TAIL > ZOMBIE > IDLE (mutually exclusive by construction). EXCLUDED means
 * "not part of the base population at all" (heartbeat too stale AND not a confirmed wedge) — the
 * caller must drop these from both the bucket counts and the population total.
 *
 * NULL/missing last_tool_at yields UNKNOWN, never ZOMBIE (FR-2) — the pipeline cannot
 * distinguish "genuinely dead" from "this select never fetched the column" without it.
 *
 * HEARTBEAT-LIVENESS IS CHECKED FIRST, AHEAD OF isClaimed (deep-tier ship-review finding,
 * round 4). The original ordering let ENGAGED short-circuit on isClaimed alone, so a session
 * that crashed without ever releasing its claim (sd_key still set, heartbeat dead for days)
 * classified as "actively engaged" forever — the module's own spec says ENGAGED means "holds a
 * claim / working now," but only the "holds a claim" half was ever checked. A claimed-but-dead
 * session now falls through to the same not-live branch as everything else: EXCLUDED, unless
 * isKnownWedged confirms it, in which case ZOMBIE — which is the more actionable classification
 * for an orphaned claim anyway (an operator needs to know it's dead, not that it's "engaged").
 * A live, currently-claimed session is unaffected: isLive is checked once and both paths (claimed
 * or not) share it, so cross-repo claimants (fresh heartbeat, 0 local commits) still read ENGAGED.
 *
 * The not-live branch keeps its own DEF-2-round-2 exemption: a blanket heartbeat cutoff ahead of
 * bucket classification silently dropped hard-wedged sessions (heartbeat itself gone stale, not
 * just tool-silent) from the census entirely — exactly the class of starvation FR-1 was written
 * to eliminate. isKnownWedged has its OWN staleness authority (last_tool_at + loop_state),
 * independent of heartbeat_at, and is the correct arbiter for "is this session dead."
 *
 * @param {object} session
 * @param {(session: object) => boolean} isClaimed - injected claim signal (TR-3: each caller
 *   supplies its own — the forecaster's claimsBySession union, KPI-1's !!s.sd_key — this
 *   function never re-derives a claim mechanism itself)
 * @param {number} nowMs
 * @param {number} [cutMinutes] - forwarded to isKnownWedged; omit to use its own calibrated default
 * @param {number} [graceMs] - forwarded to the TAIL window; omit to use detectors.cjs's shipped default
 * @param {number} [liveWindowMs] - forwarded to the heartbeat-liveness check; omit for ENGAGEMENT_LIVE_WINDOW_MS
 * @returns {'ENGAGED'|'TAIL'|'ZOMBIE'|'IDLE'|'UNKNOWN'|'EXCLUDED'}
 */
export function classifySessionBucket(session, { isClaimed, nowMs = Date.now(), cutMinutes, graceMs, liveWindowMs = ENGAGEMENT_LIVE_WINDOW_MS } = {}) {
  try {
    // isKnownWedged pairs the last_tool_at cut-point check with loop_state (genuine-worker.mjs) —
    // raw classifySeat() alone ignores loop_state and misclassifies most legitimately-parked
    // 'awaiting_tick' sessions as ZOMBIE (FR-2). Computed once, used both as the EXCLUDED-vs-ZOMBIE
    // exemption below and as the live-path ZOMBIE check.
    const isKnownWedged = _isKnownWedged;
    const wedged = session.last_tool_at != null && isKnownWedged(session, nowMs, cutMinutes);

    const hbMs = session.heartbeat_at ? Date.parse(session.heartbeat_at) : NaN;
    const isLive = Number.isFinite(hbMs) && nowMs - hbMs < liveWindowMs;

    if (!isLive) return wedged ? 'ZOMBIE' : 'EXCLUDED';

    // From here, isLive === true — ENGAGED and TAIL both require a live session underneath them.
    if (isClaimed && isClaimed(session)) return 'ENGAGED';

    const { isCompletionRelease, DEFAULT_COMPLETION_GRACE_MS } = loadDetectors();
    const effectiveGraceMs = graceMs ?? DEFAULT_COMPLETION_GRACE_MS;
    if (isCompletionRelease(session.released_reason)) {
      const releasedAtMs = session.released_at ? Date.parse(session.released_at) : NaN;
      if (Number.isFinite(releasedAtMs) && nowMs - releasedAtMs <= effectiveGraceMs) return 'TAIL';
    }

    if (session.last_tool_at == null) return 'UNKNOWN';
    if (wedged) return 'ZOMBIE';
    return 'IDLE';
  } catch {
    return 'UNKNOWN'; // per-session fail-soft — one malformed row must never abort the batch
  }
}

// isKnownWedged is genuinely ESM (lib/fleet/genuine-worker.mjs), unlike stuck-seat-predicate.cjs
// and detectors.cjs above — no CJS interop shim is needed, so this is a plain static import
// rather than the lazy createRequire pattern those two use. (A wrapper function here would NOT
// defer resolution the way the CJS lazy-loaders do — static imports are hoisted and resolved
// before any module code runs, regardless of where in the file, or behind what function, the
// binding is referenced. Fail-soft for THIS dependency comes from the try/catch in
// classifySessionBucket, not from import timing.)
import { isKnownWedged as _isKnownWedged } from '../../lib/fleet/genuine-worker.mjs';

/**
 * Classify a full session set into bucket counts (FR-1). Filters to the base population first
 * (isEngagementBasePopulationMember), then buckets every member exactly once.
 *
 * NEVER THROWS (FR-4/FR-5) — on catastrophic failure (e.g. sessions is not iterable) returns an
 * unmeasured result rather than propagating, so a defect here can never block the caller's other,
 * load-bearing fields from persisting. Per-session failures are already caught inside
 * classifySessionBucket and degrade to UNKNOWN individually.
 *
 * @param {Array<object>} sessions - RAW session rows (not pre-filtered by any other predicate)
 * @param {object} opts
 * @param {string} opts.coordinatorId
 * @param {(session: object) => boolean} opts.isClaimed - injected claim signal (TR-3)
 * @param {number} [opts.now]
 * @param {number} [opts.cutMinutes]
 * @param {number} [opts.graceMs]
 * @returns {{engaged:number, tail:number, zombie:number, idle:number, unknown:number, population:number, populationExtent:string, unmeasured?:true, labels?:Array<{session_id:string, bucket:string}>}}
 */
export function classifyEngagementBuckets(sessions, opts = {}) {
  try {
    const {
      coordinatorId, isClaimed, now = Date.now(), cutMinutes, graceMs, includeLabels = false,
      liveWindowMs = ENGAGEMENT_LIVE_WINDOW_MS,
    } = opts;
    // Identity-level filtering only (role/non_fleet/is_coordinator/fixture) — liveness is decided
    // per-session INSIDE classifySessionBucket (DEF-2 round 2), which exempts confirmed wedges
    // from the heartbeat gate. A single pre-filter here would drop them before that exemption
    // could ever run.
    const candidates = (sessions || []).filter((s) => isEngagementBasePopulationMember(s, coordinatorId));
    const counts = { engaged: 0, tail: 0, zombie: 0, idle: 0, unknown: 0 };
    const labels = includeLabels ? [] : undefined;
    let population = 0;
    for (const s of candidates) {
      const bucket = classifySessionBucket(s, { isClaimed, nowMs: now, cutMinutes, graceMs, liveWindowMs });
      if (bucket === 'EXCLUDED') continue; // not part of the census at all — not even UNKNOWN
      population++;
      counts[bucket.toLowerCase()] += 1;
      if (labels) labels.push({ session_id: s.session_id, bucket });
    }
    return {
      ...counts,
      population,
      populationExtent: ENGAGEMENT_POPULATION_EXTENT,
      ...(labels ? { labels } : {}),
    };
  } catch (error) {
    return {
      engaged: 0, tail: 0, zombie: 0, idle: 0, unknown: 0,
      population: 0, populationExtent: ENGAGEMENT_POPULATION_EXTENT,
      unmeasured: true, error: error?.message || String(error),
    };
  }
}
