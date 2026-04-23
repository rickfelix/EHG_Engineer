/**
 * lib/protocol-policies/claim-ownership-mode.js
 *
 * SD-LEO-INFRA-LEO-PROTOCOL-POLICY-001 (FR-002, Part A2)
 *
 * Classifies the intended claim-ownership mode for a subprocess invocation
 * (handoff.js, sd-start.js, etc.). Call sites use the returned mode to decide
 * whether to release the claim on exit.
 *
 * Background: handoff.js execute historically releases the claim on process
 * exit, which breaks workflows where the caller session owns the claim and
 * invokes handoff.js as a subprocess (memory: feedback_handoff_releases_claim.md).
 * The fix is not in this module — it is in the handoff.js call site that
 * consults this policy. This module defines *when* cooperative mode applies;
 * the handoff.js migration (FR-007) will make the behavior match.
 *
 * Design constraints (TR-001):
 *   - Pure function, no DB / fs / env reads inside the policy itself.
 *   - All inputs explicit via opts. Callers that want to read env do so
 *     before calling this function and pass the result in.
 *   - Safe default: 'exclusive' (traditional behavior — acquire + release).
 *     This preserves current semantics when inputs are ambiguous.
 */

/** Ownership mode constants. */
export const OWNERSHIP_MODE = Object.freeze({
  /** Acquire a new claim (or contest a stale one); release on exit. */
  EXCLUSIVE: 'exclusive',
  /** Operate under the caller's existing claim; do NOT release on exit. */
  COOPERATIVE: 'cooperative',
});

const VALID_MODES = new Set([OWNERSHIP_MODE.EXCLUSIVE, OWNERSHIP_MODE.COOPERATIVE]);

/**
 * Resolve the ownership mode for this subprocess invocation.
 *
 * Rule priority:
 *   1. If opts.explicit is 'exclusive' or 'cooperative', use it verbatim
 *      (caller-specified override — e.g., a CLI flag).
 *   2. If opts.callerSessionId is present AND equals opts.existingClaimSessionId,
 *      return 'cooperative' — we are a subprocess of the claim owner.
 *   3. Otherwise return 'exclusive' (safe default — matches current behavior).
 *
 * @param {Object} [opts]
 * @param {'exclusive'|'cooperative'|null|undefined} [opts.explicit]
 *   Explicit mode override. Invalid values are ignored (falls through to rules).
 * @param {string|null|undefined} [opts.callerSessionId]
 *   Session ID of the process that invoked this subprocess (typically
 *   process.env.CLAUDE_SESSION_ID at the call site).
 * @param {string|null|undefined} [opts.existingClaimSessionId]
 *   Session ID currently holding the claim in the DB, if any.
 * @returns {'exclusive'|'cooperative'}
 */
export function resolveOwnershipMode(opts) {
  const explicit = opts?.explicit;
  if (typeof explicit === 'string' && VALID_MODES.has(explicit)) {
    return explicit;
  }

  const caller = typeof opts?.callerSessionId === 'string' && opts.callerSessionId.length > 0
    ? opts.callerSessionId
    : null;
  const holder = typeof opts?.existingClaimSessionId === 'string' && opts.existingClaimSessionId.length > 0
    ? opts.existingClaimSessionId
    : null;

  if (caller && holder && caller === holder) {
    return OWNERSHIP_MODE.COOPERATIVE;
  }

  return OWNERSHIP_MODE.EXCLUSIVE;
}

/**
 * Convenience: should the caller release the claim on process exit?
 *
 * @param {'exclusive'|'cooperative'} mode
 * @returns {boolean}
 */
export function shouldReleaseOnExit(mode) {
  return mode === OWNERSHIP_MODE.EXCLUSIVE;
}
