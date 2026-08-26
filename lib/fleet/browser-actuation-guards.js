/**
 * Guardrail predicates for guarded browser actuation (SD-LEO-FEAT-GUARDRAILED-BROWSER-ACTUATION-001).
 *
 * Pure/testable guard functions wired into lib/fleet/browser-control.js's driveAction() chokepoint
 * (the single existing actuation chokepoint, per LEAD-phase Explore discovery). Every predicate here
 * fails CLOSED (refuses) on a missing row, a read error, or a malformed value -- the opposite default
 * of lib/governance/stage-gate-predicate.js's isEnabled(), which fails safe to `false` (unarmed) and
 * was found to leave that mechanism inert by design. This module never repeats that shape: absence of
 * a clear "permitted" signal always means refused.
 */

const KILL_SWITCH_CONFIG_KEY = 'browser_actuation_kill_switch';
const WRITE_ALLOWLIST_CONFIG_KEY = 'browser_actuation_write_allowlist';
export const DEFAULT_SESSION_ACTION_CAP = 200;

function safeParseConfigValue(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * FR-2: fleet-wide chairman kill switch. Reads app_config.browser_actuation_kill_switch. Fails
 * CLOSED (engaged=true, i.e. STOPPED) on any read error, missing row, or malformed value -- only an
 * explicit `{ engaged: false }` value un-engages it.
 */
export async function isKillSwitchEngaged(supabase) {
  let row;
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', KILL_SWITCH_CONFIG_KEY)
      .maybeSingle();
    if (error || !data) return true;
    row = data;
  } catch {
    return true;
  }
  const parsed = safeParseConfigValue(row.value);
  return parsed?.engaged === false ? false : true;
}

/**
 * FR-1: deny-by-default write allowlist. Reads app_config.browser_actuation_write_allowlist (a JSON
 * array of permitted eventType strings, or `{allowed: [...]}`). Fails CLOSED (not allowlisted) on any
 * read error, missing row, or malformed/non-array value.
 */
export async function isActionAllowlisted(supabase, eventType) {
  let row;
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', WRITE_ALLOWLIST_CONFIG_KEY)
      .maybeSingle();
    if (error || !data) return false;
    row = data;
  } catch {
    return false;
  }
  const parsed = safeParseConfigValue(row.value);
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.allowed) ? parsed.allowed : null;
  if (!list) return false;
  return list.includes(eventType);
}

/**
 * FR-6: fenced/synthetic-identity check. Mirrors the exact session.metadata boolean-flag idiom
 * lib/fleet/browser-control.js already uses for isBrowserMcpEnabled/isPaused -- absent/false = not
 * fenced (refused), matching this module's fail-closed convention.
 */
export function isFencedIdentity(session) {
  return !!(session && session.metadata && session.metadata.fenced_venture === true);
}

/**
 * FR-4: atomic per-session action cap. Delegates to fn_try_consume_browser_actuation_cap, an
 * INSERT ... ON CONFLICT DO UPDATE ... WHERE action_count < cap_limit RETURNING statement -- the
 * increment and the cap check happen in one DB round trip, so two concurrent calls against a session
 * one action below its cap cannot both succeed (TS-5). Fails CLOSED (not allowed) on any RPC error.
 */
export async function tryConsumeSessionActionCap(supabase, sessionId, capLimit = DEFAULT_SESSION_ACTION_CAP) {
  try {
    const { data, error } = await supabase.rpc('fn_try_consume_browser_actuation_cap', {
      p_session_id: sessionId,
      p_cap_limit: capLimit,
    });
    if (error) return { allowed: false, reason: `cap_check_failed: ${error.message}` };
    return { allowed: data === true, reason: data === true ? null : 'session_cap_exceeded' };
  } catch (err) {
    return { allowed: false, reason: `cap_check_failed: ${err && err.message}` };
  }
}

/**
 * FR-5: the single enforced no-real-human-outbound gate for outbound-messaging-class actions.
 * Delegates entirely to lib/marketing/autonomy-gate.js#checkPublishAuthorization -- the codebase's
 * one proven working fail-closed outbound gate (LEAD-phase RISK + Explore finding) -- rather than
 * re-implementing authorization logic here. Dynamic import mirrors logBrowserAction's own pattern in
 * browser-control.js for an ESM module reaching into a sibling module lazily.
 */
export async function checkOutboundActionAuthorized({ supabase, ventureId, channelType, contentId, correlationId, send, logger }) {
  try {
    const { checkPublishAuthorization } = await import('../marketing/autonomy-gate.js');
    return await checkPublishAuthorization({ supabase, ventureId, channelType, contentId, correlationId, send, logger });
  } catch (err) {
    return { allowed: false, reason: `outbound_authorization_check_failed: ${err && err.message}` };
  }
}
