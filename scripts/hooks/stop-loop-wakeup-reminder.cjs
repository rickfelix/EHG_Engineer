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
 *
 * STATUS (QF-20260609-308): ENABLED fleet-wide via .claude/settings.json env
 * (LEO_LOOP_WAKEUP_REMINDER=on). Verified safe for interactive operator sessions: loop_state
 * only ever becomes 'active' via session-register.cjs's CONDITIONAL update
 * (`UPDATE ... SET loop_state='active' WHERE loop_state='awaiting_tick'`), and 'awaiting_tick' is
 * only set by post-tool-loop-state.cjs AFTER a /loop worker arms a ScheduleWakeup. An interactive
 * (non-/loop) session never arms a wakeup → never 'awaiting_tick' → never 'active' → this hook can
 * NEVER block an operator's turn-end. It fires only for a /loop worker that ended a turn still
 * 'active' (no wakeup armed) — exactly the attrition case it guards.
 */

const { LOOP_STATE_ACTIVE } = require('../lib/sessions/loop-state-tracker.cjs');

// ── Clean shutdown — Windows libuv UV_HANDLE_CLOSING avoidance ────────────────
// The claude_sessions query opens an undici/fetch keep-alive socket. Calling
// process.exit() afterward aborts on Windows: it forces libuv loop teardown while
// a socket/threadpool completion calls uv_async_send() on a handle already flagged
// UV_HANDLE_CLOSING → "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING),
// file src\\win\\async.c, line 76". EMPIRICALLY this reproduces 100% with a bare
// exit, with a setImmediate-deferred exit, AND even after dispatcher.close() if
// process.exit() is still called. The ONLY reliable avoidance is to NOT call
// process.exit(): close undici's sockets, then let the event loop drain so the
// process exits on its own. (Folklore — mirror stop-subagent-enforcement.js's
// setImmediate "gracefulExit" — does NOT work here; verified by repro before fix.)
let _shuttingDown = false;
async function shutdown() {
  if (_shuttingDown) return;
  _shuttingDown = true;
  // Backstop only: force-exit if the loop somehow fails to drain. unref'd so it
  // never delays a clean natural exit; if it ever fires (8s, under the hook's 10s
  // timeout) the sockets are already closed, so this exit can't race a live one.
  setTimeout(() => process.exit(0), 8000).unref();
  try { await require('undici').getGlobalDispatcher().close(); } catch { /* undici absent/already closed */ }
  // Deliberately NO process.exit() — returning lets Node exit once the loop drains.
}

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
    let timer = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);   // don't let the timeout pin the loop open at drain
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    };
    try {
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (c) => { data += c; });
      process.stdin.on('end', finish);
      process.stdin.on('error', () => { if (!settled) { settled = true; if (timer) clearTimeout(timer); resolve({}); } });
      timer = setTimeout(finish, timeoutMs);
    } catch { resolve({}); }
  });
}

async function main() {
  try {
    const flagEnabled = isFlagEnabled();
    if (!flagEnabled) { return shutdown(); }     // default-OFF fast path

    const payload = await readStdinPayload();
    const stopHookActive = payload.stop_hook_active === true;
    if (stopHookActive) { return shutdown(); }   // already reminded — let it stop

    const sessionId = payload.session_id || process.env.CLAUDE_SESSION_ID || process.env.SESSION_ID || '';
    if (!sessionId) { return shutdown(); }       // can't resolve — fail-open

    const { createSupabaseServiceClient } = require('../../lib/supabase-client.cjs');
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('loop_state')
      .eq('session_id', sessionId)
      .maybeSingle();
    if (error) { return shutdown(); }            // DB error — fail-open

    const loopState = data ? data.loop_state : null;
    if (shouldRemind({ loopState, stopHookActive, flagEnabled })) {
      process.stdout.write(JSON.stringify({ decision: 'block', reason: REMINDER }));
    }
    return shutdown();
  } catch (e) {
    process.stderr.write(`[stop-loop-wakeup-reminder] ${e.message}\n`);
    return shutdown();                           // fail-open: never trap a worker
  }
}

if (require.main === module) {
  // Registered only when run as the hook (never when require()'d by tests, so it
  // can't swallow a test runner's failures). Absorbs any late JS-level rejection
  // and routes it through the same deferred exit.
  process.on('uncaughtException', () => shutdown());
  process.on('unhandledRejection', () => shutdown());
  main().catch(() => shutdown());
}

module.exports = { shouldRemind, isFlagEnabled };
