// SD-ARCH-HOTSPOT-SWEEP-001: SWEEP_PASS_REGISTRY=off rollback path (PRD TR-3) for the
// three passes that were originally pure inline blocks in main() (no standalone
// function existed to delegate back to, unlike clearStaleQfClaims /
// splitCollidingSessions / runClaimBoundaryProbe / planDeadLetters, which stay defined
// in scripts/stale-session-sweep.cjs and are called directly by both the registry
// wrapper AND this file's own fallbacks — see each function below).
//
// Kept here (not inlined in main()) so main() stays thin regardless of the flag state
// — the kill switch's job is to provide a genuinely independent rollback path, not to
// double main()'s own line count.
//
// RETIREMENT (SD-LEO-INFRA-SWEEP-LEGACY-KILL-SWITCH-RETIRE-001): this is a one-way-door
// rollback path, not a permanent fixture. Its owner, retirement condition, and the
// enumerated retirement action (which deletes this file) are recorded as
// SWEEP_PASS_REGISTRY_RETIREMENT in scripts/stale-session-sweep.cjs, next to the
// SWEEP_PASS_REGISTRY_ENABLED flag it retires. Until retirement, the three functions
// below (runIntentCollisionLegacy, runDeadLetterLegacy, runCoordinationDetectorsLegacy)
// are pinned to their lib/sweep/passes/*.cjs counterparts by
// tests/ci/sweep-legacy-twin-parity.test.js — a hand-edit to one side without the other
// fails that test, naming the diverging twin.

const sweepModule = require('../../scripts/stale-session-sweep.cjs');

const DECONFLICTION_ENABLED = process.env.CROSS_SESSION_DECONFLICTION === 'true';
const INTENT_WINDOW_MIN = Number(process.env.CROSS_SESSION_INTENT_WINDOW_MIN) || 24 * 60;
const signalRouterModule = require('../coordinator/signal-router.cjs');
const coordEventsModule = require('../coordinator/coordination-events.cjs');

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8 (GUARD) — runDeadLetterLegacy fetches the
// FULL unread-coordination set to plan dead-lettering; a silent 1000-row cap leaves dead-targeted
// messages un-reaped, and a []-from-read-FAILURE must never be treated as "no unread messages" and let
// the pass proceed on an empty set. Paginate; skip the pass on read failure (GUARD_UNAVAILABLE). Kept in
// lockstep with its twin lib/sweep/passes/dead-letter-planning.cjs (sweep-legacy-twin-parity.test.js).
let _fapModule = null;
async function fapPaginate(queryFactory, opts) {
  _fapModule ||= await import('../db/fetch-all-paginated.mjs');
  return _fapModule.fetchAllPaginated(queryFactory, opts);
}

async function runIntentCollisionLegacy(ctx) {
  if (!DECONFLICTION_ENABLED) return;
  const { supabase, classified, warnings, collisionsDetected } = ctx;
  try {
    const { rows: intentRows, error: intentErr } = await sweepModule.loadRecentIntents(supabase, INTENT_WINDOW_MIN);
    if (intentErr) {
      console.log('INTENT_COLLISION: load error=' + (intentErr.message || 'unknown'));
      return;
    }
    const found = sweepModule.detectCrossSessionCollisions(classified, intentRows);
    if (collisionsDetected) collisionsDetected.push(...found);
    if (found.length > 0) {
      console.log('');
      console.log('!!! CROSS-SESSION INTENT COLLISION(S): ' + found.length + ' !!!');
      for (const c of found) {
        const line = 'INTENT_COLLISION: ' + c.intent_action +
          ' from ' + (c.sender_session || '?') +
          ' targets ' + (c.target_sd_key || c.target_tree || '?') +
          ' — collides with live session ' + c.collided_with_session +
          ' (' + c.reasons.join(', ') + ')';
        console.log('  ' + line);
        warnings.push(line);
      }
    }
  } catch (collErr) {
    console.log('INTENT_COLLISION: ' + (collErr && collErr.message ? collErr.message : 'unknown'));
  }
}

