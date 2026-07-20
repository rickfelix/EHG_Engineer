/**
 * Fleet launcher SESSION VIEW — terminal detail-pane view-model, SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-B
 * (Child B of the mockup #2 chairman-ratified session-view orchestrator).
 *
 * @wire-check-exempt: this repo (EHG_Engineer) is backend/control-plane only -- there is no UI
 * shell to wire into yet (mirrors sibling -A's identical framing). This module ships the tested
 * building block a future fleet launcher backend route will call once that shell exists.
 *
 * PURE CORE (data-in / view-model-out, no DB/IO), patterned directly on session-watchdog.js's
 * classifyWatchdogState() convention: a caller (future UI route, or a CLI script) does the fetching
 * -- one claude_sessions read, a best-effort context_usage_log read, and the attach() call -- and
 * passes the results in here.
 *
 * KNOWN, DELIBERATE SCOPE CUTS (see PRD FR-3/FR-4 for the "why"):
 *   - ctxPercent is read from context_usage_log directly (never the fleet-wide get_context_usage_summary
 *     RPC, which has no session_id grain) and resolves to null whenever a row isn't available -- the
 *     table's session_id join is live-confirmed STARVED in production today; that starvation is a
 *     separate, out-of-scope concern this module fails soft around, not fixes.
 *   - "action history" is scoped to the single MOST RECENT action (lastTool/lastToolAt/lastActivityKind)
 *     -- no multi-entry scrollback exists anywhere in the fleet namespace (coordination_events is a
 *     general fleet-event log, not per-session tool-call history); a true scrollback is a separate,
 *     larger future SD (new append-only table + a writer wired into every session's tool loop).
 *
 * SECURITY NOTE for the eventual consumer (SECURITY review, EXEC-TO-PLAN, PASS-WITH-NOTES): every
 * field here is machine-generated telemetry (DB-enum-constrained or numeric/timestamp), never raw
 * end-user text -- but `lastTool` (claude_sessions.current_tool) has no DB CHECK constraint, and
 * `attachState.reason` is passed through without type-narrowing if a non-attach()-shaped result is
 * ever fed in. The future UI route MUST HTML-escape lastTool/lastActivityKind/attachState.reason at
 * the render boundary and MUST enforce its own authorization before calling buildSessionDetailView
 * for a given session -- this module has no auth/RLS logic by design (pure function).
 */

/** Human-readable, degraded-state messages per lib/fleet/spawn-control.js attach()'s real reason values. */
const ATTACH_REASON_MESSAGES = Object.freeze({
  no_key: 'No session identifier provided to resolve.',
  not_found: 'Session not found — it may have ended or the identifier is wrong.',
  ambiguous: 'Multiple sessions matched this identifier — cannot resolve a single target.',
  no_captured_handle: 'Terminal window handle was never captured for this session.',
  stale_handle: 'Terminal window handle is stale — focusing the window failed.',
});

/**
 * Map spawn-control.js's attach() result into a display-ready degraded-state descriptor.
 * attach() returns { ok, reason, session_id } where reason (on failure) is one of the BARE strings
 * 'no_key' | 'not_found' | 'ambiguous' (session resolution failures, from session-registry.js) |
 * 'no_captured_handle' | 'stale_handle' -- never a 'not_resolved:*'-prefixed string (that prefix only
 * ever appears in spawn-control's internally-emitted coordination event, not the returned object).
 *
 * `undefined`/`null` input means attach was never attempted for this view -- deliberately distinct
 * from a genuine failure (ok:null, not ok:false).
 *
 * @param {{ok?:boolean, reason?:string|null, session_id?:string|null}|null|undefined} attachResult
 * @returns {{ ok:boolean|null, reason:string|null, degraded:boolean, message:string|null }}
 */
export function mapAttachState(attachResult) {
  if (!attachResult) return { ok: null, reason: null, degraded: false, message: null };
  const { ok = false, reason = null } = attachResult;
  if (ok) return { ok: true, reason: null, degraded: false, message: null };
  // ADVERSARIAL-REVIEW FIX: a plain-object lookup walks the prototype chain, so a `reason` of
  // 'toString'/'constructor'/'__proto__'/etc. would silently return an inherited function/object
  // instead of the promised string fallback. Object.hasOwn() restricts the lookup to the map's own
  // keys so any non-listed reason (known-shape or adversarial) always falls through to the fallback.
  const message = (typeof reason === 'string' && Object.hasOwn(ATTACH_REASON_MESSAGES, reason))
    ? ATTACH_REASON_MESSAGES[reason]
    : 'Attach failed for an unrecognized reason.';
  return { ok: false, reason: reason ?? null, degraded: true, message };
}

/**
 * Build the terminal detail-pane view-model for one session. Pure: performs no DB/IO itself.
 * @param {{current_tool?:string|null, last_tool_at?:string|null, last_activity_kind?:string|null,
 *           expected_silence_until?:string|null}} session - a claude_sessions-shaped row
 * @param {{ ctxRow?:{usage_percent?:number}|null, attachResult?:object|null }} [opts]
 * @returns {{ ctxPercent:number|null, lastTool:string|null, lastToolAt:string|null,
 *             lastActivityKind:string|null, silentUntil:string|null,
 *             attachState:{ok:boolean|null, reason:string|null, degraded:boolean, message:string|null} }}
 */
export function buildSessionDetailView(session, opts = {}) {
  const s = session || {};
  const { ctxRow, attachResult } = opts || {};
  const rawPct = ctxRow && ctxRow.usage_percent;
  // ADVERSARIAL-REVIEW HARDENING: Number.isFinite rejects NaN (typeof NaN === 'number' would
  // otherwise pass through); clamp to [0,100] so a malformed/out-of-range row never reaches a
  // future progress-bar consumer as a nonsensical value.
  const ctxPercent = Number.isFinite(rawPct) ? Math.max(0, Math.min(100, rawPct)) : null;
  return {
    ctxPercent,
    lastTool: s.current_tool ?? null,
    lastToolAt: s.last_tool_at ?? null,
    lastActivityKind: s.last_activity_kind ?? null,
    silentUntil: s.expected_silence_until ?? null,
    attachState: mapAttachState(attachResult),
  };
}
