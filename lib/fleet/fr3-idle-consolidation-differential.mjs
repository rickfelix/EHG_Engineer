/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-D FR-3: frozen-population differential harness.
 *
 * Compares each of the four idle consumers' PRE-migration decision (the predicate the consumer
 * called before this SD) against its REAL, live POST-migration decision (the actual exported
 * function each consumer calls today), on a frozen population of session fixtures, and checks
 * every observed change against an explicit PER-CONSUMER x PER-REASON MATRIX.
 *
 * PRE-migration functions are, wherever possible, the REAL still-live functions the migration
 * stopped calling (isLiveCountableWorker, isDispatchableFleetMember, isBuildForbiddenSession,
 * liveFleetWorkers, isRecentlyReleased) -- none of these were deleted, so this is not a
 * reimplementation. The ONE exception is coordinator-idle-qf-hint.mjs's eligibleIdleWorkers,
 * whose internal body WAS overwritten by the FR-1 migration (its public signature and every
 * exclusion reason were preserved, only the mechanism moved to seatIdleVerdict) -- for that one
 * consumer only, `oldEligibleIdleWorkersBody` below is a VERBATIM copy of the function body as it
 * stood at commit fea73d942fe^ (the parent of the first seat-idle-predicate.mjs commit, i.e. the
 * last commit before this SD touched this file), cited so it can be re-diffed against
 * `git show fea73d942fe^:scripts/coordinator-idle-qf-hint.mjs` at any time.
 *
 * QUERY-LAYER (SQL) portions: none of the four consumers' query-layer filters changed in this SD
 * (only the JS-side identity/status predicate did), so each consumer's query-layer condition is
 * reproduced here as an equivalent JS predicate applied identically on BOTH the pre and post side
 * -- correct for proving "did the JS-layer migration change anything", and per FR-3 AC#2 this is
 * what makes the harness able to see whether an axis crossed the query/JS boundary (it did not,
 * for any of the four, in this SD).
 */
import { createRequire } from 'module';
import { seatIdleVerdict } from './seat-idle-predicate.mjs';
import { isDispatchableFleetMember } from './session-predicates.mjs';
import { liveFleetWorkers, isRecentlyReleased } from './genuine-worker.mjs';
import { isLiveCountableWorker } from '../../scripts/lib/live-countable-worker.mjs';
import { isCapacityForecastWorker } from '../../scripts/lib/capacity-inputs.mjs';
import { eligibleIdleWorkers, SPIN_UP_GRACE_MS } from '../../scripts/coordinator-idle-qf-hint.mjs';
import { idleBesideClaimableCount } from '../../scripts/adam-quiet-tick.mjs';

const require = createRequire(import.meta.url);
const { isBuildForbiddenSession } = require('../claim/build-forbidden-session.cjs');
const { isDashboardIdleCandidate } = require('../../scripts/fleet-dashboard.cjs');

const COORDINATOR_ID = 'coord-session-fixed-0000';
const NOW_MS = Date.parse('2026-09-04T00:00:00.000Z');
const FRESH = new Date(NOW_MS - 30_000).toISOString();               // 30s ago -- fresh by any window
const DEAD_THRESHOLD_SECONDS = 900;                                    // fleet-dashboard's DEAD_THRESHOLD
const CAPACITY_HEARTBEAT_LIVE_MS = 5 * 60 * 1000;                      // capacity-inputs.HEARTBEAT_LIVE_MS

// ── OLD eligibleIdleWorkers body, verbatim from fea73d942fe^ (cite this sha to re-diff) ──
function oldEligibleIdleWorkersBody(liveWorkers, nowMs, qfHolderSessionIds = new Set(), seatBusySessionIds = new Set(), sdHolderSessionIds = null) {
  return (liveWorkers || []).filter((w) => {
    if (sdHolderSessionIds ? sdHolderSessionIds.has(w.session_id) : !!w.sd_key) return false;
    if (qfHolderSessionIds.has(w.session_id)) return false;
    if (seatBusySessionIds.has(w.session_id)) return false;
    if (isRecentlyReleased(w, nowMs)) return false;
    const createdAt = w.created_at ? Date.parse(w.created_at) : NaN;
    return Number.isFinite(createdAt) && (nowMs - createdAt) >= SPIN_UP_GRACE_MS;
  });
}

