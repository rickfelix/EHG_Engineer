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

/** A real Claude session id is a UUID. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A legitimate NON-UUID session id shape produced by lib/session-manager.mjs when no birth-cert
 * UUID is available: `session_<hex8>_<tty>_<pid>`. These are REAL sessions, not fixtures — the
 * "non-UUID" fixture heuristic must not flag them.
 */
const LEGIT_SESSION_SHAPE_RE = /^session_[0-9a-f]{8}_/i;

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
 * Is this session a TEST / FIXTURE / synthetic session (never a genuine fleet worker)?
 * Accepts a session_id string or a claude_sessions row. Returns true when the id carries a
 * fixture marker, OR is a non-UUID id that is NOT the legitimate `session_<hex>_<tty>_<pid>`
 * shape (a bare synthetic id). FAIL-CLOSED toward "not a fixture" on empty/garbage input so a
 * classification quirk never excludes a real worker from capacity/claims.
 *
 * @param {string|{session_id?: string, metadata?: object}} idOrSession
 * @returns {boolean}
 */
export function isFixtureSession(idOrSession) {
  try {
    const id = typeof idOrSession === 'string' ? idOrSession : idOrSession?.session_id;
    if (typeof id !== 'string' || !id) return false; // unknown -> treat as real (never false-exclude)
    if (FIXTURE_SESSION_RE.test(id)) return true;
    // A real id is either a UUID or the legit session_<hex>_<tty>_<pid> shape; anything else is synthetic.
    if (UUID_RE.test(id) || LEGIT_SESSION_SHAPE_RE.test(id)) return false;
    return true;
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
