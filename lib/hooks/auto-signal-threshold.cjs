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
 * Fires EXACTLY ONCE per signature escalation — on the 2nd-attempt crossing (the warn tier). The
 * 3rd attempt hard-blocks (handled by the hook) and must NOT re-signal (dedupe by exact ===2).
 *
 * @param {{ attempts:number, sessionId?:string, env?:object }} opts
 * @returns {boolean}
 */
function shouldEmitAutoSignal({ attempts, sessionId, env = process.env } = {}) {
  if (env && env.LEO_AUTO_SIGNAL === 'off') return false;        // kill-switch
  if (!sessionId || sessionId === 'unknown') return false;       // need a real worker identity
  if (!Number.isInteger(attempts)) return false;
  return attempts === 2;                                          // once, on the crossing (not >=2)
}

/**
 * Build the argv for `node scripts/worker-signal.cjs <type> "<body>" --severity <sev>`. Reuses the
 * canonical signal CLI (no re-implementation of the session_coordination row shape the router keys
 * on). Type 'stuck' = recurrence/blocked; severity 'high' (a 2nd-attempt recurrence is one repeat
 * from a hard block). Body is single-line + bounded.
 *
 * @param {{ toolName:string, signature:string, attempts:number, sdKey?:string }} opts
 * @returns {string[]} argv after the script path (e.g. ['stuck', '<body>', '--severity', 'high'])
 */
function buildAutoSignalArgs({ toolName, signature, attempts, sdKey } = {}) {
  const sig = String(signature == null ? '' : signature).replace(/\s+/g, ' ').slice(0, 120);
  const body =
    `AUTO-SIGNAL (enforcement-layer RCA recurrence): ${toolName || 'tool'} repeated ${attempts}x on ` +
    `signature "${sig}"${sdKey ? ' (SD ' + sdKey + ')' : ''} without intervening RCA — next repeat ` +
    `hard-blocks. Auto-escalated per SD-LEO-INFRA-THRESHOLD-AUTO-SIGNAL-001 (worker may be stuck).`;
  return ['stuck', body, '--severity', 'high'];
}

module.exports = { shouldEmitAutoSignal, buildAutoSignalArgs };