// ── per-consumer PRE / POST verdict functions, each composing that consumer's OWN query-layer
//    condition (unchanged by this SD) with its identity/status predicate (pre vs post) ──

function coordQfHintPre(s) {
  const live = liveFleetWorkers([s], COORDINATOR_ID, NOW_MS);
  if (live.length !== 1) return false;
  return oldEligibleIdleWorkersBody(live, NOW_MS, FIXTURE_QF_HOLDERS, FIXTURE_SEAT_BUSY, null).length === 1;
}
function coordQfHintPost(s) {
  const live = liveFleetWorkers([s], COORDINATOR_ID, NOW_MS);
  if (live.length !== 1) return false;
  return eligibleIdleWorkers(live, NOW_MS, FIXTURE_QF_HOLDERS, FIXTURE_SEAT_BUSY, null).length === 1;
}

// NOTE: capacity-inputs' pre/post functions measure WORKER MEMBERSHIP (is this session a
// countable worker at all), not the final idle-vs-busy verdict -- gatherCapacityInputs computes
// idle/busy as a SEPARATE stage via a claimsBySession lookup this harness does not model (see
// scripts/lib/capacity-inputs.mjs's own comment on why that split cannot be a single predicate).
// A session with sd_key set therefore reads `true` (member) on BOTH sides here, which is the
// correct "unaffected" reading for the negative control (identical before/after), not a claim
// that capacity-inputs counts it idle.
function capacityInputsQueryLayerOk(s) {
  if (!s.heartbeat_at) return false;
  return NOW_MS - Date.parse(s.heartbeat_at) < CAPACITY_HEARTBEAT_LIVE_MS;
}
function capacityInputsPre(s) {
  return capacityInputsQueryLayerOk(s) && isLiveCountableWorker(s, COORDINATOR_ID);
}
function capacityInputsPost(s) {
  return capacityInputsQueryLayerOk(s) && isCapacityForecastWorker(s, { coordinatorId: COORDINATOR_ID, nowMs: NOW_MS });
}

function dashboardPre(s) {
  // Verbatim pre-migration composition (the ORIGINAL idleSessions filter, before this SD):
  // !s.sd_key && !s.qf_id && heartbeat_age_seconds<DEAD_THRESHOLD && isDispatchableFleetMember(...).
  return !s.sd_key && !s.qf_id && s.heartbeat_age_seconds < DEAD_THRESHOLD_SECONDS && isDispatchableFleetMember(s, COORDINATOR_ID, NOW_MS);
}
function dashboardPost(s) {
  return isDashboardIdleCandidate(s, { coordinatorId: COORDINATOR_ID, deadThresholdSeconds: DEAD_THRESHOLD_SECONDS }, seatIdleVerdict);
}

function adamQueryLayerOk(s) {
  if (s.sd_key != null) return false; // .is('sd_key', null)
  if (!['active', 'idle'].includes(s.status)) return false; // .in('status', [...])
  if (!s.last_tool_at) return false;
  return NOW_MS - Date.parse(s.last_tool_at) < 15 * 60 * 1000; // .gte('last_tool_at', cutoff)
}
function adamPre(s) {
  return adamQueryLayerOk(s) && !isBuildForbiddenSession(s.metadata) && !s.released_at;
}
function adamPost(s) {
  return adamQueryLayerOk(s) && idleBesideClaimableCount([s], {
    nowMs: NOW_MS,
    qfHolderSessionIds: FIXTURE_QF_HOLDERS,
    seatBusySessionIds: FIXTURE_SEAT_BUSY,
    spinUpGraceMs: SPIN_UP_GRACE_MS,
  }) === 1;
}

// Sets a session's own reason-fixtures resolve into, so pre/post can see the SAME authoritative
// membership a real ctx-population query would have returned for that fixture.
const FIXTURE_QF_HOLDERS = new Set(['qf-holder-1']);
const FIXTURE_SEAT_BUSY = new Set(['directed-work-1']);

export const CONSUMERS = ['coordinator-idle-qf-hint', 'capacity-inputs', 'fleet-dashboard', 'adam-quiet-tick'];

