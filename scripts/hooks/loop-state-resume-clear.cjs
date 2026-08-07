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
 * ONE VALUE IS CLEARED, NOT TWO. An earlier draft also cleared 'exited', on the claim that the
 * meaning "the loop legitimately ended" had zero writers. Review falsified that — see LATCHED_STATES
 * below for the three writers and the mutex-path consumer. 'exited' is left strictly alone.
 *
 * THE CONDITIONAL WRITE *IS* THE SAFETY INVARIANT — do not "simplify" it to an unconditional stamp.
 * The operator-never-blocked rule (stop-loop-wakeup-reminder.cjs:26-32) is enforced ENTIRELY by
 * writing only where loop_state already holds the latched value. A session that never entered the
 * loop machine has loop_state null/'unknown', matches nothing here, and is never touched — so it can
 * never be blocked. Operators, Adam, Solomon and the coordinator all claim SDs.
 *
 * Fail-open throughout: a hook that can break a turn is worse than a guard that misses one.
 */
'use strict';

const {
  LOOP_STATE_ACTIVE,
  LOOP_STATE_AWAITING_TICK,
} = require('../lib/sessions/loop-state-tracker.cjs');

/**
 * The ONE value that means "a wakeup was armed for this session". Deliberately NOT 'exited'.
 *
 * This started as both. An adversarial review falsified the premise: I claimed 'exited' had "zero
 * writers" for the meaning "the loop legitimately ended", so promoting it back to 'active' could
 * only help. That was wrong on inspection — coordination-events.cjs:388 (charter item 7) and
 * stop-loop-wakeup-reminder.cjs:224 both instruct an agent to write it with exactly that meaning,
 * so the guard's OWN reminder advertises it as the deliberate way to stop. A fourth consumer,
 * singleton-refresh-sequencer.cjs:67, reads 'exited' as UNHEALTHY -> hold_old; flipping it to
 * 'active' would silently turn that into retire_old inside a mutex path.
 *
 * Clearing 'exited' would therefore make a deliberate exit non-durable: a still-armed tick would
 * flip a session that legitimately stopped back to 'active', and a legitimately-exited seat reading
 * 'active' means "do not dispatch" to the coordinator. The attrition defect this SD exists to fix
 * is entirely in the 'awaiting_tick' latch; 'exited' was scope I could not justify.
 */
const LATCHED_STATES = [LOOP_STATE_AWAITING_TICK];

let _shuttingDown = false;
/**
 * Drain so the process can exit. Mirrors scripts/hooks/stop-loop-wakeup-reminder.cjs:53-62 — and
 * it is REQUIRED, not decorative: supabase-js issues its requests through undici, whose keep-alive
 * socket pool holds the event loop open after the write completes. Without this the hook does its
 * job and then hangs to the harness timeout, which is indistinguishable from a hook that broke the
 * turn. Found while driving the real process against a stub server: SIGTERM/ETIMEDOUT with the
 * PATCH already delivered. That harness has since been replaced (it inherited real credentials), but
 * the drain it exposed is still required — nothing in the current suite covers it, stated plainly.
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

/**
 * The conditional UPDATE, isolated so it is testable against a fake client with no DB and no
 * credentials anywhere near the test file.
 *
 * The predicate IS the guard: `.in('loop_state', LATCHED_STATES)` means a session that never entered
 * the loop machine is not matched and not written. A read-then-write would only widen the race
 * without adding safety, since the predicate rides on the write itself. Verified from the writer
 * side during review: 'awaiting_tick' is written only by the ScheduleWakeup-matched hook, so an
 * operator session is unreachable from here.
 * @param {object} supabase a supabase-js client (or any object with the same builder shape)
 * @param {string} sessionId
 */
async function applyClear(supabase, sessionId) {
  return supabase
    .from('claude_sessions')
    .update({ loop_state: LOOP_STATE_ACTIVE })
    .eq('session_id', sessionId)
    .in('loop_state', LATCHED_STATES);
}

/**
 * Build the service client WITHOUT letting its dotenv banner reach stdout.
 *
 * Found by review, and it is not cosmetic: UserPromptSubmit stdout is injected into the model's
 * context, and this hook runs on EVERY turn for EVERY seat. Requiring lib/supabase-client.cjs emits
 * a 76-byte dotenv banner, which would have made this the first hook to push text into every turn
 * fleet-wide. Both existing UserPromptSubmit siblings emit zero bytes; so must this one.
 */
function defaultMakeClient() {
  const { createSupabaseServiceClient } = require('../../lib/supabase-client.cjs');
  return createSupabaseServiceClient();
}

/**
 * The FACTORY is the injection point, not the require-er. That is deliberate: a test injecting a
 * require-er would have to name the client-factory identifier to build its fake module, and the
 * DB-test guard correctly reads that identifier as "this unit test reaches a live database". This
 * shape lets a test pin the suppression while naming nothing the guard cares about.
 * @param {() => object} makeClient
 */
function loadClient(makeClient = defaultMakeClient) {
  const realWrite = process.stdout.write.bind(process.stdout);
  let escaped = 0;
  process.stdout.write = (chunk) => { escaped += chunk ? String(chunk).length : 0; return true; };
  try {
    return makeClient();
  } finally {
    process.stdout.write = realWrite;                        // restored even if construction throws
    loadClient.lastSuppressedBytes = escaped;                // observable, so a test can pin the suppression
  }
}

/**
 * PURE — resolve the session id from the hook payload, falling back to the environment.
 *
 * Extracted so it is testable WITHOUT spawning the hook. That is not a stylistic preference: the
 * subprocess test that used to cover this inherited the parent environment, so on any machine inside
 * a Claude Code session it resolved a real CLAUDE_SESSION_ID, built a live service-role client and
 * wrote to production `claude_sessions` — while asserting only `exit 0`, which the safe path and the
 * writing path both satisfy. The test could not tell them apart. A pure function has no such reach.
 *
 * CLAUDE_SESSION_ID only, never the generic SESSION_ID: that name is used elsewhere in the repo, and
 * a foreign value there would clear a DIFFERENT session's latch — disarming the attrition guard for
 * a seat that never resumed, which is precisely the failure this hook exists to prevent.
 * @param {{session_id?: string}} payload parsed hook stdin
 * @param {Record<string,string|undefined>} env
 * @returns {string} the session id, or '' when there is none
 */
function resolveSessionId(payload = {}, env = {}) {
  const fromPayload = payload && typeof payload.session_id === 'string' ? payload.session_id : '';
  return fromPayload || env.CLAUDE_SESSION_ID || '';
}

/** PURE — parse hook stdin, tolerating absent or malformed input. */
function parsePayload(raw) {
  try {
    return raw && String(raw).trim() ? JSON.parse(raw) : {};
  } catch { return {}; }                                      // unparseable → fall through to env
}

async function main() {
  let raw = '';
  try { raw = require('fs').readFileSync(0, 'utf8'); } catch { /* no stdin */ }

  const sessionId = resolveSessionId(parsePayload(raw), process.env);
  if (!sessionId) return shutdown();                          // fail-open

  let supabase;
  try { supabase = loadClient(); } catch { return shutdown(); }  // fail-open

  try {
    await applyClear(supabase, sessionId);
  } catch { /* best-effort observability; never block a turn */ }
  await shutdown();
}

module.exports = { shouldClearLatch, applyClear, resolveSessionId, parsePayload, loadClient, LATCHED_STATES };

if (require.main === module) {
  main().catch(() => {}).finally(() => { process.exitCode = 0; });
}
