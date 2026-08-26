/**
 * Per-session sandboxed browser control plane (FR-1..FR-5), SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-A.
 *
 * Backend/control-plane only (target_application=EHG_Engineer) -- no React rendering pane here. A
 * future EHG frontend session-view pane consumes requestBrowserSession/signalTakeover/signalHandBack
 * once a fleet launcher UI shell exists.
 *
 * SAFETY: never launches a real browser process -- buildBrowserLaunchOptions returns launch options
 * for the CALLER to pass to puppeteer/playwright; this module never spawns anything itself. This is
 * the same "return the invocation, never execute it here" discipline this codebase applies to other
 * security-sensitive control-plane surfaces.
 *
 * GUARDRAILED ACTUATION EXTENSION (SD-LEO-FEAT-GUARDRAILED-BROWSER-ACTUATION-001): driveAction() is
 * extended with a chairman kill switch, a deny-by-default write allowlist, a fenced-identity check,
 * an outbound-messaging authorization gate, and an atomic per-session action cap -- see
 * ./browser-actuation-guards.js for the guard predicates and driveAction()'s own docblock for the
 * full guard order.
 */
import path from 'node:path';
import {
  isKillSwitchEngaged,
  isActionAllowlisted,
  isFencedIdentity,
  tryConsumeSessionActionCap,
  checkOutboundActionAuthorized,
  DEFAULT_SESSION_ACTION_CAP,
} from './browser-actuation-guards.js';

const LOCALHOST_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
// SECURITY (adversarial review): session_id gates path.join() in resolveSessionProfileDir -- without
// this allowlist, a session_id containing '..' collapses through path.join and can resolve OUTSIDE
// the configured base dir (e.g. onto a real Chrome profile), defeating the exact isolation invariant
// FR-1 exists to guarantee. Mirrors the PROFILE_NAME_RE discipline used elsewhere in lib/fleet/ for
// the same class of "name become a path segment" risk.
const SAFE_SESSION_ID_RE = /^[A-Za-z0-9_-]+$/;

/** FR-4: manifest-gate check. Mirrors session-predicates.mjs's field-presence idiom -- absent/false = OFF. */
export function isBrowserMcpEnabled(session) {
  return !!(session && session.metadata && session.metadata.browser_mcp_enabled === true);
}

/** FR-2: CDP must always resolve to a localhost address. Throws on any non-localhost override. */
export function assertLocalhostBind(host) {
  const h = String(host || '127.0.0.1').toLowerCase();
  if (!LOCALHOST_HOSTS.has(h)) {
    throw new Error(`assertLocalhostBind: refusing non-localhost CDP bind: ${JSON.stringify(host)}`);
  }
  return h;
}

/** FR-1: per-session profile dir, isolated by session_id -- never the chairman's own browser profile. */
export function resolveSessionProfileDir(sessionId, opts = {}) {
  if (typeof sessionId !== 'string' || !SAFE_SESSION_ID_RE.test(sessionId)) {
    throw new Error(`resolveSessionProfileDir: unsafe sessionId (path-traversal guard): ${JSON.stringify(sessionId)}`);
  }
  const baseDir = opts.baseDir ?? process.env.FLEET_BROWSER_PROFILES_DIR ?? null;
  if (!baseDir) throw new Error('resolveSessionProfileDir: FLEET_BROWSER_PROFILES_DIR is not configured');
  return path.join(baseDir, sessionId);
}

/**
 * FR-1/FR-2: pure launch-options builder for puppeteer/playwright. Never executes anything -- the
 * caller passes this to its own launch() call.
 */
export function buildBrowserLaunchOptions(sessionId, opts = {}) {
  const userDataDir = resolveSessionProfileDir(sessionId, opts);
  const host = assertLocalhostBind(opts.host);
  return {
    userDataDir,
    headless: opts.headless ?? true,
    args: [`--remote-debugging-address=${host}`, `--remote-debugging-port=${opts.port ?? 0}`],
  };
}

