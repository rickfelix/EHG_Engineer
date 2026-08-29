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
 * ⚠ THE SAFETY ARGUMENT BELOW IS STALE AS OF STEP A — read this first.
 * The paragraph that follows claims this hook "can NEVER block an operator's turn-end" because an
 * interactive session never reaches loop_state='active'. FR-4 replaced that reasoning: the worker
 * gate is now (hasActiveClaim || live loop state), so an OPERATOR WHO HOLDS A CLAIM is worker-shaped
 * and IS blockable — once per turn, every turn. Measured 2026-08-03: exposure is zero because all
 * six claim-holders are loop workers, which makes today's safety a COINCIDENCE rather than the
 * structural guarantee the text asserts. Left in place, marked, rather than quietly deleted: the
 * original reasoning is why the flag was enabled fleet-wide, and whoever revisits that decision
 * needs to see both the claim and its expiry.
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

// ── STDOUT IS THE DECISION CHANNEL — MUZZLED BEFORE ANYTHING ELSE LOADS ──────
// Claude Code parses this hook's stdout as the Stop decision document. Requiring the supabase
// client loads dotenv, which writes an ~80-byte "◇ injected env …" banner to STDOUT (measured
// 2026-08-02; PRE-EXISTING — git HEAD already required it). Worse, that banner's tip text
// contains a literal "{", so it is not merely a preamble: it defeats find-first-brace extraction
// and yields a SyntaxError instead of a decision. (Observed live — it broke an unrelated parse of
// worker-checkin.cjs stdout the same day.)
//
// A scoped muzzle around the ONE require I had measured was the instance fix, not the class fix:
// the allow path still emitted 87 bytes from a DIFFERENT transitive require (park-worker /
// emit-feedback). So the muzzle is installed at module load, before any require below runs, and
// stdout is restored ONLY to emit the decision. Everything else on this hook's stdout is dropped.
// stderr is untouched. AC: process.stdout.write appears exactly ONCE outside these two helpers.
// GATED ON BEING THE PROCESS ENTRY POINT. Node sets require.main before executing the entry
// module, so this still arms BEFORE the requires below when running as the hook — which is the
// whole point. But an IMPORTER (a test, a script) must not have its stdout silently muzzled as a
// side effect of requiring this file: I hit exactly that while verifying a merge, where a
// verification script that required the hook printed nothing at all and looked like a crash.
// A global side effect on every consumer is too high a price for a guarantee only the hook
// process needs.
// A muzzle must still HONOUR THE WRITE CALLBACK. An arrow that just returns true DROPS it, so a
// transitive writer that waits for its callback would hang until the 10s hook timeout — and a
// timed-out Stop hook returns NO DECISION, the exact failure the budget work exists to prevent.
// Swallow the bytes, invoke the callback, report success. (Found by the SECURITY sub-agent.)
const SWALLOW = (_chunk, enc, cb) => { if (typeof enc === 'function') enc(); else if (typeof cb === 'function') cb(); return true; };
const RUNNING_AS_HOOK = require.main === module;
const REAL_STDOUT_WRITE = process.stdout.write.bind(process.stdout);
if (RUNNING_AS_HOOK) process.stdout.write = SWALLOW;

/** The ONLY path back onto stdout. Writes the decision document and re-muzzles. */
function emitDecision(payload) {
  try {
    REAL_STDOUT_WRITE(JSON.stringify(payload));
  } finally {
    if (RUNNING_AS_HOOK) process.stdout.write = SWALLOW;
  }
}

const {
  LOOP_STATE_ACTIVE,
  LOOP_STATE_AWAITING_TICK,
  LOOP_STATE_EXITED,
} = require('../lib/sessions/loop-state-tracker.cjs');
const armEvidence = require('./lib/wakeup-arm-evidence.cjs');

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
 *
 * STEP A (SD-LEO-INFRA-TERMINAL-RITUAL-ENFORCEMENT-001): the block now derives from TRANSCRIPT
 * EVIDENCE of a ScheduleWakeup tool_use in the current turn, not from loop_state. The old
 * predicate read a flag the worker sets about itself, so a worker that believed it had armed —
 * or said so — satisfied it without the tool ever being called.
 *
 * WHAT THIS CAN AND CANNOT DO. It blocks ONCE per turn; a worker that stops again passes through
 * (stop_hook_active, the anti-infinite-loop guard). For the dormancy this SD targets there is no
 * later turn to re-block — the seat is gone — so step A is a one-shot NUDGE, not a compulsion.
 * The escape is therefore COUNTED (classifyWindDownReason → 'second_stop_still_unarmed'): that
 * number is how often a reminder was seen and ignored, and it is the evidence base for step C,
 * which arms on the worker's behalf and is the actual enforcement.
 *
 * @param {{ armVerdict?: 'armed'|'unarmed'|'unknown', loopState?: string|null, stopHookActive?: boolean,
 *           flagEnabled?: boolean, enforcementDisabled?: boolean, hasActiveClaim?: boolean }} args
 * @returns {boolean}
 */
