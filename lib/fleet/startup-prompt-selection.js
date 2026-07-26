// SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-D — startup-prompt selection + the newline
// tripwire. Pure module: no IO, no spawn, no DB. Both prompt-decision helpers call INTO this.
//
// WHY THIS MODULE EXISTS SEPARATELY FROM THE LAUNCH BUILDER: assertLaunchContract
// (build-session-launch.cjs:157) has ZERO production callers — verified — so a tripwire placed
// there ships INERT, a tripwire in dead code. Everything here is reachable from all THREE
// prompt-decision sites (spawn-control.js:163, reboot-respawn-runner.js:155,
// scripts/fleet/worker-spawn-executor.cjs:154), which is the only way it can actually fire.

/** The canary-only callsign namespace. Mirrors CANARY_CALLSIGN_PREFIX in spawn-control.js:48,
 *  canary-guard.js:27 and canary-provision.js:29 — four declarations exist and have drifted;
 *  consolidation is tracked separately so this module does not import across a cycle. */
export const CANARY_CALLSIGN_PREFIX = 'Canary-';

/**
 * THREE-ARM classification of a session by CALLSIGN NAMESPACE.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE SIMPLIFYING TO A BOOLEAN. The two-arm version looks cleaner and IS THE BUG.
 *
 * A boolean returns FALSE for a session that cannot be identified at all — and false means
 * "not a canary", which hands that session the CLAIMING WORKER directive. So the fallthrough
 * direction is the DANGEROUS one: an unidentifiable session does not idle, it starts claiming
 * DRAFT SDs unattended. That is the exact fleet-wide hazard this SD exists to prevent, and it
 * is invisible in a boolean because both "definitely a worker" and "no idea what this is"
 * collapse to the same value.
 *
 * Hence three arms, and hence 'unidentifiable' must FAIL LOUD at the call site rather than
 * defaulting. A later reviewer collapsing this back to Boolean(...) reintroduces the hazard
 * silently — this comment is the only thing standing in the way.
 *
 * Precedent: assessCanarySlotNaming (canary-provision.js:56-63) already returns three outcomes
 * and is the RICHEST of the four existing copies; the other two are byte-identical two-arm
 * booleans. Note that its own caller at :143 does `if (naming.ok)`, which collapses the three
 * back to two — so having the shape is not enough, the CALLER must honour it.
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * @param {unknown} callsign
 * @returns {{kind:'canary'|'worker'|'unidentifiable', callsign: (string|null)}}
 */
export function classifySessionByCallsign(callsign) {
  if (typeof callsign !== 'string' || callsign.trim() === '') {
    return { kind: 'unidentifiable', callsign: null };
  }
  const trimmed = callsign.trim();
  if (trimmed.startsWith(CANARY_CALLSIGN_PREFIX)) return { kind: 'canary', callsign: trimmed };
  return { kind: 'worker', callsign: trimmed };
}

/** Derived boolean, for call sites that genuinely only need the canary test. DERIVED FROM the
 *  three-outcome shape, never the reverse — see the header. Deliberately does NOT accept
 *  'unidentifiable' as a canary, so it is unsafe to use for the prompt DECISION; use
 *  classifySessionByCallsign there and handle all three arms. */
export function isCanaryCallsign(callsign) {
  return classifySessionByCallsign(callsign).kind === 'canary';
}

/** Thrown by assertSingleLinePrompt. Named so callers can distinguish it from an IO failure. */
export class MultilinePromptError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'MultilinePromptError';
    this.details = details;
  }
}

/**
 * THE NEWLINE TRIPWIRE — the most-wanted deliverable of this SD.
 *
 * FAILS LOUD if a prompt destined for the launcher's trailing positional contains a newline.
 *
 * WHY: claude.cmd is a BATCH file, so cmd.exe is unavoidable in the chain, and cmd.exe
 * TERMINATES A MULTI-LINE ARGUMENT AT THE FIRST LF. Measured on the live constant:
 * FLEET_WORKER_STARTUP_PROMPT is 1406 chars / 8 lines, its first line is 85 chars, so 94% is
 * discarded in transit and the worker directive degrades to a /loop with ZERO steps — after
 * which every worker falls back to CLAUDE.md and starts claiming DRAFT SDs, unattended and
 * fleet-wide. wt.exe is also in the chain and re-parses the commandline; nobody has verified it
 * preserves embedded newlines either.
 *
 * This throws rather than returning a verdict deliberately: the sibling contract checker
 * returns {ok, violations} and has no production callers, so a soft verdict here would be
 * discarded exactly like that one is. A hard failure at spawn time is recoverable; a silently
 * truncated fleet directive is not.
 *
 * @param {string} prompt
 * @param {{ where?: string }} [ctx] call-site label, surfaced in the error
 * @returns {string} the prompt, unchanged, when it is safe
 */
export function assertSingleLinePrompt(prompt, ctx = {}) {
  const where = ctx.where || 'unknown call site';
  if (typeof prompt !== 'string') {
    throw new MultilinePromptError(
      `startup prompt must be a string before it reaches the launcher positional (${where}); got ${typeof prompt}`,
      { where, type: typeof prompt },
    );
  }
  const idx = prompt.search(/[\r\n]/);
  if (idx !== -1) {
    const lines = prompt.split(/\r\n|\r|\n/);
    throw new MultilinePromptError(
      `startup prompt contains a newline at index ${idx} and would be TRUNCATED BY cmd.exe at the first LF `
      + `(${where}): ${prompt.length} chars / ${lines.length} lines would deliver only ${lines[0].length} chars. `
      + 'Pass a single-line pointer instead of the multi-line prompt.',
      { where, index: idx, totalChars: prompt.length, totalLines: lines.length, deliveredChars: lines[0].length },
    );
  }
  return prompt;
}

export default {
  classifySessionByCallsign, isCanaryCallsign, assertSingleLinePrompt,
  MultilinePromptError, CANARY_CALLSIGN_PREFIX,
};