/**
 * FR-3: log a browser action to the existing fleet event feed (lib/coordinator/coordination-events.cjs),
 * matching the {event_type, session_id, sd_key, payload} shape already used at coordination-events.cjs
 * :290-297. Dynamic import (not a static import) mirrors spawn-control.js's own emitVerbEvent, the
 * established pattern in this codebase for an ESM module consuming a .cjs sibling. Fail-open: never
 * throws to the caller (an audit-log outage must not block a browser action, per the existing feed's
 * own documented fail-open contract).
 */
export async function logBrowserAction(supabase, { sessionId, sdKey = null, eventType, payload = {} } = {}) {
  if (!eventType || !eventType.startsWith('browser_')) {
    throw new Error(`logBrowserAction: eventType must be browser_-prefixed, got ${JSON.stringify(eventType)}`);
  }
  try {
    const { logCoordinationEvent } = await import('../coordinator/coordination-events.cjs');
    return await logCoordinationEvent(supabase, {
      event_type: eventType,
      session_id: sessionId ?? null,
      sd_key: sdKey,
      payload,
    });
  } catch (error) {
    return { ok: false, error: error && error.message };
  }
}

/**
 * FR-5: pause state lives on claude_sessions.metadata.browser_takeover_paused (same per-session
 * metadata-field idiom as FR-4's browser_mcp_enabled) -- NOT an in-memory Set. An adversarial review
 * caught that in-memory-only state silently re-permits the agent across a control-plane process
 * restart, contradicting FR-5 AC3's "no auto-resume" invariant. Read-merge-write (never a bare
 * metadata replace) to avoid clobbering unrelated metadata keys, mirroring the same defensive pattern
 * this codebase's other session-metadata writers use.
 *
 * KNOWN LIMITATION (adversarial review, round 2): this read-merge-write is NOT atomic. Several other
 * writers in this codebase (scripts/worker-checkin.cjs, scripts/hooks/stop-loop-wakeup-reminder.cjs,
 * lib/checkin/steps/model-effort-merge.cjs, the adam/solomon register scripts) use the SAME whole-
 * object client-side RMW pattern against claude_sessions.metadata -- a stale concurrent write from any
 * of them can clobber browser_takeover_paused back to absent. This is a PRE-EXISTING, cross-cutting gap
 * in how this codebase writes claude_sessions.metadata generally (an atomic DB-side jsonb merge/RPC
 * would close it for every writer, not just this one), not something introduced here or fixable within
 * this SD's control-plane-only scope. Throwing on a failed WRITE (below) keeps THIS module honest about
 * its own failures; the cross-writer clobber risk is tracked separately (see /signal harness-bug).
 */
async function persistPauseState(supabase, sessionId, paused) {
  const { data: current, error: readError } = await supabase
    .from('claude_sessions')
    .select('metadata')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (readError) throw new Error(`persistPauseState: read failed for ${sessionId}: ${readError.message}`);
  const { error: writeError } = await supabase
    .from('claude_sessions')
    .update({ metadata: { ...(current?.metadata || {}), browser_takeover_paused: paused } })
    .eq('session_id', sessionId);
  if (writeError) throw new Error(`persistPauseState: write failed for ${sessionId}: ${writeError.message}`);
}

/** FR-5 AC3: read-only pause check. Pure, mirrors isBrowserMcpEnabled -- reads a fresh session object. */
export function isPaused(session) {
  return !!(session && session.metadata && session.metadata.browser_takeover_paused === true);
}

/**
 * FR-5 AC1+AC2: pause agent-driven actions for a session immediately (takeover). THROWS if the pause
 * state fails to persist -- a safety control that silently "succeeds" while leaving the agent unpaused
 * is worse than a loud failure the caller must handle. The browser_takeover audit event is logged only
 * AFTER a successful persist, so the fleet feed never claims a takeover that didn't actually take.
 */
