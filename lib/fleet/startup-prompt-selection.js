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
 * Precedent: assessCanarySlotNaming (canary-provision.js:56) already returns a reasoned verdict
 * and is the RICHEST of the existing variants; the other two are byte-identical two-arm booleans.
 *
 * CORRECTION to an earlier note here, which claimed that function's caller "collapses the three
 * back to two". It does branch on `naming.ok`, but it interpolates `naming.reason` into the
 * warning it logs, so no information is lost — the caller DOES honour the richer shape.
 *
 * AND assessCanarySlotNaming IS NOT A DRIFTED COPY OF THIS FUNCTION — do not merge them. It asks
 * a different question in a different context: "is this CANARY SLOT named correctly", where the
 * slot is already known to be a canary. So "Charlie" is a MISCONFIGURATION to it and a perfectly
 * valid kind:'worker' here. Folding it into this classifier would conflate the two questions and
 * discard its slot-naming reason codes — consolidating toward the POORER contract, the exact
 * failure mode the consolidation was meant to avoid. Share the PREFIX, not the predicate.
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

/**
 * Resolve WHICH startup prompt a session should receive, keyed on the CALLSIGN NAMESPACE.
 *
 * SELECTION IS BY CALLSIGN, deliberately — NOT by role and NOT by account_profile:
 *   - role: canaries ARE role='worker', so role-keying hands every canary the worker directive.
 *     That is the trap this SD exists to close.
 *   - account_profile: absent on the bypass paths, and the stamp lands up to 10s after launch
 *     while a measured spawn registered at ~3s — the prompt fires AT registration, so the
 *     discriminator would not exist yet.
 * The callsign namespace is the only discriminator present on every path BEFORE launch.
 *
 * INTERIM BEHAVIOUR WHILE FR-8 IS OUTSTANDING — READ BEFORE "FIXING" THIS.
 * No canary startup prompt exists in the repo yet (verified: no CANARY_STARTUP_PROMPT /
 * FLEET_CANARY_PROMPT constant anywhere); authoring its CONTENT is a chairman decision, not an
 * implementer's. Until it lands, a canary or an unidentifiable session resolves to NULL — i.e.
 * it receives NO prompt and ghosts, which is exactly today's behaviour and is SAFE.
 * It must NEVER fall through to the worker prompt: that is the fleet-wide hazard (a canary that
 * self-claims DRAFT SDs unattended). Returning null preserves the safe status quo rather than
 * arming the hazard early, and the loud log makes the gap visible instead of silent.
 *
 * @param {unknown} callsign
 * @param {{ canaryPrompt?: (string|null), workerPrompt: string, logFn?: Function }} prompts
 * @returns {{ prompt: (string|null), kind: string, reason: (string|null) }}
 */
export function resolveStartupPromptForCallsign(callsign, prompts) {
  const { canaryPrompt = null, workerPrompt, logFn = console.warn } = prompts || {};
  const { kind } = classifySessionByCallsign(callsign);

  if (kind === 'worker') return { prompt: workerPrompt, kind, reason: null };

  if (kind === 'canary') {
    if (typeof canaryPrompt === 'string' && canaryPrompt.length > 0) {
      return { prompt: canaryPrompt, kind, reason: null };
    }
    logFn(`[startup-prompt] canary ${String(callsign)} gets NO prompt: no canary prompt exists yet (FR-8). `
      + 'Deliberately NOT falling back to the worker directive — that would make the canary self-claim.');
    return { prompt: null, kind, reason: 'no_canary_prompt_available' };
  }

  // UNIDENTIFIABLE — the arm a boolean predicate silently maps to "worker". Fail loud, deliver
  // nothing. An unidentified session that receives the worker directive starts claiming work.
  logFn('[startup-prompt] UNIDENTIFIABLE session (no usable callsign) gets NO prompt. '
    + 'Refusing to default to the worker directive; an unidentified session must not claim work.');
  return { prompt: null, kind, reason: 'unidentifiable_session' };
}

export default {
  classifySessionByCallsign, isCanaryCallsign, assertSingleLinePrompt,
  resolveStartupPromptForCallsign, MultilinePromptError, CANARY_CALLSIGN_PREFIX,
};
