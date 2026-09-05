/**
 * terminal-session-update — the SHARED write-side chokepoint for retiring a claude_sessions row.
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-E (FR-1).
 *
 * THE DEFECT THIS CLOSES. ~24 distinct claude_sessions write sites set `status` to a terminal/stale
 * value ('released', 'stale') without ever writing `is_alive:false` in the same statement (Explore
 * census 6b44c537). The read-time reader (lib/fleet/session-liveness.cjs) was already fixed to deny
 * a stale raw is_alive for these two statuses, but the durable fix is at the WRITE side: a session
 * that is genuinely retired should say so on both columns, not rely on the reader to compensate.
 *
 * WHY A SHARED BUILDER, NOT 24 INDEPENDENT EDITS. PLAN-phase testing-agent (bb6a3a1f) found this is
 * strictly stronger than editing each call site's object literal in place: a future writer #25 is
 * correct BY DEFAULT if it routes through here, which per-writer edits cannot guarantee. It also
 * doubles as the census-completeness surface — see requireTerminalSessionUpdateOrigin below.
 *
 * CJS so every caller (CJS scripts, and ESM modules via createRequire interop — the same pattern
 * lib/fleet/session-liveness.cjs already documents and relies on) can require() it uniformly.
 *
 * Deliberately does NOT cover status='idle' (unclaim, not retire) or 'active' — those are not
 * terminal states and must never carry is_alive:false.
 */

const TERMINAL_STATUSES = Object.freeze(['released', 'stale']);

/**
 * Build the payload for a claude_sessions UPDATE that retires a row to a terminal/stale status.
 * Always includes is_alive:false alongside the caller's other fields — the caller cannot construct
 * a terminal-status payload that omits it.
 *
 * @param {'released'|'stale'} status - must be one of TERMINAL_STATUSES; anything else throws, so a
 *   caller cannot silently misuse this for a non-terminal transition (use a plain object literal for
 *   status:'idle'/'active' writes — those are out of this chokepoint's scope by design).
 * @param {object} [extraFields] - the writer's own additional columns (released_at, released_reason,
 *   sd_key: null, etc.) — spread AFTER status/is_alive so a caller cannot accidentally override either.
 * @returns {{status: string, is_alive: false, [key: string]: any}}
 */
function terminalSessionUpdate(status, extraFields = {}) {
  if (!TERMINAL_STATUSES.includes(status)) {
    throw new Error(`terminalSessionUpdate: status must be one of ${TERMINAL_STATUSES.join('/')}, got ${JSON.stringify(status)}`);
  }
  return { ...extraFields, status, is_alive: false };
}

/**
 * For a caller whose target status is decided at RUNTIME and may or may not be terminal (a common
 * shape in this codebase: `const targetStatus = cond ? 'idle' : 'released'`). Routes through
 * terminalSessionUpdate() only when the resolved status is actually terminal; otherwise a plain
 * merge with no is_alive write, matching a non-terminal status's existing contract.
 *
 * @param {string} status - the resolved status, terminal or not.
 * @param {object} [extraFields]
 * @returns {{status: string, [key: string]: any}}
 */
function sessionStatusUpdate(status, extraFields = {}) {
  return TERMINAL_STATUSES.includes(status)
    ? terminalSessionUpdate(status, extraFields)
    : { ...extraFields, status };
}

module.exports = { terminalSessionUpdate, sessionStatusUpdate, TERMINAL_STATUSES };
