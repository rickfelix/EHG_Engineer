// SD-ARCH-HOTSPOT-SWEEP-001: extracted from scripts/stale-session-sweep.cjs main()
// FIX #3 dead-letter block (was lines ~2299-2333).
//
// Coordination messages targeting dead/gone sessions are DEAD-LETTERED, never
// hard-deleted: stamp payload.dead_letter=true + dead_letter_at/reason/original_target,
// stamp read_at (drops the row out of every unread selector), backfill
// expires_at=now+7d when NULL so cleanup_expired_coordination reaps the audit trail
// after a week. Eligibility (UUID-shaped target, target DEAD/gone, past expires_at if
// set) is the pure planDeadLetters() (scripts/stale-session-sweep.cjs, exported for
// tests — see circular-require note in intent-collision-detection.cjs, same pattern
// applies here).

const sweepModule = require('../../../scripts/stale-session-sweep.cjs');

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8 (GUARD) — fetches the FULL unread-
// coordination set to plan dead-lettering; a silent 1000-row cap leaves dead-targeted messages
// un-reaped, and a []-from-read-FAILURE must never be treated as "no unread messages" and let the pass
// proceed on an empty set. Paginate; skip the pass on read failure (GUARD_UNAVAILABLE). Kept in lockstep
// with its twin lib/sweep/legacy-fallback.cjs (sweep-legacy-twin-parity.test.js).
let _fapModule = null;
async function fapPaginate(queryFactory, opts) {
  _fapModule ||= await import('../../db/fetch-all-paginated.mjs');
  return _fapModule.fetchAllPaginated(queryFactory, opts);
}

async function run(ctx) {
  const { supabase, now, classified, actions } = ctx;

  // cleanup_expired_coordination runs inline in main() immediately before this pass is
  // invoked (retained there for both flag modes) — do NOT also call it here, or registry
  // mode double-fires the RPC (adversarial-review fix, PR #5755).

  const allSessionIds = new Set(classified.map(s => s.session_id));
  const deadIds = new Set(classified.filter(s => s.status === 'DEAD').map(s => s.session_id));
  const nowMs = now.getTime();

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
    // Per-row UPDATE (payload merge differs per row); chunked pacing of 50 retained.
    for (let i = 0; i < deadLetterPlan.length; i += 50) {
      const batch = deadLetterPlan.slice(i, i + 50);
      for (const dl of batch) {
        await supabase.from('session_coordination').update(dl.update).eq('id', dl.id);
      }
    }
    actions.push('CLEANUP: dead-lettered ' + deadLetterPlan.length + ' unread coordination messages targeting dead/gone sessions (payload.dead_letter=true, audit retained)');
  }
}

module.exports = { name: 'dead-letter-planning', run };