function shouldRemind({ armVerdict, loopState, stopHookActive, flagEnabled, enforcementDisabled, hasActiveClaim }) {
  if (!flagEnabled) return false;                       // default-OFF: no-op
  if (enforcementDisabled) return false;                // runtime kill switch (FR-2)
  if (stopHookActive) return false;                     // never block twice — already reminded
  if (loopState === LOOP_STATE_EXITED) return false;    // loop legitimately ended

  // WORKER GATE (FR-4). Worker-shape is a CLAIM or a live loop state — NOT an announcement.
  // This is what keeps operators safe, and it replaces the old windDownSignaled allow-path,
  // which returned false for ANY session that merely said "winding down". That allow-path was
  // simultaneously too wide and too narrow: it let a worker talk its way out of the arm
  // requirement, and (shouldParkRecoverable:112, same defect) it parked operators into
  // awaiting_tick, where an aged-out window then blocked THEIR turn-end.
  const isWorker = Boolean(hasActiveClaim)
    || loopState === LOOP_STATE_ACTIVE
    || loopState === LOOP_STATE_AWAITING_TICK;
  if (!isWorker) return false;

  // ARM EVIDENCE (FR-3). ONLY an actual ScheduleWakeup tool_use in the CURRENT turn excuses the
  // stop. An announcement does not — not a /signal saying "wakeup armed", not loop_state, not
  // metadata. That is Charlie's false positive, and it is the whole point of this predicate:
  // the old one read loop_state='awaiting_tick', which post-tool-loop-state.cjs sets from the
  // worker's own claim about itself, so the enforcement was asking the suspect for an alibi.
  if (armVerdict === 'armed') return false;
  if (armVerdict === 'unarmed') return true;
  // 'unknown' — no boundary in the tail window, or no transcript. Absence of evidence is not
  // evidence of absence: fail open rather than trap a worker on an unreadable transcript.
  return false;
}

function isFlagEnabled() {
  const v = (process.env.LEO_LOOP_WAKEUP_REMINDER || 'off').toLowerCase();
  return v === 'on' || v === '1' || v === 'true';
}

/**
 * SD-LEO-INFRA-WORKER-WIND-DOWN-001: independent kill switch for the same-turn next-claim
 * attempt below. Default ON (this SD's whole point is to ship it), but rollback-able without a
 * redeploy — mirrors every other feature in this file having its own escape hatch. Deliberately
 * NOT tied to the wakeup-reminder's own enforcementDisabled kill switch (a different concern:
 * that one gates the BLOCK-on-unarmed behavior; this one gates dispatch efficiency).
 */
function isSameTurnClaimEnabled() {
  const v = (process.env.LEO_SAME_TURN_NEXT_CLAIM || 'on').toLowerCase();
  return v !== 'off' && v !== '0' && v !== 'false';
}

/**
 * SD-LEO-INFRA-WORKER-WIND-DOWN-001 — pure: should this ALLOW-PATH stop attempt a SAME-TURN
 * next-claim before parking? Sourced from a measured specimen: three finisher seats completed
 * their children and sat idle-no-claim for ~40 minutes beside claim-ready work, because the
 * worker /loop exits after wind-down and directed assignments queue until the NEXT checkin.
 *
 * Target population is narrow and deliberate: worker-shaped (see shouldParkRecoverable) AND
 * holding NO active claim right now. A worker that still holds a claim must finish it or hand it
 * off explicitly (the wind-down handshake) — this function must never fire for that population,
 * or a finisher could grab a SECOND SD while still sitting on an unfinished first one.
 * @param {{ hasActiveClaim?: boolean, workerShaped?: boolean }} args
 * @returns {boolean}
 */
function shouldAttemptSameTurnClaim({ hasActiveClaim, workerShaped } = {}) {
  return Boolean(workerShaped) && !hasActiveClaim;
}

/**
 * SD-LEO-INFRA-WORKER-WIND-DOWN-001 — attempt ONE same-turn next-claim via the EXISTING
 * canonical checkin resolution path (worker-checkin.cjs's resolveCheckin): the same directed-
 * assignment-first, self-claim-second ladder every worker /checkin already uses. No claim
 * predicate, guard, or priority rule is duplicated here — that is deliberate scope (this SD's
 * non-goal list explicitly excludes touching the claim predicates themselves).
 *
 * Bounded by `timeoutMs` so a slow resolution can never blow the Stop hook's own work budget —
 * a timeout (or timeoutMs<=0) is treated exactly like "nothing claimable": fail-open, no retry,
 * no busy-wait. A single attempt, once, same turn — never a polling loop.
 * @param {{ resolveCheckinFn: Function, sb: any, sessionId: string, timeoutMs: number }} args
 * @returns {Promise<{outcome:'claimed'|'none-claimable', key: string|null, resolution: any}>}
 */