const VERDICT_FNS = {
  'coordinator-idle-qf-hint': { pre: coordQfHintPre, post: coordQfHintPost },
  'capacity-inputs': { pre: capacityInputsPre, post: capacityInputsPost },
  'fleet-dashboard': { pre: dashboardPre, post: dashboardPost },
  'adam-quiet-tick': { pre: adamPre, post: adamPost },
};

// ── frozen population ──
// Every fixture is `active`/`idle` status, fresh on every timestamp field each consumer's
// query-layer checks, and carries no OTHER exclusion reason unless the scenario needs two
// (documented inline). session_id is the FIXTURE_* set membership key for qf-holder/directed-work.
const base = (over = {}) => ({
  session_id: 's-base',
  status: 'active',
  metadata: {},
  heartbeat_at: FRESH,
  heartbeat_age_seconds: 30,
  last_tool_at: FRESH,
  created_at: new Date(NOW_MS - 60 * 60 * 1000).toISOString(), // 1h old -- past any spin-up grace
  // everClaimed(s) (lib/fleet/genuine-worker.mjs) requires SOME past-claim marker for isFleetWorker
  // (hence liveFleetWorkers, hence coordinator-idle-qf-hint) to count a session as a fleet worker
  // at all -- a genuinely idle worker in production has one from a prior claim. Without this, every
  // fixture would short-circuit out of coordinator-idle-qf-hint's `live` set for the WRONG reason
  // (never-claimed) before ever reaching the axis under test.
  claimed_at: new Date(NOW_MS - 2 * 60 * 60 * 1000).toISOString(),
  sd_key: null,
  qf_id: null,
  released_at: null,
  ...over,
});

export const FROZEN_POPULATION = [
  {
    id: 'negative-control-healthy-mid-claim',
    reason: 'negative-control',
    session: base({ session_id: 'healthy-mid-claim', sd_key: 'SD-SOME-001' }),
  },
  {
    id: 'fixture-session',
    reason: 'fixture-session',
    session: base({ session_id: 'test-session-nswcf-fenced' }),
  },
  {
    id: 'qf-holder-authoritative',
    reason: 'qf-holder-authoritative',
    // Carries BOTH signals a QF holder can present: session_id membership in the resolved
    // qfHolderSessionIds Set (what coordinator-idle-qf-hint/adam-quiet-tick check) AND a
    // populated qf_id column (what fleet-dashboard's view-joined inline !s.qf_id check reads) --
    // the same real-world fact, represented two different ways by two different consumers.
    session: base({ session_id: 'qf-holder-1', qf_id: 'QF-20260903-001' }),
  },
  {
    id: 'directed-work',
    reason: 'directed-work',
    session: base({ session_id: 'directed-work-1' }),
  },
  {
    id: 'spin-up-grace',
    reason: 'spin-up-grace',
    session: base({ session_id: 'freshly-spun-up-1', created_at: new Date(NOW_MS - 30_000).toISOString() }),
  },
  {
    id: 'stale-sd-key-mirror-completed',
    reason: 'stale-sd_key-mirror',
    // sd_key names a completed SD (mirror never cleared); no authoritative sd-holder Set is
    // resolved by any of these 4 consumers' migrations in this SD (fleet-dashboard passes
    // sdHolderSessionIds:null, which is the SAME as pre-migration !!s.sd_key -- so this fixture
    // is a MUST-NOT-CHANGE control, not a must-change one; see the matrix below).
    session: base({ session_id: 'stale-mirror-1', sd_key: 'SD-COMPLETED-999' }),
  },
  {
    id: 'released-shell-recent',
    reason: 'released-shell',
    session: base({ session_id: 'released-shell-1', released_at: new Date(NOW_MS - 5 * 60 * 1000).toISOString() }),
  },
  // EXEC-phase TESTING review (sub_agent_execution_results cf105d66-1f03-4e93-9389-ce22df2f581a):
  // stale-is-coordinator was ORIGINALLY excluded from this population as "not one of FR-3's six
  // named reasons, already covered by TS-2." TESTING measured directly and found that exclusion
  // hid the SD's own headline fix: fleet-dashboard flips pre=true (wrongly idle) -> post=false on
  // BOTH shapes (isDispatchableFleetMember never checked is_coordinator at all), and adam-quiet-tick
  // flips on the STRING shape specifically (isBuildForbiddenSession's `=== true` check is boolean-only,
  // per TS-2's own note). TS-2's coverage against the raw predicate is real but does not prove the
  // migration through each CONSUMER's own call path -- that is what this matrix-graded population is
  // for. Two reasons (not one) because the bool/string shapes genuinely diverge per consumer (see
  // the matrix below) -- a single 'stale-is-coordinator' reason could not express that divergence.
  {
    id: 'stale-is-coordinator-bool',
    reason: 'stale-is-coordinator-bool',
    session: base({ session_id: 'stale-coord-bool-1', metadata: { is_coordinator: true } }),
  },
  {
    id: 'stale-is-coordinator-string',
    reason: 'stale-is-coordinator-string',
    session: base({ session_id: 'stale-coord-string-1', metadata: { is_coordinator: 'true' } }),
  },
];

