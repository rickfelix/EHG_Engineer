/**
 * Auto-signal threshold decision — SD-LEO-INFRA-THRESHOLD-AUTO-SIGNAL-001 (FR-1).
 *
 * Workers systematically UNDER-escalate: the /signal recurrence thresholds (gate-2x, RCA-2x,
 * claim-release) are PROMPT-ADVISORY, so Opus defaults to the lowest-friction path and the live
 * signal loses. This module makes the ENFORCEMENT LAYER decide — deterministically — when to
 * auto-emit a /signal at the RCA recurrence threshold, removing worker discretion.
 *
 * PURE (no I/O): the pre-tool-enforce hook calls shouldEmitAutoSignal() at the RCA tiered-enforcement
 * crossing and, when true, fire-and-forget spawns worker-signal.cjs with buildAutoSignalArgs().
 * Kept in its own module (not inline in the hot-path hook) so it is unit-testable WITHOUT importing
 * the hook (which would execute the enforcement pipeline on require).
 *
 * SAFETY CONTRACT (enforced by the caller): the emission is fire-and-forget (detached + unref, never
 * awaited), env-disableable (LEO_AUTO_SIGNAL=off), and wrapped fail-open so it can NEVER block or
 * throw into a tool call. This module only decides + formats; it performs no I/O.
 */

'use strict';

/**
 * Should the enforcement layer auto-emit a /signal at this RCA recurrence attempt?
 * Fires EXACTLY ONCE per signature escalation — on the 3rd SAME-signature repeat (a genuine
 * stuck-retry at the hard-block). The per-signature counter (retry-state-manager) means this is the
 * same command tried 3 times, NOT 3 distinct commands — so dedupe is by exact ===3.
 *
 * SD-LEO-INFRA-THRESHOLD-AUTO-SIGNAL-OVERFIRE-001 (a): raised the threshold from ===2 to ===3. The
 * 2nd-crossing emit OVER-FIRED — a single recurrence is one repeat from a hard block, not yet a stuck
 * loop — flooding the coordinator inbox and drowning real signals. (b): coordinator / Adam /
 * monitoring-cadence sessions benignly re-run the same script every tick and trip the counter; they
 * must NEVER auto-signal STUCK. The caller classifies the session (is_coordinator / role=adam /
 * known cadence script) and passes `isCoordinatorSession`; this module stays PURE (no I/O).
 *
 * SD-LEO-INFRA-RCA-AUTOSIGNAL-FALSE-POSITIVE-001 (Control 3): re-scope the emit to genuine
 * no-progress. The caller computes `progressStalled` (phase/percent unchanged across the
 * repetition) from the already-loaded unified-session-state. When `progressStalled === false`
 * (the session is demonstrably advancing) the signal is suppressed even at the crossing;
 * `undefined` preserves the fire-on-crossing behavior (back-compat).
 *
 * @param {{ attempts:number, sessionId?:string, progressStalled?:boolean, isCoordinatorSession?:boolean, env?:object }} opts
 * @returns {boolean}
 */
function shouldEmitAutoSignal({ attempts, sessionId, progressStalled, isCoordinatorSession, env = process.env } = {}) {
  if (env && env.LEO_AUTO_SIGNAL === 'off') return false;        // kill-switch
  if (!sessionId || sessionId === 'unknown') return false;       // need a real worker identity
  if (isCoordinatorSession === true) return false;               // (b) exempt coordinator/Adam/cadence
  if (!Number.isInteger(attempts)) return false;
  if (progressStalled === false) return false;                   // Control 3: real progress → not stuck
  return attempts === 3;                                          // (a) once, on the 3rd same-signature repeat
}