async function runDeadLetterLegacy(ctx) {
  const { supabase, classified, actions, nowMs } = ctx;
  const allSessionIds = new Set(classified.map(s => s.session_id));
  const deadIds = new Set(classified.filter(s => s.status === 'DEAD').map(s => s.session_id));

  let unreadMsgs;
  try {
    unreadMsgs = await fapPaginate(() => supabase
      .from('session_coordination')
      .select('id, target_session, message_type, payload, expires_at')
      .is('acknowledged_at', null)
      .is('read_at', null)
      .order('id', { ascending: true })); // unique tiebreaker (FR-6)
  } catch (readErr) {
    console.log('GUARD_UNAVAILABLE: dead-letter legacy pass skipped this tick — unread-message read failed (' + (readErr && readErr.message ? readErr.message : 'unknown') + '); messages retried next sweep');
    return;
  }

  const deadLetterPlan = sweepModule.planDeadLetters(unreadMsgs, { allSessionIds, deadIds }, nowMs);
  if (deadLetterPlan.length > 0) {
    for (let i = 0; i < deadLetterPlan.length; i += 50) {
      const batch = deadLetterPlan.slice(i, i + 50);
      for (const dl of batch) {
        await supabase.from('session_coordination').update(dl.update).eq('id', dl.id);
      }
    }
    actions.push('CLEANUP: dead-lettered ' + deadLetterPlan.length + ' unread coordination messages targeting dead/gone sessions (payload.dead_letter=true, audit retained)');
  }
}

async function runCoordinationDetectorsLegacy(ctx) {
  const { supabase } = ctx;
  try {
    const result = await signalRouterModule.aggregateSignals(supabase);
    if (result.error) {
      console.log('SIGNAL ROUTER: error=' + result.error.message);
    } else if (result.promoted > 0 || result.skipped > 0) {
      console.log('SIGNAL ROUTER: promoted=' + result.promoted + ' skipped=' + result.skipped);
      for (const row of (result.promotedRows || [])) {
        console.log('  HARNESS_BACKLOG_CREATED: feedback_id=' + row.feedback_id + ' type=' + row.signal_type + ' callsigns=' + row.callsigns.join(',') + ' count=' + row.signal_count);
      }
    }
  } catch (routerErr) {
    console.log('SIGNAL ROUTER: ' + (routerErr && routerErr.message ? routerErr.message : 'unknown'));
  }
  try {
    if (coordEventsModule.coordDetectorsEnabled()) {
      const coordInputs = await coordEventsModule.gatherDetectorInputs(supabase, {});
      const coordMatches = await coordEventsModule.runAndLogDetectors(supabase, coordInputs);
      for (const m of coordMatches) {
        console.log('  COORD_DETECTOR: ' + m.event_type + ' [' + m.severity + '] ' + m.reason + (m.logged ? '' : ' (event-log-failed)'));
      }
      if (coordMatches.length > 0) console.log('COORD_DETECTORS: ' + coordMatches.length + ' anomaly event(s) flagged');
    }
  } catch (coordDetErr) {
    console.log('COORD_DETECTORS: ' + (coordDetErr && coordDetErr.message ? coordDetErr.message : 'unknown'));
  }
  try {
    const inert = await coordEventsModule.runInertWorkerSurfacing(supabase, {});
    if (inert && inert.matched) {
      const a = inert.alert || {};
      const tail = a.skipped ? ' (alert deduped)' : a.ok ? ' - operator alert emitted' : ' (alert emit failed)';
      console.log('  INERT_WORKER: ' + inert.aged_count + ' aged unconsumed spawn request(s)' + tail);
    }
  } catch (inertErr) {
    console.log('INERT_WORKER: ' + (inertErr && inertErr.message ? inertErr.message : 'unknown'));
  }
  try {
    const exitSurf = await coordEventsModule.runCompletionBoundaryExitSurfacing(supabase, {});
    if (exitSurf && exitSurf.matched) {
      const a = exitSurf.alert || {};
      const tail = a.skipped ? ' (alert deduped)' : a.ok ? ' - operator alert emitted' : ' (alert emit failed)';
      console.log('  COMPLETION_BOUNDARY_EXIT: ' + exitSurf.exited_count + ' worker(s) silent-exited post-completion' + tail);
    }
  } catch (exitErr) {
    console.log('COMPLETION_BOUNDARY_EXIT: ' + (exitErr && exitErr.message ? exitErr.message : 'unknown'));
  }
}

module.exports = { runIntentCollisionLegacy, runDeadLetterLegacy, runCoordinationDetectorsLegacy };