export async function signalTakeover(supabase, sessionId, sdKey = null) {
  if (!sessionId) throw new Error('signalTakeover: sessionId required');
  await persistPauseState(supabase, sessionId, true);
  await logBrowserAction(supabase, { sessionId, sdKey, eventType: 'browser_takeover', payload: {} });
}

/**
 * FR-5 AC3: resume agent-driven actions for a session. The ONLY way pause is cleared -- no
 * auto-resume. THROWS if the state fails to persist (same reasoning as signalTakeover); the
 * browser_handback event is logged only after a successful persist.
 */
export async function signalHandBack(supabase, sessionId, sdKey = null) {
  if (!sessionId) throw new Error('signalHandBack: sessionId required');
  await persistPauseState(supabase, sessionId, false);
  await logBrowserAction(supabase, { sessionId, sdKey, eventType: 'browser_handback', payload: {} });
}

/**
 * FR-4 entry guard + FR-1 profile resolution. Does NOT launch a real browser process -- validates the
 * manifest gate and returns the resolved launch options, or a clear refusal reason.
 */
export function requestBrowserSession(session, opts = {}) {
  if (!isBrowserMcpEnabled(session)) {
    return { ok: false, reason: 'browser_mcp_disabled' };
  }
  const launchOptions = buildBrowserLaunchOptions(session.session_id, opts);
  return { ok: true, launchOptions };
}

/**
 * Records a guard refusal as an audit event (PRD FR-3: every actuation, permitted or refused, is
 * audited). Reuses logBrowserAction's existing fail-open contract -- an audit outage must not itself
 * throw while we're already in the middle of refusing an action for a DIFFERENT reason.
 */
async function auditRefusal(supabase, session, eventType, reason) {
  await logBrowserAction(supabase, {
    sessionId: session && session.session_id,
    sdKey: session?.sd_key ?? null,
    eventType: 'browser_actuation_refused',
    payload: { attemptedEventType: eventType, reason },
  });
}

/**
 * FR-2/FR-3/FR-4/FR-5/FR-6 guard chain + (pre-existing) FR-3/FR-4/FR-5 manifest/pause/audit.
 *
 * Guard order (SD-LEO-FEAT-GUARDRAILED-BROWSER-ACTUATION-001 PRD system_architecture): chairman kill
 * switch (fleet-wide, checked first so it does not depend on session-specific state) -> manifest gate
 * + pause (pre-existing, session-level, unaudited -- see below) -> fenced-identity check -> write
 * allowlist (write-class actions only) -> outbound-messaging authorization (outbound-class actions
 * only) -> audit log write attempt -> per-session action cap (consumed LAST, after the audit write,
 * so NEITHER a guard refusal NOR an audit-write failure ever burns cap budget) -> actionFn.
 *
 * AUDITING SCOPE (corrected, EXEC-phase TESTING finding F4): auditRefusal() covers the NEW guards
 * this SD adds (kill_switch_engaged, identity_not_fenced, write_not_allowlisted,
 * outbound_not_authorized, session_cap_exceeded). It does NOT cover browser_mcp_disabled or
 * paused_for_takeover -- those are the pre-existing SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-A gates,
 * unaudited before this SD and left unchanged here (out of this SD's scope; extending their audit
 * behavior would be a separate, deliberate change to already-shipped, adversarially-reviewed code).
 *
 * isWrite/isOutboundMessage are explicit caller-declared flags, not inferred from eventType string
 * patterns -- a caller that mis-declares its own action type is a caller bug to fix, not a pattern to
 * guess around. Existing non-guarded callers (none exist in production today; see FR-9) default both
 * to false, i.e. read-class actuation, matching this function's pre-SD behavior for such calls.
 *
 * Re-checks the manifest gate AND pause state on EVERY call (not just at requestBrowserSession time)
 * so revoking metadata.browser_mcp_enabled or a takeover for an active session blocks its very next
 * action -- callers must pass a freshly-fetched session per call, not a cached reference. Logs BEFORE
 * invoking actionFn (no log-after-action race). For a WRITE-class action specifically, an audit-log
 * write failure now REFUSES the action (fail closed) rather than proceeding silently -- a stricter
 * contract than the pre-existing fail-open logBrowserAction() default, scoped to writes only per this
 * SD's guardrail requirement; non-write actuation keeps the original fail-open `auditWarning` contract.
 */
