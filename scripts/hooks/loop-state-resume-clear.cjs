#!/usr/bin/env node
/**
 * UserPromptSubmit hook: A TURN STARTED, SO THE WAKEUP FIRED — clear the resume latch.
 * SD-LEO-INFRA-LOOP-STATE-AWAITING-001 (FR-1, FR-2, FR-3).
 *
 * THE DEFECT. claude_sessions.loop_state was never reset when a loop RESUMED, so it could not
 * distinguish "a wakeup is armed" from "a wakeup was armed, fired, and was not re-armed". The stale
 * reading is the permissive one, which disarms the attrition guard in
 * scripts/hooks/stop-loop-wakeup-reminder.cjs: shouldRemind() short-circuits at
 * `awaiting_tick -> false` ("wakeup already armed — fine") and lets the worker go silent.
 * Measured 2026-07-28: 0 of 9 live seats read 'active'; all 14 rows table-wide that did were
 * status=released fossils.
 *
 * WHY *THIS* EVENT, and why the existing writer could never do it. The flip already existed at
 * scripts/hooks/session-register.cjs:333-336 — but that is a SessionStart hook, and SessionStart
 * does not fire when a ScheduleWakeup tick resumes an ALREADY-RUNNING session. Its own comment says
 * "SessionStart now means the wakeup fired"; that is the assumption which does not hold. Meanwhile
 * the SETTER (post-tool-loop-state.cjs) is registered under PostToolUse matcher "ScheduleWakeup",
 * so it fires only on a turn that ARMS a wakeup and structurally cannot be the clearer.
 * UserPromptSubmit fires on EVERY turn, including a ZERO-TOOL turn — which is exactly the attrition
 * case: a worker that wakes and does nothing.
 *
 * MEASURED, NOT ASSUMED. The PRD asserted this seam without carrying evidence, and the whole design
 * rests on it. autonomous-checkpoint.js writes a per-session counter ONLY from UserPromptSubmit
 * (registered there with no matcher). Session 0db9d282 reached turnCount=55 having received ZERO
 * typed prompts — every turn arrived as a wakeup tick, so the counter could not have advanced past
 * 1 if UserPromptSubmit did not fire on a tick. Corroborated across 8 live seats (14..2496 turns)
 * whose checkpoint mtimes land on whole-minute boundaries: the wakeup cadence, not human typing.
 *
 * TWO VALUES ARE CLEARED, NOT ONE, and 'exited' is the more dangerous of the pair. Its sole
 * programmatic writer is stale-session-sweep.cjs:3611, meaning "sessions THIS sweep released",
 * while the guard branch it feeds asserts "loop legitimately ended" — a meaning with zero writers
 * anywhere. Nothing reset it either, so from sweep-release until the next arming it waved through a
 * LIVE, WORKING, CLAIM-HOLDING seat. That is a live bypass, not an inert branch.
 *
 * THE CONDITIONAL WRITE *IS* THE SAFETY INVARIANT — do not "simplify" it to an unconditional stamp.
 * The operator-never-blocked rule (stop-loop-wakeup-reminder.cjs:26-32) is enforced ENTIRELY by
 * writing only where loop_state already holds one of the two latched values. A session that never
 * entered the loop machine has loop_state null/'unknown', matches nothing here, and is never
 * touched — so it can never be blocked. Operators, Adam, Solomon and the coordinator all claim SDs.
 *
 * Fail-open throughout: a hook that can break a turn is worse than a guard that misses one.
 */
'use strict';

const {
  LOOP_STATE_ACTIVE,
  LOOP_STATE_AWAITING_TICK,
  LOOP_STATE_EXITED,
} = require('../lib/sessions/loop-state-tracker.cjs');

/** The two values that mean "a previous loop iteration parked or ended this session". */
const LATCHED_STATES = [LOOP_STATE_AWAITING_TICK, LOOP_STATE_EXITED];

let _shuttingDown = false;
/**
 * Drain so the process can exit. Mirrors scripts/hooks/stop-loop-wakeup-reminder.cjs:53-62 — and
 * it is REQUIRED, not decorative: supabase-js issues its requests through undici, whose keep-alive
 * socket pool holds the event loop open after the write completes. Without this the hook does its
 * job and then hangs to the harness timeout, which is indistinguishable from a hook that broke the
 * turn. Found by the subprocess test: SIGTERM/ETIMEDOUT with the PATCH already delivered.
 */
async function shutdown() {
  if (_shuttingDown) return;
  _shuttingDown = true;
  // Backstop only, unref'd so it never delays a clean natural exit.
  setTimeout(() => process.exit(0), 8000).unref();
  try { await require('undici').getGlobalDispatcher().close(); } catch { /* absent or already closed */ }
}

/**
 * PURE — the decision, extracted so it is testable without a DB or a hook runtime.
 * @param {{sessionId?: string, loopState?: string|null}} input
 * @returns {{clear: boolean, reason: string}}
 */
function shouldClearLatch({ sessionId, loopState } = {}) {
  if (!sessionId) return { clear: false, reason: 'no_session_id' };
  if (loopState === LOOP_STATE_ACTIVE) return { clear: false, reason: 'already_active' };
  // null / 'unknown' / anything unrecognised is a session that never entered the loop machine.
  // Touching it would place an operator inside the guard's reach, which is the one thing this must
  // never do.
  if (!LATCHED_STATES.includes(loopState)) return { clear: false, reason: 'not_latched' };
  return { clear: true, reason: `cleared_from_${loopState}` };
}

async function main() {
  let payload = {};
  try {
    const raw = require('fs').readFileSync(0, 'utf8');
    if (raw && raw.trim()) payload = JSON.parse(raw);
  } catch { /* no stdin or unparseable — fall through to env */ }

  const sessionId =
    payload.session_id || process.env.CLAUDE_SESSION_ID || process.env.SESSION_ID || '';
  if (!sessionId) return shutdown();                          // fail-open

  let supabase;
  try {
    const { createSupabaseServiceClient } = require('../../lib/supabase-client.cjs');
    supabase = createSupabaseServiceClient();
  } catch { return shutdown(); }                              // fail-open

  try {
    // The conditional UPDATE *is* the guard: .in(loop_state, LATCHED_STATES) means a never-latched
    // session is not matched and not written. A read-then-write would only widen the race without
    // adding safety, since the predicate rides on the write itself.
    await supabase
      .from('claude_sessions')
      .update({ loop_state: LOOP_STATE_ACTIVE })
      .eq('session_id', sessionId)
      .in('loop_state', LATCHED_STATES);
  } catch { /* best-effort observability; never block a turn */ }
  await shutdown();
}

module.exports = { shouldClearLatch, LATCHED_STATES };

if (require.main === module) {
  main().catch(() => {}).finally(() => { process.exitCode = 0; });
}