/**
 * Build the argv for `node scripts/worker-signal.cjs <type> "<body>" --severity <sev>`. Reuses the
 * canonical signal CLI (no re-implementation of the session_coordination row shape the router keys
 * on). Type 'stuck' = recurrence/blocked; severity 'high' (a 2nd-attempt recurrence is one repeat
 * from a hard block). Body is single-line + bounded.
 *
 * QF-20260803-596: `signature` alone is an opaque hash for Bash ('Bash:<sha256 prefix>'), so a
 * receiving worker with no matching local activity at that moment could not tell what had
 * repeated, or answer the RCA request at all — reported by a worker who could only respond
 * because a coincidental commit let him correlate the signal timestamp against his own log.
 * `commandText`/`occurredAt` (from retry-state-manager's recordAndCount) put the actual repeated
 * command and the real occurrence timestamps in the payload; both are optional so a caller
 * without them (or a non-Bash tool) still gets the pre-existing signature-only body. Secret
 * redaction happens downstream in worker-signal.cjs (M1), which applies to the whole body
 * regardless of source, so no redaction is duplicated here.
 *
 * @param {{ toolName:string, signature:string, attempts:number, sdKey?:string,
 *   commandText?:string, occurredAt?:string[] }} opts
 * @returns {string[]} argv after the script path (e.g. ['stuck', '<body>', '--severity', 'high'])
 */
function buildAutoSignalArgs({ toolName, signature, attempts, sdKey, commandText, occurredAt } = {}) {
  const sig = String(signature == null ? '' : signature).replace(/\s+/g, ' ').slice(0, 120);
  const cmdPart = commandText
    ? ` — repeated command: "${String(commandText).replace(/\s+/g, ' ').slice(0, 200)}"`
    : '';
  const timesPart = Array.isArray(occurredAt) && occurredAt.length > 0
    ? ` at [${occurredAt.join(', ')}]`
    : '';
  const body =
    `AUTO-SIGNAL (enforcement-layer RCA recurrence): ${toolName || 'tool'} repeated ${attempts}x on ` +
    `signature "${sig}"${sdKey ? ' (SD ' + sdKey + ')' : ''}${cmdPart}${timesPart} without intervening ` +
    `RCA — next repeat hard-blocks. Auto-escalated per SD-LEO-INFRA-THRESHOLD-AUTO-SIGNAL-001 (worker may be stuck).`;
  return ['stuck', body, '--severity', 'high'];
}

/**
 * SD-LEO-INFRA-SIGNAL-THRESHOLD-AUTO-EMIT-001 (FR-1): the GATE-2x enforcement-site decision —
 * the documented follow-up to the RCA-2x threshold above. Same safety contract: kill-switch, real-
 * identity guard, fires EXACTLY ONCE on the 2nd gate-retry crossing (retryCount===2). The caller
 * (the BaseExecutor gate-retry loop) fire-and-forget spawns worker-signal.cjs when this returns true.
 * Workers under-escalate at gate recurrence because the threshold is prompt-advisory; moving the
 * DETECTION into the handoff enforcement loop removes that discretion (mirrors SUBAGENT_EVIDENCE_MISSING).
 *
 * @param {{ retryCount:number, sessionId?:string, env?:object }} opts
 * @returns {boolean}
 */
function shouldEmitGateAutoSignal({ retryCount, sessionId, env = process.env } = {}) {
  if (env && env.LEO_AUTO_SIGNAL === 'off') return false;        // kill-switch
  if (!sessionId || sessionId === 'unknown') return false;       // need a real worker identity
  if (!Number.isInteger(retryCount)) return false;
  return retryCount === 2;                                        // once, on the 2nd-retry crossing
}

/**
 * Build the argv for the gate-2x /signal. Reuses the canonical worker-signal.cjs CLI. Type 'stuck'
 * (the worker is stuck on a recurring gate failure — one retry from exhaustion); severity 'high'.
 * Body is single-line + bounded.
 *
 * @param {{ gateName?:string, sdKey?:string, retryCount?:number }} opts
 * @returns {string[]} argv after the script path (e.g. ['stuck', '<body>', '--severity', 'high'])
 */
function buildGateAutoSignalArgs({ gateName, sdKey, retryCount } = {}) {
  const gate = String(gateName == null ? '' : gateName).replace(/\s+/g, ' ').slice(0, 80) || 'a gate';
  const n = Number.isInteger(retryCount) ? retryCount : 2;
  const body =
    `AUTO-SIGNAL (enforcement-layer gate recurrence): gate "${gate}" failed ${n}x during handoff` +
    `${sdKey ? ' (SD ' + sdKey + ')' : ''} — auto-retries near exhaustion. Auto-escalated per ` +
    `SD-LEO-INFRA-SIGNAL-THRESHOLD-AUTO-EMIT-001 (worker may be stuck on a failing gate).`;
  return ['stuck', body, '--severity', 'high'];
}

