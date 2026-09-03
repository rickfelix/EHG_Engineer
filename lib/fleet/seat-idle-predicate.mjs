// SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-D / FR-1 — the shared, named-axis, pure idle predicate.
//
// WHY THIS EXISTS. Four independently-written functions decide "is this seat idle?" today, and they
// disagree on live session shapes: scripts/fleet-dashboard.cjs (idleSessions, via
// isDispatchableFleetMember), scripts/adam-quiet-tick.mjs (checkIdleBesideClaimable, via the narrower
// isBuildForbiddenSession — no fixture-session exclusion at all), scripts/lib/capacity-inputs.mjs
// (idleNow, via isLiveCountableWorker), and scripts/coordinator-idle-qf-hint.mjs (eligibleIdleWorkers —
// the richest of the four, already directed-work aware). Two prior SDs attempted broad predicate
// unification on this exact surface: SD-LEO-INFRA-UNIFY-FLEET-LIVENESS-001 was withdrawn mid-LEAD after
// finding that a blind substitution reintroduces a regression a sibling predicate deliberately guards
// against; SD-LEO-INFRA-SIXTEEN-SITE-LIVENESS-001 shipped a census and zero code, concluding wide
// substitution was not warranted. This module follows the shipped pattern instead (QF-20260830-660,
// and the INELIGIBILITY_AXES shape in lib/fleet/claim-eligibility.cjs): a named list of independent,
// pure (session, ctx) => reason|null axes, each with a documented no-op default, so a caller supplying
// no ctx gets a well-defined baseline rather than silently inheriting whichever axis happened to be
// wired first.
//
// THE BASELINE ctx={} PRODUCES, and why it is not an arbitrary choice: the four base identity
// exclusions every existing consumer applies in some form (coordinator-by-id, role=adam, non_fleet,
// quarantined_at, parked_until, fixture-session) PLUS the is_coordinator-FLAG exclusion. That flag
// exclusion is deliberately baked in as ALWAYS-APPLIED, not opt-in, because it closes the exact
// regression this SD's own PLAN-phase review found: isBuildForbiddenSession (today's adam-quiet-tick
// helper) already excludes a stale is_coordinator flag; isDispatchableFleetMember (the fixture-fixing
// helper) does not. Consolidating onto isDispatchableFleetMember alone would silently REGRESS
// adam-quiet-tick into counting stale-coordinator-flagged sessions as idle. So ctx={} equals
// isDispatchableFleetMember's identity check with that one gap closed — stricter on exactly the axis
// where the existing helpers disagree, and identical everywhere else. lib/fleet/genuine-worker.mjs
// documents that the flag is sometimes stored as the JSON STRING 'true', not only the boolean — both
// forms are checked here for the same reason genuine-worker.mjs checks both.
//
// EVERYTHING ELSE IS OPT-IN VIA ctx, DEFAULTING TO NO-OP: status/released exclusion, QF-holder
// exclusion, authoritative-SD-holder exclusion, directed-work (seat-busy) exclusion, recently-released
// exclusion, spin-up grace, and freshness. A caller that supplies none of these gets exactly the
// identity-only answer above; each consumer's migration supplies the axes that reproduce ITS current
// full behaviour, which is the baseline FR-3's frozen-population differential is measured against.

import { isFixtureSession } from './session-predicates.mjs';

/**
 * @typedef {object} SeatIdleContext
 * @property {string} [coordinatorId] - active coordinator's session_id, excluded by id. No-op if absent.
 * @property {Set<string>} [statusExcludeSet] - session.status values that exclude a seat (e.g. released/
 *   completed/terminated/inactive). No-op (empty Set / undefined) means no status is excluded — matches
 *   fleet-dashboard's current "no status guard" behaviour.
 * @property {Set<string>} [qfHolderSessionIds] - session_ids currently holding a quick_fixes claim.
 *   No-op (empty/undefined) means QF holders are NOT excluded from idle — matches today's
 *   adam-quiet-tick and capacity-inputs behaviour, which check no QF axis at all.
 * @property {Set<string>} [sdHolderSessionIds] - session_ids holding the AUTHORITATIVE SD claim
 *   (strategic_directives_v2.claiming_session_id), distinct from the sd_key MIRROR column. No-op means
 *   claim status is not checked here (a caller may already have filtered by claim upstream).
 * @property {Set<string>} [seatBusySessionIds] - session_ids with a live, unexpired directed-work
 *   reservation (session_coordination, kind=seat_busy_reservation). No-op means directed work is not
 *   excluded — matches today's three narrower consumers, all of which are directed-work blind.
 * @property {Set<string>} [recentlyReleasedSessionIds] - session_ids released within the recency window
 *   a given consumer defines (e.g. eligibleIdleWorkers' isRecentlyReleased). No-op means recency is not
 *   applied here.
 * @property {number} [spinUpGraceMs] - a session younger than this (by session.created_at) is excluded
 *   as still spinning up, mirroring eligibleIdleWorkers' SPIN_UP_GRACE_MS. 0/undefined = no grace period.
 * @property {'heartbeat_at'|'last_tool_at'|'heartbeat_age_seconds'} [freshnessField] - which freshness
 *   signal to read. Required together with freshnessWindowMs; omitting either means freshness is NOT
 *   checked here (the caller's own query already filtered on it, or the caller doesn't need it).
 * @property {number} [freshnessWindowMs]
 * @property {number} [nowMs] - injectable clock for freshness/parked_until/spin-up comparisons. Defaults
 *   to Date.now() at call time.
 */