/**
 * PER-CONSUMER x PER-REASON MATRIX: `true` means this SD's actual migration changed this
 * consumer's verdict for fixtures of this reason; `false`/absent means it did not (either the
 * consumer already handled it correctly before migration, or this SD deliberately did not wire
 * that axis into that consumer -- see the cell-level comments in the code above for which).
 * Verified against the real pre/post functions above, not asserted from the PRD's PLAN-phase
 * analysis (which described a hypothetical fuller unification this SD did not fully carry out --
 * see the deliberate-scope comments in adam-quiet-tick.mjs / capacity-inputs.mjs).
 */
export const MATRIX = {
  // coordinator-idle-qf-hint: is_coordinator (both shapes) is UNCHANGED -- liveFleetWorkers's
  // isFleetWorker already excludes both `=== true` and String(...) === 'true' shapes, and this
  // SD did not touch liveFleetWorkers/isFleetWorker.
  'coordinator-idle-qf-hint': { 'fixture-session': true },
  // capacity-inputs: is_coordinator (both shapes) is UNCHANGED -- isLiveCountableWorker's OLD
  // truthy check (`if (md.is_coordinator) return false`) already caught both `true` and the
  // non-empty string 'true' (any non-empty string is truthy in JS), and the NEW coordinator-flag
  // axis catches both explicitly. (A different, more obscure shape -- a non-boolean truthy value
  // like `1`, or the falsy string "false" -- DOES diverge here; zero live specimens carry it, and
  // it is documented, not fixed, in isCapacityForecastWorker's own comment.)
  'capacity-inputs': {},
  // fleet-dashboard: THE HEADLINE FIX. isDispatchableFleetMember never checked is_coordinator at
  // all -- flips on BOTH shapes.
  'fleet-dashboard': { 'stale-is-coordinator-bool': true, 'stale-is-coordinator-string': true },
  // adam-quiet-tick: isBuildForbiddenSession's `=== true` check is boolean-only (TS-2's own
  // documented gap) -- the bool shape was ALREADY excluded (no change); the STRING shape flips.
  'adam-quiet-tick': { 'fixture-session': true, 'directed-work': true, 'qf-holder-authoritative': true, 'spin-up-grace': true, 'stale-is-coordinator-string': true },
};

export function changeExpected(consumer, reason) {
  return !!(MATRIX[consumer] && MATRIX[consumer][reason]);
}

/** Runs the full population x consumer grid. Pure: no I/O. */
export function runDifferential(population = FROZEN_POPULATION) {
  const results = [];
  for (const fixture of population) {
    for (const consumer of CONSUMERS) {
      const { pre, post } = VERDICT_FNS[consumer];
      const preVerdict = !!pre(fixture.session);
      const postVerdict = !!post(fixture.session);
      const changed = preVerdict !== postVerdict;
      results.push({
        fixtureId: fixture.id,
        reason: fixture.reason,
        sessionId: fixture.session.session_id,
        consumer,
        pre: preVerdict,
        post: postVerdict,
        changed,
        matrixExpected: changeExpected(consumer, fixture.reason),
        matches: changed === changeExpected(consumer, fixture.reason),
      });
    }
  }
  return results;
}