/**
 * Should ENFORCEMENT 11 (RCA tiered enforcement) hard-block this tool call?
 * SD-LEO-INFRA-RCA-ENFORCEMENT-PROGRESS-STALL-NOT-REPETITION-001: the hard block previously
 * gated on bare `attempts >= 3` alone, so a repeated command that was demonstrably making
 * progress (a different migration file each time, an advancing session phase/percent) got
 * hard-blocked exactly like a genuine stuck retry-loop. `progressStalled` (already computed by
 * retry-state-manager's Control 3 fingerprint and already used to suppress the AUTO-SIGNAL
 * above) is now also consulted for the block itself: `progressStalled === false` (the session
 * is demonstrably advancing) suppresses the hard block even at attempts>=3 — the repetition
 * falls through to the existing Tier-1 advisory warning instead of exit(2). `true` or
 * `undefined` (no fingerprint available — fail-closed, same as every other uncertain-state path
 * in this hook) preserves the exact pre-existing block behavior, so a real stuck loop is never
 * let through.
 *
 * PURE (no I/O) — kept alongside shouldEmitAutoSignal so it's unit-testable without executing
 * the hook, per this module's existing pattern.
 *
 * @param {{ attempts:number, bypassed?:boolean, progressStalled?:boolean }} opts
 * @returns {boolean}
 */
function shouldHardBlock({ attempts, bypassed, progressStalled } = {}) {
  if (!Number.isInteger(attempts) || attempts < 3) return false;
  if (bypassed === true) return false;
  if (progressStalled === false) return false; // demonstrably advancing → not a stuck loop
  return true;
}

/**
 * Compute the Control-3 progress fingerprint (claimed SD + phase + progress), or `undefined`
 * when there is no real progress signal to track.
 *
 * SD-LEO-INFRA-RCA-READONLY-GH-VERBS-001: previously this was inlined at pre-tool-enforce.cjs
 * with `?? ''` fallbacks that ALWAYS produced a string, degenerating to the CONSTANT `'::'` for
 * every no-SD-claimed session (coordinator/Adam/monitoring loops — exactly the population that
 * polls CI most). recordAndCount (retry-state-manager.cjs) WRITES that constant as the stored
 * baseline the first time a repeated signature is seen. If the SAME session later claims an SD,
 * the next real fingerprint differs from the stale `'::'` baseline → progressStalled reads
 * `false` (demonstrable progress) → shouldHardBlock/shouldEmitAutoSignal above are SUPPRESSED on
 * a command that may still be genuinely stuck. This is teeth erosion via a one-time coincidental
 * state transition, not a harmless no-op.
 *
 * Returns `undefined` (never a degenerate string) when `claimedSdKey` is falsy or `progress` is
 * not a genuine finite number. recordAndCount already treats a non-string progressFingerprint as
 * "no signal" (its own `typeof === 'string'` guard skips Control 3 entirely), so no baseline is
 * ever written while unclaimed — closing the defect at the source rather than downstream.
 *
 * PURE (no I/O) — extracted here (not left inline in pre-tool-enforce.cjs) specifically so it is
 * unit-testable without executing the hook, mirroring shouldHardBlock/shouldEmitAutoSignal above.
 *
 * @param {{ claimedSdKey?: string|null, phase?: string|null, progress?: number|null|undefined }} opts
 * @returns {string|undefined}
 */
function computeProgressFingerprint({ claimedSdKey, phase, progress } = {}) {
  if (!claimedSdKey || typeof progress !== 'number' || !Number.isFinite(progress)) return undefined;
  return `${claimedSdKey}:${phase ?? ''}:${progress}`;
}

module.exports = { shouldEmitAutoSignal, buildAutoSignalArgs, shouldEmitGateAutoSignal, buildGateAutoSignalArgs, shouldHardBlock, computeProgressFingerprint };