export async function driveAction(supabase, session, {
  eventType,
  payload = {},
  actionFn,
  isWrite = false,
  isOutboundMessage = false,
  outboundAuth = null,
  sessionCapLimit = DEFAULT_SESSION_ACTION_CAP,
} = {}) {
  const sessionId = session && session.session_id;

  if (await isKillSwitchEngaged(supabase)) {
    await auditRefusal(supabase, session, eventType, 'kill_switch_engaged');
    return { executed: false, reason: 'kill_switch_engaged' };
  }
  if (!isBrowserMcpEnabled(session)) {
    return { executed: false, reason: 'browser_mcp_disabled' };
  }
  if (isPaused(session)) {
    return { executed: false, reason: 'paused_for_takeover' };
  }
  if (!isFencedIdentity(session)) {
    await auditRefusal(supabase, session, eventType, 'identity_not_fenced');
    return { executed: false, reason: 'identity_not_fenced' };
  }
  if (isWrite && !(await isActionAllowlisted(supabase, eventType))) {
    await auditRefusal(supabase, session, eventType, 'write_not_allowlisted');
    return { executed: false, reason: 'write_not_allowlisted' };
  }
  if (isOutboundMessage) {
    const outboundResult = await checkOutboundActionAuthorized({ supabase, ...(outboundAuth || {}) });
    if (!outboundResult || outboundResult.allowed !== true) {
      await auditRefusal(supabase, session, eventType, outboundResult?.reason || 'outbound_not_authorized');
      return { executed: false, reason: 'outbound_not_authorized', outboundReason: outboundResult?.reason };
    }
  }
  // Audit write happens BEFORE the cap is consumed (adversarial EXEC-phase TESTING finding, F5):
  // an audit-log failure on a write-class action must refuse WITHOUT burning cap budget, matching
  // this function's "a refusal for any other reason never consumes the cap" invariant exactly --
  // audit_log_failed is a refusal like any other guard rejection, not a special case.
  const logResult = await logBrowserAction(supabase, { sessionId, sdKey: session?.sd_key ?? null, eventType, payload });
  if (isWrite && logResult && logResult.ok === false) {
    return { executed: false, reason: 'audit_log_failed' };
  }

  const capResult = await tryConsumeSessionActionCap(supabase, sessionId, sessionCapLimit);
  if (!capResult.allowed) {
    await auditRefusal(supabase, session, eventType, capResult.reason || 'session_cap_exceeded');
    // capReason (SECURITY finding, EXEC-TO-PLAN) distinguishes a genuine cap-reached refusal from an
    // RPC/connection failure masquerading as one -- the top-level `reason` stays 'session_cap_exceeded'
    // for gate-matching callers, mirroring the outboundReason detail field pattern above.
    return { executed: false, reason: 'session_cap_exceeded', capReason: capResult.reason };
  }
  const result = typeof actionFn === 'function' ? await actionFn() : undefined;
  return {
    executed: true,
    result,
    // Generic, UI-safe message only -- logResult.error (raw Postgres/PostgREST detail: host, table,
    // column names) is deliberately NOT surfaced here, adversarial review round 2. Callers needing the
    // raw detail for server-side logging should call logBrowserAction directly.
    ...(logResult && logResult.ok === false ? { auditWarning: 'audit log write failed' } : {}),
  };
}
