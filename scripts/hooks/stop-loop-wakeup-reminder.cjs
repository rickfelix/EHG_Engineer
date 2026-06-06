#!/usr/bin/env node
/**
 * Stop hook — remind an autonomous /loop worker to arm a ScheduleWakeup before it
 * ends a turn and goes silently incognito (fleet-worker attrition cause #4: idle-gap stall).
 *
 * SD: SD-FDBK-ENH-FLEET-WORKER-ATTRITION-001
 *
 * The loop-state machine (loop-state-tracker.cjs) marks a /loop worker:
 *   - 'awaiting_tick' once it arms a ScheduleWakeup (post-tool-loop-state.cjs), or
 *   - 'active' while it is mid-iteration (set by session-register.cjs when a wakeup fires).
 * A worker that ENDS a turn while still 'active' has NOT armed a wakeup → the /loop never
 * re-fires → it goes silent indefinitely and the idle worktree is reaped by the claim-sweep.
 *
 * When the session's loop_state is 'active' at Stop (and this is the FIRST stop this turn),
 * this hook BLOCKS the stop once with a reminder to arm a ScheduleWakeup (short delay if work
 * is in-flight, ~20min if idle) or set loop_state='exited' to legitimately end the loop.
 *
 * SAFETY:
 *   - Flag-gated: LEO_LOOP_WAKEUP_REMINDER (default off) → fast no-op (allow stop).
 *   - Anti-infinite-loop: never blocks when stop_hook_active is already true (the worker saw
 *     the reminder once and chose to stop) — respects the worker, prevents a block loop.
 *   - Escape: loop_state='exited' (or any non-'active' state) → never blocks.
 *   - Fail-open: any error / no session / DB-unavailable → allow stop (exit 0), never throws.
 */

const { LOOP_STATE_ACTIVE } = require('../lib/sessions/loop-state-tracker.cjs');

/**
 * Pure decision: should the Stop hook block-and-remind this turn?
 * Block ONLY when the reminder is enabled AND this is a /loop worker mid-iteration
 * ('active' = no wakeup armed) AND we have not already reminded this turn.
 * @param {{ loopState: string|null|undefined, stopHookActive: boolean, flagEnabled: boolean }} args
 * @returns {boolean}
 */
function shouldRemind({ loopState, stopHookActive, flagEnabled }) {
  if (!flagEnabled) return false;          // default-OFF: no-op
  if (stopHookActive) return false;        // never block twice — worker already saw the reminder
  return loopState === LOOP_STATE_ACTIVE;  // only 'active' (no wakeup armed); 'awaiting_tick'/'exited'/null are fine
}

function isFlagEnabled() {
  const v = (process.env.LEO_LOOP_WAKEUP_REMINDER || 'off').toLowerCase();
  return v === 'on' || v === '1' || v === 'true';
}

const REMINDER = [
  '/loop worker stopping with NO ScheduleWakeup armed (loop_state=active) — you will go INCOGNITO.',
  'An autonomous /loop only re-fires on a ScheduleWakeup tick; ending the turn now strands your claimed SD',
  'and your worktree gets reaped by the claim-sweep. Before you stop:',
  '  • arm a ScheduleWakeup (short delay if work is in-flight, ~20min if idle), OR',
  "  • if you intend to END the loop, set claude_sessions.loop_state='exited' for your session.",
  '(This reminder fires once — if you stop again it will let you through.)',
].join('\n');

/** Read+parse the Stop-hook stdin payload once; resolve {} on any error/timeout. */
function readStdinPayload(timeoutMs = 2000) {
  return new Promise((resolve) => {
    let data = '';
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    };
    try {
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (c) => { data += c; });
      process.stdin.on('end', finish);
      process.stdin.on('error', () => { if (!settled) { settled = true; resolve({}); } });
      setTimeout(finish, timeoutMs);
    } catch { resolve({}); }
  });
}

async function main() {
  try {
    const flagEnabled = isFlagEnabled();
    if (!flagEnabled) { process.exit(0); }            // default-OFF fast path

    const payload = await readStdinPayload();
    const stopHookActive = payload.stop_hook_active === true;
    if (stopHookActive) { process.exit(0); }          // already reminded — let it stop

    const sessionId = payload.session_id || process.env.CLAUDE_SESSION_ID || process.env.SESSION_ID || '';
    if (!sessionId) { process.exit(0); }              // can't resolve — fail-open

    const { createSupabaseServiceClient } = require('../../lib/supabase-client.cjs');
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('loop_state')
      .eq('session_id', sessionId)
      .maybeSingle();
    if (error) { process.exit(0); }                   // DB error — fail-open

    const loopState = data ? data.loop_state : null;
    if (shouldRemind({ loopState, stopHookActive, flagEnabled })) {
      process.stdout.write(JSON.stringify({ decision: 'block', reason: REMINDER }));
    }
    process.exit(0);
  } catch (e) {
    process.stderr.write(`[stop-loop-wakeup-reminder] ${e.message}\n`);
    process.exit(0);                                  // fail-open: never trap a worker
  }
}

if (require.main === module) {
  main();
}

module.exports = { shouldRemind, isFlagEnabled };