/** Ordered, named axes. First MATCHING axis wins (short-circuits). Each is pure and side-effect free. */
const AXES = [
  {
    reason: 'coordinator-by-id',
    test: (s, ctx) => !!(s.session_id && ctx.coordinatorId && s.session_id === ctx.coordinatorId),
  },
  {
    reason: 'role-adam',
    test: (s) => s.metadata?.role === 'adam',
  },
  {
    reason: 'non-fleet',
    test: (s) => !!s.metadata?.non_fleet,
  },
  {
    // ALWAYS APPLIED, not opt-in — see module header. Both the boolean and the JSON-string-'true'
    // shape are checked; lib/fleet/genuine-worker.mjs documents the string shape as actually occurring.
    reason: 'coordinator-flag',
    test: (s) => s.metadata?.is_coordinator === true || String(s.metadata?.is_coordinator) === 'true',
  },
  {
    reason: 'quarantined',
    test: (s) => !!s.metadata?.quarantined_at,
  },
  {
    reason: 'parked',
    test: (s, ctx) => {
      const until = s.metadata?.parked_until ? Date.parse(s.metadata.parked_until) : NaN;
      return Number.isFinite(until) && until > (ctx.nowMs ?? Date.now());
    },
  },
  {
    reason: 'fixture-session',
    test: (s) => isFixtureSession(s),
  },
  {
    reason: 'status-excluded',
    test: (s, ctx) => !!(ctx.statusExcludeSet && ctx.statusExcludeSet.size && s.status && ctx.statusExcludeSet.has(s.status)),
  },
  {
    reason: 'qf-holder-authoritative',
    test: (s, ctx) => !!(ctx.qfHolderSessionIds && ctx.qfHolderSessionIds.size && s.session_id && ctx.qfHolderSessionIds.has(s.session_id)),
  },
  {
    reason: 'sd-holder-authoritative',
    test: (s, ctx) => !!(ctx.sdHolderSessionIds && ctx.sdHolderSessionIds.size && s.session_id && ctx.sdHolderSessionIds.has(s.session_id)),
  },
  {
    reason: 'directed-work',
    test: (s, ctx) => !!(ctx.seatBusySessionIds && ctx.seatBusySessionIds.size && s.session_id && ctx.seatBusySessionIds.has(s.session_id)),
  },
  {
    reason: 'recently-released',
    test: (s, ctx) => !!(ctx.recentlyReleasedSessionIds && ctx.recentlyReleasedSessionIds.size && s.session_id && ctx.recentlyReleasedSessionIds.has(s.session_id)),
  },
  {
    reason: 'spin-up-grace',
    test: (s, ctx) => {
      if (!ctx.spinUpGraceMs || !s.created_at) return false;
      const createdMs = Date.parse(s.created_at);
      return Number.isFinite(createdMs) && (ctx.nowMs ?? Date.now()) - createdMs < ctx.spinUpGraceMs;
    },
  },
  {
    reason: 'not-fresh',
    test: (s, ctx) => {
      if (!ctx.freshnessField || !ctx.freshnessWindowMs) return false; // no-op: caller filtered upstream
      const raw = s[ctx.freshnessField];
      if (raw == null) return false; // fail toward "fresh" — never hide a worker over a missing field
      const ageMs = ctx.freshnessField === 'heartbeat_age_seconds'
        ? Number(raw) * 1000
        : (ctx.nowMs ?? Date.now()) - Date.parse(raw);
      return Number.isFinite(ageMs) && ageMs >= ctx.freshnessWindowMs;
    },
  },
];

/**
 * Is this seat idle capacity? Fails TOWARD "not idle" on any throw or malformed input — never let a
 * classification quirk hide a claim/reservation and cause a seat to be double-dispatched into. This is
 * the opposite fail direction from isFixtureSession/isDispatchableFleetMember (which fail toward
 * "real"/"member"): idle is the AFFIRMATIVE claim here, so the safe failure is "not idle", matching
 * dispatch-eligibility's own DEFAULT_DENY_MEMBERS discipline (claim-eligibility.cjs) rather than the
 * membership predicates' fail-open discipline.
 *
 * @param {{session_id?:string, status?:string, metadata?:object, created_at?:string, heartbeat_at?:string, last_tool_at?:string, heartbeat_age_seconds?:number}} session
 * @param {SeatIdleContext} [ctx]
 * @returns {{idle: boolean, reason: string|null}}
 */
export function seatIdleVerdict(session, ctx = {}) {
  try {
    if (!session || typeof session !== 'object') return { idle: false, reason: 'invalid-session' };
    for (const axis of AXES) {
      if (axis.test(session, ctx)) return { idle: false, reason: axis.reason };
    }
    return { idle: true, reason: null };
  } catch {
    return { idle: false, reason: 'error-fail-closed' };
  }
}

/** Convenience boolean wrapper for call sites that only need the verdict, not the reason. */
export function isSeatIdle(session, ctx = {}) {
  return seatIdleVerdict(session, ctx).idle;
}

/** Exported for the FR-3 differential harness and for tests that need to name a specific axis. */
export const IDLE_AXIS_NAMES = AXES.map((a) => a.reason);