async function attemptSameTurnNextClaim({ resolveCheckinFn, sb, sessionId, timeoutMs }) {
  const NONE = { outcome: 'none-claimable', key: null, resolution: null };
  if (!(timeoutMs > 0)) return NONE;
  const TIMEOUT = Symbol('same-turn-claim-timeout');
  let resolution;
  // Clear the race's loser explicitly (mirrors readStdinPayload's finish()): shutdown()
  // deliberately never calls process.exit() on the normal path, so an unref'd/uncleared timer
  // would otherwise pin the event loop open for the remainder of timeoutMs after a fast claim.
  let timer = null;
  try {
    resolution = await Promise.race([
      resolveCheckinFn(sb, sessionId),
      new Promise((r) => { timer = setTimeout(() => r(TIMEOUT), timeoutMs); }),
    ]);
  } catch {
    return NONE; // fail-open: an erroring resolution must never trap a worker mid-wind-down
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (resolution === TIMEOUT || !resolution) return NONE;
  // INVERTED classifier (VALIDATION finding 0e479a8d): an ALLOWLIST of claim actions silently
  // drops any FUTURE ladder rung that also acquires a claim, exactly as it already dropped TWO
  // live ones — recover-stranded-final (rung 5.7, 'resume_final') and adopt-orphan (rung 5.8,
  // 'resume_orphan') run UNCONDITIONALLY (no ctx.mySd gate) and both call tryClaim, so they ARE
  // reachable for a claim-less caller. Only plain 'resume' (lib/checkin/steps/resume.cjs:248) is
  // genuinely mySd-gated and therefore unreachable here — it still classifies correctly as
  // 'claimed' below if that gate is ever loosened, since it is not in the denylist either.
  // Denylist NON-claim terminals instead: anything
  // NOT in this set is treated as a real claim, so a new rung that adds a new action string is
  // claimed-by-default rather than silently misreported as 'none-claimable'.
  const NON_CLAIM_ACTIONS = new Set(['idle', 'idle_fable_propose', 'error']);
  if (resolution.action && !NON_CLAIM_ACTIONS.has(resolution.action)) {
    const key = resolution.sd || resolution.qf || null;
    return { outcome: 'claimed', key, resolution };
  }
  return { outcome: 'none-claimable', key: null, resolution };
}

/**
 * SD-LEO-INFRA-WORKER-WIND-DOWN-001 — SECURITY finding (evidence 4711ebbc): resolveCheckin's
 * roll-call step (lib/checkin/steps/roll-call.cjs) unconditionally surfaces
 * `ctx.base.coordinator_messages[]` AND consumes them as a side effect — an already-delivered
 * advisory row is stamped acknowledged_at (permanently CONSUMED, never re-surfaced) the moment
 * it is read. attemptSameTurnNextClaim previously discarded `resolution.coordinator_messages`
 * entirely, so every same-turn-claim attempt silently burned a delivery slot: the row shows
 * delivered/acknowledged in the DB, but the parking worker never saw the content. This formats
 * them into the Stop-hook block reason so they are actually surfaced before the worker can stop.
 * Pure — never throws, never touches the network.
 * @param {Array<{subject?:string, body?:string, kind?:string, chairman_directive?:boolean}>} messages
 * @returns {string} empty string when there is nothing to surface
 */
function formatCoordinatorMessagesForBlock(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  const lines = messages.map((m, i) => {
    const tag = m.chairman_directive ? 'CHAIRMAN DIRECTIVE' : (m.kind || 'message').toUpperCase();
    const subject = m.subject ? ` — ${m.subject}` : '';
    const body = m.body ? `\n   ${m.body}` : '';
    return `  ${i + 1}. [${tag}]${subject}${body}`;
  });
  return `\n\nCOORDINATOR MESSAGE(S) surfaced during this same-turn checkin (act on these before going idle):\n${lines.join('\n')}`;
}

/**
 * SD-LEO-INFRA-WORKER-WIND-DOWN-001 — best-effort dashboard-observability stamp: makes "chose to
 * exit idle after looking" distinguishable from "never looked" on the same claude_sessions record
 * the rest of this file already annotates (mirrors recordWindDown's read-modify-merge pattern).
 * Fail-open — any failure is logged and never blocks the stop.
 * @param {{ outcome: 'claimed'|'none-claimable', key?: string|null }} args
 */
async function recordSameTurnClaimAttempt(supabase, sessionId, { outcome, key } = {}) {
  try {
    const { data: row } = await supabase
      .from('claude_sessions')
      .select('metadata')
      .eq('session_id', sessionId)
      .maybeSingle();
    const metadata = { ...(row && row.metadata ? row.metadata : {}) };
    metadata.same_turn_claim_attempt = { outcome, key: key || null, at: new Date().toISOString() };
    await supabase.from('claude_sessions').update({ metadata }).eq('session_id', sessionId);
  } catch (e) {
    process.stderr.write(`[stop-loop-wakeup-reminder] same-turn-claim metadata (non-fatal): ${e.message}\n`);
  }
}

/**
 * SD-LEO-INFRA-WORKER-ENGAGEMENT-ARM-PARK-001 — pure decision: on a Stop ALLOW-PATH (the hook is
 * letting this turn end without blocking), should we PARK the session recoverable rather than let it
 * cold-exit to zero? SEPARATION OF CONCERNS (the wind-down lesson): opting out of self-claim (stop
 * churn) and parking-with-a-wakeup (stay recoverable) are SEPARATE — a worker that signalled a
 * wind-down OR hit the second-stop allow-path should STILL be parked recoverable, not cold-exited.
 *
 * Park iff the session looks like a WORKER that could strand work: it holds a live SD claim, is in a
 * loop state ('active'/'awaiting_tick'), or announced a wind-down. A claim-less, loop-less,
 * non-signalling interactive operator session is NEVER parked (no false telemetry on an operator).
 * @param {{ loopState?:string|null, hasActiveClaim?:boolean, windDownSignaled?:boolean }} args
 * @returns {boolean}
 */
function shouldParkRecoverable({ loopState, hasActiveClaim, windDownSignaled } = {}) {
  if (hasActiveClaim) return true;
  if (windDownSignaled) return true;
  if (loopState === LOOP_STATE_ACTIVE || loopState === LOOP_STATE_AWAITING_TICK) return true;
  return false;
}

/**
 * STEP B — write a RECOVERABLE park-state: a capped expected_silence_until ALWAYS, and
 * loop_state='awaiting_tick' ONLY WHEN THE TURN ACTUALLY ARMED.
 *
 * FR-B1's requirement is "no code path stamps armed-state without an actual ScheduleWakeup tool
 * call". This function was that path: it stamped awaiting_tick — a claim that a wakeup is pending —
 * on every parked worker, armed or not. Now that step A produces real arm evidence, the write is
 * GUARDED by it rather than deleted. Guarding beats deleting: a genuinely armed worker keeps the
 * true state and all four consumers below behave exactly as before, so the change costs nothing on
 * the compliant path and only removes the FALSE claim.
 *
 * THE FOUR ACTUATING CONSUMERS, and what each does once an unarmed seat stops being stamped
 * (an unarmed /loop worker's loop_state remains 'active', which is accurate — it was looping and
 * did not arm):
 *   1. dormancy-watchdog.cjs isDormant:25 — gates on loop_state ∈ {awaiting_tick, active} FIRST,
 *      then expected_silence_until. Unarmed seats stay 'active' ⇒ STILL DETECTED.
 *      NOTE FR-B1 IS WRONG ON THE MECHANISM: it says keeping expected_silence_until preserves
 *      visibility, but :25 short-circuits on loop_state BEFORE :26 ever reads that field. What
 *      actually preserves visibility is 'active' already being in the set. Keeping
 *      expected_silence_until is still required — :27 rejects an unparseable one — but it is not
 *      sufficient on its own, and a seat whose loop_state is null/'unknown' would be invisible.
 *      MEASURED 2026-08-02: of 4 claim-holding sessions, loop_state was {awaiting_tick:2,
 *      active:2} and ZERO fell outside the set. That is a point-in-time sample, not a proof the
 *      null/'unknown' population is empty in general.
 *   2. session-watchdog.js classifyWatchdogState:48 — 'parked' ⇒ STOPPED ⇒ never restarted.
 *      It also treats a live expected_silence_until window as parked, so behaviour is UNCHANGED
 *      while the window is open. Once it elapses, an unarmed seat now classifies CRASHED/AUTH-LOST
 *      and becomes ACTIONABLE. That is the point: a dead seat should be revived, not left parked
 *      forever by a sticky flag it never earned.
 *   3. singleton-relaunch-trigger.js SAFE_LOOP_STATES:47 — ['awaiting_tick','exited']; anything
 *      else FAILS CLOSED (no relaunch). An unarmed singleton now reads 'active' ⇒ relaunch is NOT
 *      scheduled. Conservative, and it removes a real contradiction: the same false stamp was
 *      simultaneously telling consumer 2 "parked, do not restart" and consumer 3 "safe to
 *      relaunch". Armed singletons are unaffected — they still stamp awaiting_tick, both here and
 *      via post-tool-loop-state.cjs, which is the LEGITIMATE writer (it fires on the actual tool call).
 *   4. charter-audit-detectors.mjs isParked:83 — awaiting_tick OR inside the armed-silence window.
 *      expected_silence_until is still written unconditionally ⇒ UNCHANGED; parked workers are
 *      still excluded from the neglect flag, so no false starvation alarms.
 *
 * Best-effort / fail-open — any failure is logged and never blocks the stop.
 */
async function parkSessionRecoverable(sessionId, { armVerdict } = {}) {
  if (armVerdict === 'armed') {
    try {
      const { setLoopState } = require('../lib/sessions/loop-state-tracker.cjs');
      await setLoopState(sessionId, LOOP_STATE_AWAITING_TICK);
    } catch (e) {
      process.stderr.write(`[stop-loop-wakeup-reminder] park loop-state (non-fatal): ${e.message}\n`);
    }
  }
  try {
    const { computeSilenceMinutes } = require('../park-worker.cjs');
    const { writeTelemetryAwait } = require('./lib/session-telemetry-writer.cjs');
    const silenceMin = computeSilenceMinutes(undefined); // undefined wake → safe DEFAULT, pre-capped
    const nowMs = Date.now();
    await writeTelemetryAwait(sessionId, {
      heartbeat_at: new Date(nowMs).toISOString(),
      expected_silence_until: new Date(nowMs + silenceMin * 60000).toISOString(),
      last_activity_kind: 'idle',
    });
  } catch (e) {
    process.stderr.write(`[stop-loop-wakeup-reminder] park silence-arm (non-fatal): ${e.message}\n`);
  }
}

/**
 * SD-LEO-INFRA-WORKER-WINDDOWN-SURVEY-001 (a): classify WHY a worker is winding down at the
 * allow/park path, for the metadata.wind_down capture + fleet-wide aggregation. Pure/total.
 *   - 'signaled'                            — the worker announced a wind-down via /signal (windDownSignaled)
 *   - 'second_stop'                         — the Stop hook's second-stop allow-path (stop_hook_active)
 *   - 'turn_end_with_claim_wakeup_scheduled'— loop_state='awaiting_tick' (a ScheduleWakeup is already
 *                                              armed) AND the session holds a live SD claim — a legitimate
 *                                              same-turn park, NOT an idle worker (QF-20260703-347: this
 *                                              case was previously misclassified as 'no_claim_idle',
 *                                              contradicting its own recorded had_claim:true flag).
 *   - 'turn_end_wakeup_scheduled'           — loop_state='awaiting_tick' but no live claim (idle worker
 *                                              that armed its own wakeup correctly).
 *   - 'turn_end_with_claim_no_wakeup'       — SD-LEO-INFRA-TERMINAL-RITUAL-ENFORCEMENT-001 (TR-3):
 *                                              a live SD claim with NO wakeup evidence. This is THIS
 *                                              SD's entire target population — the seat that ends a turn
 *                                              holding work and never re-fires. It was previously folded
 *                                              into 'no_claim_idle', a value that CONTRADICTS the
 *                                              had_claim:true stamped beside it by recordWindDown, so the
 *                                              dormancy population was uncountable by its own telemetry.
 *   - 'no_claim_idle'                       — none of the above; no wakeup evidence AND no live claim.
 *
 * BROAD, not narrow: the claim-aware split is applied to the WHOLE fall-through, not just the one
 * path reachable today (loop_state='exited' + a live claim). The other inputs are unreachable only
 * because shouldRemind currently blocks them first — and step A REPLACES that predicate, which makes
 * them reachable. A fix narrowed to today's reachability would silently start lying the moment the
 * predicate changes. This turns tests/unit/hooks/stop-loop-park-recoverable.test.js:100-113 RED; that
 * test pinned the contradiction as if it were the desired behaviour, and is updated with this change.
 * @param {{ windDownSignaled?:boolean, stopHookActive?:boolean, hasActiveClaim?:boolean, loopState?:string|null }} args
 * @returns {'signaled'|'second_stop'|'turn_end_with_claim_wakeup_scheduled'|'turn_end_wakeup_scheduled'|'turn_end_with_claim_no_wakeup'|'no_claim_idle'}
 */
function classifyWindDownReason({ windDownSignaled, stopHookActive, hasActiveClaim, loopState, armVerdict } = {}) {
  // STEP A — THE COUNTABLE IGNORE. A worker that reached a SECOND stop while still carrying no
  // arm evidence saw the reminder and stopped anyway. This is the population step A cannot save
  // (the anti-infinite-loop guard lets it through) and the exact population step C exists for.
  // Counted before 'signaled' so an announcement cannot mask it — announcing is what these
  // workers do INSTEAD of arming, and folding them into 'signaled' would hide the whole class.
  if (stopHookActive && armVerdict === 'unarmed' && hasActiveClaim) return 'second_stop_still_unarmed';
  if (windDownSignaled) return 'signaled';
  if (stopHookActive) return 'second_stop';
  if (loopState === LOOP_STATE_AWAITING_TICK) {
    return hasActiveClaim ? 'turn_end_with_claim_wakeup_scheduled' : 'turn_end_wakeup_scheduled';
  }
  return hasActiveClaim ? 'turn_end_with_claim_no_wakeup' : 'no_claim_idle';
}

/**
 * SD-LEO-INFRA-WORKER-WINDDOWN-SURVEY-001 (a), SD-LEO-INFRA-WIND-DOWN-SURVEY-001 (c): record WHY
 * this worker wound down.
 * (a) merge claude_sessions.metadata.wind_down = {reason, at, had_claim} (read-modify-merge,
 *     preserving sibling metadata keys), surfaced at re-engage by worker-checkin.
 * (c) mirror to the dedicated worker_wind_down_events table for fleet-wide stop-reason
 *     aggregation — NOT the shared feedback table (see SD-LEO-INFRA-WIND-DOWN-SURVEY-001: the
 *     feedback(category='wind_down_survey') mirror dominated 68.4% of feedback inflow with zero
 *     readers; this table exists so the data keeps its per-row fidelity while being structurally
 *     excluded from any human-facing table, rather than needing a 4th per-consumer exclusion
 *     list). KNOWN INTERIM GAP: worker_wind_down_events is a chairman-gated migration
 *     (database/migrations/20260821_worker_wind_down_events.sql) — until the chairman applies
 *     it, this insert fails (table does not exist) and is swallowed by the catch below exactly
 *     like any other failure: fail-open, stderr-logged, no row lands anywhere in the interim.
 * Best-effort / fail-open — any failure is logged and never blocks the stop.
 */
async function recordWindDown(supabase, sessionId, { reason, hadClaim } = {}) {
  const at = new Date().toISOString();
  // (a) metadata.wind_down merge — preserve existing metadata keys.
  try {
    const { data: row } = await supabase
      .from('claude_sessions')
      .select('metadata')
      .eq('session_id', sessionId)
      .maybeSingle();
    const metadata = { ...(row && row.metadata ? row.metadata : {}) };
    metadata.wind_down = { reason, at, had_claim: !!hadClaim };
    await supabase.from('claude_sessions').update({ metadata }).eq('session_id', sessionId);
  } catch (e) {
    process.stderr.write(`[stop-loop-wakeup-reminder] wind_down metadata (non-fatal): ${e.message}\n`);
  }
  // (c) fleet-wide aggregation mirror — dedicated table, not the shared feedback table.
  // dedup_key preserves the OLD emitFeedback dedup_key's exact "one row per session per
  // minute-bucket per reason — idempotent if the hook fires twice" contract; it is a plain
  // UNIQUE-constrained column (NOT a GENERATED column — to_char()/date_trunc() on a timestamptz
  // are STABLE, not IMMUTABLE, in Postgres, so a GENERATED expression using either is rejected;
  // caught live by scripts/probe-wind-down-events-migration.mjs), so it is computed here exactly
  // like the old dedup_key was.
  const dedupKey = `${sessionId}::${reason}::${at.slice(0, 16)}`;
  try {
    const { error } = await supabase
      .from('worker_wind_down_events')
      .insert({ session_id: sessionId, reason, had_claim: !!hadClaim, created_at: at, dedup_key: dedupKey, metadata: { session_id: sessionId, reason, had_claim: !!hadClaim, at } })
      .select('id')
      .single();
    // A dedup_key collision (23505) means the hook fired twice in the same minute for the same
    // session+reason — an EXPECTED idempotent no-op, not a real failure. Anything else is logged.
    if (error && error.code !== '23505') {
      process.stderr.write(`[stop-loop-wakeup-reminder] wind_down event insert (non-fatal): ${error.message}\n`);
    }
  } catch (e) {
    process.stderr.write(`[stop-loop-wakeup-reminder] wind_down event insert (non-fatal): ${e.message}\n`);
  }
}

/**
 * SD-LEO-INFRA-ROLE-BLIND-SESSION-001 FR-2.
 *
 * The head of this reminder is TRUE FOR ANY SESSION — the transcript is the only evidence of an
 * arm, regardless of seat. Only the tail below it is worker doctrine (claims, WIP pushes,
 * worktrees, the wind-down handshake, loop_state). Splitting them here so a role seat keeps the
 * check and loses only the vocabulary.
 *
 * The check itself is NOT role-gated, deliberately. The SD asks to keep the useful half, and
 * exempting role seats from the arming reminder would trade a noise bug for a silence bug — a
 * role seat that ends a turn unarmed goes just as quiet as a worker does.
 */
const REMINDER_HEAD = [
  'NO ScheduleWakeup tool_use found in THIS turn. This is read from the transcript, not from any',
  'state you set: saying "wakeup armed" in a /signal, or having loop_state=awaiting_tick, does NOT',
  'satisfy it. Only calling the tool does. If you believe you armed one, you armed it in a PREVIOUS',
  'turn — that is the stale-arm case this check exists to catch.',
];

/** Worker-only tail: every line here presumes a claim, a worktree, or the fleet belt. */
const REMINDER_WORKER_TAIL = [
  'Worker stopping with NO ScheduleWakeup armed — you will go INCOGNITO and strand your claimed SD',
  '(the worktree then gets reaped by the claim-sweep). Run the WIND-DOWN HANDSHAKE before you stop:',
  "  1. If you hold an IN-PROGRESS SD: FINISH it or hand it off — never leave it half-done + unclaimed (orphan).",
  // SD-FDBK-INFRA-AUTO-PUSH-WIP-001 (FR-3, merged from main 2026-06-10): push WIP FIRST so a
  // claim re-route can't orphan the commit.
  '  2. PUSH your WIP on the claim-bound branch FIRST (commit + git push, or `node scripts/prepark-wip.cjs`)',
  '     — pushing first means a sweep re-route resumes from your branch instead of orphaning the commit.',
  '  3. NOTIFY the coordinator you are winding down so it can use the grace window:',
  '       /signal feedback "winding down — finished <SD>, anything queued for me? idling ~180s"',
  '  4. Arm a SHORT grace ScheduleWakeup (~180s); on that tick RE-CHECK your inbox for a coordinator reply',
  '     BEFORE settling into the ~1200s idle cadence. (Short delay if work is in-flight, ~20min if truly idle.)',
  "  • To legitimately END the loop instead, set claude_sessions.loop_state='exited' for your session.",
];

/**
 * Role-seat tail. A role session holds no claim, has no worktree to reap and is not on the belt,
 * so none of the worker steps apply — but it still needs the arm, which is why this is a different
 * tail rather than an exemption.
 */
const REMINDER_ROLE_TAIL = [
  'This is a ROLE session (non_fleet): no claim, no worktree, no belt — the fleet wind-down',
  'handshake does not apply to you. What DOES apply: if your seat runs a loop, arm the next tick',
  'before you stop, or your loop simply ends here and nobody is watching for it.',
  '  • If ending deliberately is correct for your seat, that is a legitimate stop — say so and end.',
];

const REMINDER_FOOT = '(This reminder fires once — if you stop again it will let you through.)';

/** Compose the reminder for a seat. isRoleSession=true selects the role tail. */
function reminderFor(isRoleSession) {
  return [
    ...REMINDER_HEAD,
    ...(isRoleSession ? REMINDER_ROLE_TAIL : REMINDER_WORKER_TAIL),
    REMINDER_FOOT,
  ].join('\n');
}

// Preserved as the worker-seat reminder so existing importers and the static-pin regression tests
// keep the exact string they assert on. Changing this constant's meaning would be a silent break
// for anything that imports it.
const REMINDER = reminderFor(false);

/**
 * Run `fn` with process.stdout.write discarded, then restore it. Any diagnostic a transitively
 * required module prints is dropped rather than prepended to the Stop decision document. Restores
 * in a finally, so a throw inside `fn` cannot leave stdout muzzled for the decision write.
 */
function muzzleStdout(fn) {
  const original = process.stdout.write;
  process.stdout.write = SWALLOW;
  try {
    return fn();
  } finally {
    process.stdout.write = original;
  }
}

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

// TOTAL WORK BUDGET. The hook is registered with a 10s timeout, and a TIMED-OUT Stop hook returns
// NO DECISION — the enforcement silently vanishes exactly when the machine is loaded, which is the
// failure shape this whole SD exists to remove. MEASURED on CI 2026-08-02: the cheapest path (fail
// open, no transcript) took 7198ms against 412ms locally — a 17x spread on a runner whose
// node_modules probe was failing. If the CHEAPEST path costs 7.2s there, the block path (this
// budget + 3-5 DB round trips) would blow the timeout outright.
// So the hook bounds its own discretionary work instead of assuming the environment is fast: the
// stabilisation re-read gets whatever is LEFT of the budget after the DB calls, never a fixed 2.5s.
const HOOK_WORK_BUDGET_MS = 6000;
// Reserved OUT of the budget for the block-telemetry write, which the stabilisation re-read may
// not consume. Both are optional work, but they are not equally valuable: the re-read is
// OBSERVATIONAL (it refines a verdict that is already usable), while the block record is
// DECISION-CRITICAL — without it, second_stop_still_unarmed=0 cannot be told apart from "no block
// ever fired", and the step-C gate reverts to meaningless. Racing them for the same budget
// silently starved the more important one: MEASURED, the write got timed out at the cap.
const TELEMETRY_RESERVE_MS = 2500;

async function main() {
  const hookStartedAt = Date.now();
  const remainingBudgetMs = () => Math.max(0, HOOK_WORK_BUDGET_MS - (Date.now() - hookStartedAt));
  try {
    const flagEnabled = isFlagEnabled();
    if (!flagEnabled) { return shutdown(); }     // default-OFF fast path

    const payload = await readStdinPayload();
    const stopHookActive = payload.stop_hook_active === true;
    // SD-LEO-INFRA-WORKER-ENGAGEMENT-ARM-PARK-001: do NOT early-return on the second-stop allow-path.
    // The stop is allowed (shouldRemind returns false for stopHookActive), but we still flow through
    // to PARK the worker recoverable below — converting the cold-exit into a recoverable park.

    const sessionId = payload.session_id || process.env.CLAUDE_SESSION_ID || process.env.SESSION_ID || '';
    if (!sessionId) { return shutdown(); }       // can't resolve — fail-open

    // (stdout is muzzled at module load — see the header. This require is one of at least two
    // that print a dotenv banner; the park path carries another.)
    const { createSupabaseServiceClient } = require('../../lib/supabase-client.cjs');
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from('claude_sessions')
      .select('loop_state')
      .eq('session_id', sessionId)
      .maybeSingle();
    if (error) { return shutdown(); }            // DB error — fail-open

    const loopState = data ? data.loop_state : null;
    // Coverage-gap signal: does this session hold a live SD claim? A claim-holder whose
    // loop_state never entered the machine ('unknown'/null) is still a worker about to go
    // silent. Cheap single-row probe; fail-open (treat as no claim) on any error.
    let hasActiveClaim = false;
    try {
      const { data: claimRows } = await supabase
        .from('strategic_directives_v2')
        .select('sd_key')
        .eq('claiming_session_id', sessionId)
        .limit(1);
      hasActiveClaim = Array.isArray(claimRows) && claimRows.length > 0;
    } catch { /* fail-open: no claim signal */ }

    // ALLOW-PATH probe (SD-LEO-INFRA-LOOP-CONTINUITY-ENFORCE-001): did this session announce a
    // wind-down via /signal recently? session_coordination.sender_session = this session, and the
    // body/payload mentions wind-down/offline. If so, the stop is legitimate — do not block.
    let windDownSignaled = false;
    // KILL SWITCH (SD-LEO-INFRA-TERMINAL-RITUAL-ENFORCEMENT-001 FR-2): enforcement must be
    // disableable on a LIVE seat with no merge and no restart. Hooks run from each seat's own
    // worktree checkout, so an env/code flag cannot reach a running seat — only a DB read can.
    // It rides the SAME round-trip as the wind-down probe (widened or-filter), adding no call to
    // the Stop path, and FAILS OPEN TO OFF: unreadable switch ⇒ treat as disabled.
    let enforcementDisabled = true;
    try {
      const nowMs = Date.now();
      const sinceIso = new Date(nowMs - armEvidence.WIND_DOWN_WINDOW_MS).toISOString();
      const { data: coordRows, error: coordErr } = await supabase
        .from('session_coordination')
        .select('body, payload, created_at, target_sd, expires_at')
        .or(armEvidence.buildCoordinationFilter({ sessionId, sinceIso, nowIso: new Date(nowMs).toISOString() }))
        .order('created_at', { ascending: false })
        .limit(25);
      if (!coordErr) {
        const { killRows, senderRows } = armEvidence.partitionCoordinationRows(coordRows);
        enforcementDisabled = armEvidence.isEnforcementDisabled(killRows, { nowMs });
        // Scan ONLY this session's own rows: widening the query above changed this consumer's
        // input, and a broadcast row whose text mentions "winding down" must never flip this.
        windDownSignaled = armEvidence.recentSenderRows(senderRows, { nowMs, sessionId }).some((r) => {
          const blob = `${r.body || ''} ${JSON.stringify(r.payload || '')}`.toLowerCase();
          return /winding down|wind-down|going offline|offline —|going idle|signing off/.test(blob);
        });
      }
    } catch { /* fail-open: not-signaled, and enforcement stays DISABLED (safe direction) */ }

    // TWO-VERDICT OBSERVATION — measure the flush-race frequency BEFORE step A's decision
    // depends on it. Observe-only: nothing below reads these verdicts. Emitted to STDERR;
    // stdout stays byte-empty so the Stop decision channel is untouched.
    // Worker-gated, for the same reason the park is: an UNARMED verdict costs a ~2.5s stabilisation,
    // and a claim-less interactive operator ends most turns unarmed by design. Ungated, this would
    // add 2.5s to every operator turn-end to measure a population it is not in. Same predicate as
    // the park below, so the observation covers exactly the seats the enforcement will act on.
    const workerShaped = shouldParkRecoverable({ loopState, hasActiveClaim, windDownSignaled });
    let armVerdict;                       // undefined ⇒ not evaluated ⇒ treated as 'unknown'
    let armObservation = null;
    if (!enforcementDisabled && workerShaped && payload.transcript_path) {
      try {
        const fs = require('fs');
        const { readTailEntries } = require('./print-before-park.cjs');
        const read = () => {
          if (!fs.existsSync(payload.transcript_path)) return { verdict: 'unknown', reason: 'transcript absent', armCount: 0 };
          return armEvidence.findArmInCurrentTurn(readTailEntries(payload.transcript_path));
        };
        // Whatever is LEFT of the budget — the DB round-trips above already spent some of it.
        armObservation = await armEvidence.awaitStableVerdict({
          read,
          sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
          // Whatever the DB calls left, MINUS the telemetry reserve — this observational re-read
          // must not eat the budget the decision-critical block record needs.
          deadlineMs: Math.max(0, Math.min(2500, remainingBudgetMs() - TELEMETRY_RESERVE_MS)),
        });
        armVerdict = armObservation.stable && armObservation.stable.verdict;
        process.stderr.write(armEvidence.formatPendingWake(armObservation, { sessionId }));
      } catch (e) {
        // Fail-open: an unreadable transcript leaves armVerdict undefined ⇒ never blocks.
        process.stderr.write(`[stop-loop-wakeup-reminder] pending-wake observe (non-fatal): ${e.message}\n`);
      }
    }

    if (shouldRemind({ armVerdict, loopState, stopHookActive, flagEnabled, enforcementDisabled, hasActiveClaim })) {
      // BLOCK — the worker must arm its OWN ScheduleWakeup; do not park on its behalf (parking here
      // would let it cold-exit anyway by satisfying the recoverable-state check it should set itself).
      // The block reason is the ONLY channel that reaches the model, so the pending-wake state
      // rides here rather than on stderr (which the model never sees on a blocking Stop).
      const detail = armObservation ? `\n${armEvidence.formatPendingWake(armObservation, { sessionId }).trim()}` : '';
      // SD-LEO-INFRA-ROLE-BLIND-SESSION-001 FR-2: the CHECK is unchanged — shouldRemind above
      // still gates on claim/loop-state and still blocks. Only the doctrine text is selected by
      // seat. This is why a role seat previously had to set loop_state='exited' to escape: the
      // worker gate treats a live loop_state as worker-shape, and a role seat that runs a loop
      // has one. That escape is now unnecessary rather than merely unused.
      //
      // Read from the local identity file, not the DB: this runs inside the Stop budget after the
      // DB round-trips above have already spent most of it, and writeRoleStatusIdentity has
      // written role:true at role startup since ROLE-SESSION-NAMING-001. UNKNOWN falls back to the
      // worker tail — the ambiguous seat keeps the fuller guidance, per the SD's rule that
      // quieting a worker guard is worse than the noise it removes.
      let isRoleSeat = false;
      try {
        const rp = require('../../lib/fleet/role-status-identity.cjs');
        isRoleSeat = rp.verdictFromIdentityFile(rp.readIdentityFile(sessionId)) === rp.ROLE_VERDICT.ROLE;
      } catch { /* predicate unavailable -> worker tail, exactly as before this SD */ }
      emitDecision({ decision: 'block', reason: reminderFor(isRoleSeat) + detail });
      // RECORD THE BLOCK. Without this the step-C gate is UNINTERPRETABLE, and I only noticed
      // because I asked what state would silence it and whether anyone can reach that state.
      // 'second_stop_still_unarmed' requires TWO events: (1) a block fires, then (2) the worker
      // stops again still unarmed. Step (2) was recorded; step (1) was not. A zero therefore meant
      // EITHER "no block has ever fired, so (2) is unreachable" OR "blocks fire and every worker
      // complies" — opposite conclusions, indistinguishable, and I had been treating the zero as
      // evidence for the second. Recording the block makes the ratio readable: blocks>0 with
      // second_stop_still_unarmed=0 is genuine compliance; blocks=0 means the enforcement never
      // engages and the gate says nothing about step C at all.
      // Emitted AFTER the decision is already on stdout — but that ordering alone is NOT enough.
      // A hook killed at the 10s timeout returns no decision at all, so work done after the write
      // can still cost the decision it was meant to annotate. MEASURED: this write added ~1.9s
      // (3260ms -> 5146ms), which fits the 6s budget locally and would NOT fit on the CI-class
      // hardware that spent 7.2s on the cheapest path. So it is raced against whatever budget is
      // left: telemetry may be dropped, the decision may not.
      await Promise.race([
        recordWindDown(supabase, sessionId, { reason: 'blocked_unarmed', hadClaim: hasActiveClaim }),
        new Promise((r) => setTimeout(r, remainingBudgetMs())),
      ]);
      return shutdown();
    }
    // ALLOW-PATH (SD-LEO-INFRA-WORKER-ENGAGEMENT-ARM-PARK-001): the stop is allowed — windDownSignaled
    // (:83) or the second-stop (:78), or a non-worker session. If this is a WORKER that could strand
    // work, PARK it recoverable (loop_state='awaiting_tick' + capped expected_silence_until) so
    // coordinator-revival / orphan-adoption re-engages it, instead of a cold-exit to zero workers.
    if (workerShaped) {
      // SD-LEO-INFRA-WORKER-WIND-DOWN-001: before parking, attempt ONE same-turn next-claim for
      // the specific population that would otherwise sit idle-beside-claimable-work — a finisher
      // holding NO active claim. A claim-holder ending its turn (mid-work, or armed-with-claim)
      // must never be diverted into grabbing a second SD here.
      if (isSameTurnClaimEnabled() && shouldAttemptSameTurnClaim({ hasActiveClaim, workerShaped })) {
        const claimTimeoutMs = Math.max(0, remainingBudgetMs() - TELEMETRY_RESERVE_MS);
        const { outcome, key, resolution } = await attemptSameTurnNextClaim({
          resolveCheckinFn: require('../worker-checkin.cjs').resolveCheckin,
          sb: supabase,
          sessionId,
          timeoutMs: claimTimeoutMs,
        });
        // Exactly ONE log line either way — the "chose to exit vs never looked" instrument.
        process.stderr.write(`[same-turn-next-claim] ${outcome === 'claimed' ? `claimed:${key}` : 'none-claimable'}\n`);
        await Promise.race([
          recordSameTurnClaimAttempt(supabase, sessionId, { outcome, key }),
          new Promise((r) => setTimeout(r, remainingBudgetMs())),
        ]);
        // SECURITY finding 4711ebbc: resolveCheckin's roll-call step CONSUMES (acks) any
        // already-delivered coordinator message as a side effect of merely reading it — surface
        // whatever it returned or that delivery is lost, regardless of which branch we take below.
        const pendingMessages = resolution && Array.isArray(resolution.coordinator_messages) ? resolution.coordinator_messages : [];
        const messageDetail = formatCoordinatorMessagesForBlock(pendingMessages);
        if (outcome === 'claimed') {
          const detail = resolution && typeof resolution.message === 'string' ? `\n${resolution.message}` : '';
          emitDecision({ decision: 'block', reason: `SAME-TURN NEXT-CLAIM: claimed ${key} via the wind-down handshake — no idle gap. Continue building it now.${detail}${messageDetail}` });
          return shutdown();
        }
        if (messageDetail) {
          // Nothing claimable, but a coordinator message was just consumed by the checkin read —
          // block once to deliver it rather than letting the worker park having "seen" it in the
          // DB but never in its own context.
          emitDecision({ decision: 'block', reason: `SAME-TURN CHECKIN: nothing claimable, but the coordinator has message(s) for you.${messageDetail}` });
          return shutdown();
        }
      }
      await parkSessionRecoverable(sessionId, { armVerdict });
      // SD-LEO-INFRA-WORKER-WINDDOWN-SURVEY-001 (a)+(c): capture WHY this worker wound down
      // (same worker-gate as the park, so no false telemetry on a non-worker operator session).
      await recordWindDown(supabase, sessionId, {
        reason: classifyWindDownReason({ windDownSignaled, stopHookActive, hasActiveClaim, loopState, armVerdict }),
        hadClaim: hasActiveClaim,
      });
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

module.exports = { shouldRemind, shouldParkRecoverable, parkSessionRecoverable, classifyWindDownReason, recordWindDown, isFlagEnabled, muzzleStdout, SWALLOW, REMINDER, reminderFor, REMINDER_HEAD, REMINDER_ROLE_TAIL, REMINDER_WORKER_TAIL, isSameTurnClaimEnabled, shouldAttemptSameTurnClaim, attemptSameTurnNextClaim, recordSameTurnClaimAttempt, formatCoordinatorMessagesForBlock };
