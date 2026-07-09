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

async function run(ctx) {
  const { supabase, now, classified, actions } = ctx;

  // cleanup_expired_coordination runs inline in main() immediately before this pass is
  // invoked (retained there for both flag modes) — do NOT also call it here, or registry
  // mode double-fires the RPC (adversarial-review fix, PR #5755).

  const allSessionIds = new Set(classified.map(s => s.session_id));
  const deadIds = new Set(classified.filter(s => s.status === 'DEAD').map(s => s.session_id));
  const nowMs = now.getTime();

  const { data: unreadMsgs } = await supabase
    .from('session_coordination')
    .select('id, target_session, message_type, payload, expires_at')
    .is('acknowledged_at', null)
    .is('read_at', null);

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
