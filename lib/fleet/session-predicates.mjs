// SD-FDBK-INFRA-SHARED-FLEET-WORKER-001 — ONE shared session-level classification predicate
// consumed by every capacity / ranking / sweep path, so they never disagree on "is this a real
// fleet worker" vs "is this a test/fixture/non_fleet session".
//
// Mirrors the isCalibrationEligibleVenture canonical-predicate precedent: divergent ad-hoc
// inline checks caused four verified-live bugs (capacity pollution from adam/non_fleet sessions,
// a fixture id restored onto a real SD by the sweep, *-probe-*/QF-TEST- fixtures consuming
// callsigns, a started SD ranked #1). This module is the single source of truth.
//
// isFleetWorker / liveFleetWorkers / everClaimed are RE-EXPORTED verbatim from the existing SoT
// (lib/fleet/genuine-worker.mjs, SD-FDBK-FIX-COORDINATOR-AUDIT-MJS-001); isFixtureSession is new.

import { everClaimed, isFleetWorker, liveFleetWorkers } from './genuine-worker.mjs';
export { everClaimed, isFleetWorker, liveFleetWorkers };

/**
 * Known fixture / test / probe session-id markers. Covers the witnessed offenders:
 *   - the legacy ghost prefixes (drain_test_ / test_execute_ / test-session- / test_session_),
 *   - test-switch-claim-guards-session (the sweep CLAIM_FIX victim, fd018627),
 *   - qf-route-probe-A/B and any *-probe-* (assign-fleet-identities miss, 7b59dac8),
 *   - QF-TEST-* work/session ids.
 * Anchored or boundary-delimited so a real id containing "test" as a substring of a word
 * (e.g. a UUID, or "latest") is not falsely flagged.
 */
const FIXTURE_SESSION_RE = new RegExp(
  [
    '^drain_test_', '^test_execute_', '^test-session-', '^test_session_',
    '^test-',                 // test-switch-claim-guards-session, test-* fixtures
    '(^|[-_])probe([-_]|$)',  // *-probe-* (qf-route-probe-A)
    '^qf-?test',              // QF-TEST-* / qftest-*
    '(^|[-_])fixture([-_]|$)',
  ].join('|'),
  'i',
);

/**
 * Is this session a TEST / FIXTURE session (never a genuine fleet worker)? Accepts a session_id
 * string or a claude_sessions row. Returns true ONLY when the id carries an EXPLICIT fixture marker
 * (FIXTURE_SESSION_RE).
 *
 * An unknown / non-UUID id shape is NOT treated as a fixture. An earlier "synthetic catch-all"
 * branch (return true for any id that was neither a UUID nor `session_<hex8>_…`) over-released
 * GENUINE claim-holding workers in the sweep CLAIM_FIX path: the codebase mints many legitimate
 * non-UUID worker/session ids (session_<epoch>, session_<epoch>_<pid>, leo-assist-<epoch>,
 * coordinator-<uuid>, qf-<n>-<epoch>, bare ids) — verified live across all five callsigns
 * (adversarial review, SD-FDBK-INFRA-SHARED-FLEET-WORKER-001). FAIL TOWARD "not a fixture" on every
 * unknown/empty/garbage input so a classification quirk never excludes or releases a real worker.
 *
 * @param {string|{session_id?: string, metadata?: object}} idOrSession
 * @returns {boolean}
 */
export function isFixtureSession(idOrSession) {
  try {
    const id = typeof idOrSession === 'string' ? idOrSession : idOrSession?.session_id;
    if (typeof id !== 'string' || !id) return false; // unknown -> treat as real (never false-exclude)
    return FIXTURE_SESSION_RE.test(id);              // POSITIVE markers ONLY — no synthetic catch-all
  } catch {
    return false; // fail toward "real" — never let a quirk drop a genuine worker
  }
}

/**
 * Convenience: a session is a dispatchable/capacity-countable genuine worker only if it is a
 * fleet worker AND not a fixture. (isFleetWorker already excludes coordinator/adam/non_fleet and
 * requires everClaimed; this layers the fixture-id guard for the sweep/ranking paths.)
 * @param {object} session - claude_sessions row
 * @param {string} coordinatorId
 */
export function isGenuineCountableWorker(session, coordinatorId) {
  return !isFixtureSession(session) && isFleetWorker(session, coordinatorId);
}

/**
 * Identity/role-level fleet membership: is this session a dispatchable fleet MEMBER — i.e.
 * NOT the coordinator, NOT adam (metadata.role==='adam'), NOT non_fleet, NOT a fixture id?
 *
 * Unlike isFleetWorker / isGenuineCountableWorker this deliberately does NOT require everClaimed
 * or an active/idle status. A genuine worker that just FINISHED an SD is released with sd_key AND
 * claimed_at nulled (lib/session-manager.mjs releaseSD), and v_active_sessions exposes neither
 * worktree_path nor continuous_sds_completed — so everClaimed would read false and wrongly drop
 * the very workers that are most "idle and available". A freshly-spawned worker likewise has not
 * claimed yet. Use THIS predicate for the idle / available-capacity panel where the only thing to
 * exclude is the role/identity polluters (the witnessed bug 623eb17d: adam/non_fleet counted as
 * idle workers). FAILS toward "member" on garbage so a quirk never hides a real idle worker.
 *
 * @param {object} session - claude_sessions / v_active_sessions row (reads session_id, metadata)
 * @param {string} coordinatorId - the active coordinator's session_id (excluded)
 * @returns {boolean}
 */
export function isDispatchableFleetMember(session, coordinatorId) {
  try {
    if (!session || typeof session !== 'object') return false;
    if (session.session_id && coordinatorId && session.session_id === coordinatorId) return false;
    if (session.metadata?.role === 'adam') return false;
    if (session.metadata?.non_fleet) return false;
    // QF-20260705-436: a coordinator-quarantined WEDGE session (PID alive + heartbeat fresh
    // but conversationally dead — zero tool calls/acks for hours) must never count as
    // dispatchable idle capacity. The charter-audit's DUTY-3 remediation would otherwise
    // demand a WORK_ASSIGNMENT into a window nobody reads (live specimen 7bd4e96b,
    // 2026-07-05) — a violation that can only clear via the exact wrong-action. The
    // coordinator stamps metadata.quarantined_at on confirmed wedges; clearing the key
    // restores the session to capacity. Applied HERE (the SSOT predicate) so the audit,
    // capacity forecaster, dashboard and rollcall all agree.
    if (session.metadata?.quarantined_at) return false;
    if (isFixtureSession(session)) return false;
    return true;
  } catch {
    return true; // fail toward "member" — never hide a real idle worker from capacity math
  }
}
