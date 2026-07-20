/**
 * Fleet WATCHDOG — SD-LEO-INFRA-FLEET-WATCHDOG-001 (Solomon SD-E / U5).
 *
 * @wire-check-exempt: foundation watchdog over the SD-A session registry, built first; the
 * coordinator-audit / operator-badge consumer is the activation follow-up. Consumed today by tests.
 *
 * Heartbeat-staleness detection that badges THREE DISTINCT states (+ ALIVE) because the OPERATOR
 * RESPONSE differs for each (U5) — the whole point vs a naive staleness alarm:
 *   - ALIVE     — recent heartbeat; no action.
 *   - STOPPED   — intentionally parked (awaiting_tick / armed-silence / lifecycle-terminated); NO action.
 *                 (Restarting a deliberately-stopped session is the naive-alarm's first failure mode.)
 *   - AUTH-LOST — heartbeat stale but the PROCESS IS ALIVE ⇒ logged out (wake-from-sleep / mass-logout
 *                 class); response: RE-AUTH. (Ignoring this is the naive-alarm's second failure mode.)
 *   - CRASHED   — heartbeat stale AND the process is DEAD; response: RESTART.
 *
 * PURE CORE (data-in / verdict-out, no DB). isPidAlive / isWithinArmedSilence are injected so the
 * classifier is unit-testable without a live process table; the adapter supplies the real predicates
 * (lib/fleet/cc-pid-liveness.cjs isProcessRunning). Read-only / advisory — never mutates a session.
 */
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

export const WATCHDOG_STATES = Object.freeze({ ALIVE: 'ALIVE', STOPPED: 'STOPPED', AUTH_LOST: 'AUTH-LOST', CRASHED: 'CRASHED' });

// SD-LEO-INFRA-FLEET-SPAWN-CONTROL-001 FR-10: name the real spawn-control verb so a card's
// AUTH-LOST remediation resolves to a callable action (lib/fleet/spawn-control.js relaunchUnderProfile),
// not just a human-readable description.
const REMEDIATION = Object.freeze({
  ALIVE: null,
  STOPPED: null,
  'AUTH-LOST': 'relaunch-under-profile: process alive but session logged out (wake-from-sleep / mass-logout) — re-auth via relaunchUnderProfile()',
  CRASHED: 'restart: process dead and heartbeat stale',
});

/**
 * Classify ONE session's watchdog state.
 * @param {{heartbeat_at?:string, pid?:number, loop_state?:string, expected_silence_until?:string, status?:string, session_id?:string}} session
 * @param {{ nowMs:number, staleThresholdMs:number, isPidAlive?:(s:object)=>boolean, isWithinArmedSilence?:(until:string,now:number)=>boolean }} ctx
 * @returns {{ state:string, remediation:string|null, session_id:string|null }}
 */
export function classifyWatchdogState(session, { nowMs, staleThresholdMs, isPidAlive, isWithinArmedSilence } = {}) {
  const s = session || {};
  const sid = s.session_id || null;
  const hbAgeMs = s.heartbeat_at ? Math.max(0, nowMs - new Date(s.heartbeat_at).getTime()) : Infinity;
  if (Number.isFinite(staleThresholdMs) && hbAgeMs < staleThresholdMs) {
    return { state: 'ALIVE', remediation: null, session_id: sid };
  }
  // Stale — is it intentionally parked? (never restart a deliberately-stopped session)
  const parked = s.loop_state === 'awaiting_tick'
    || s.status === 'released' || s.status === 'stale' || s.status === 'ended'
    || !!(isWithinArmedSilence && isWithinArmedSilence(s.expected_silence_until, nowMs));
  if (parked) return { state: 'STOPPED', remediation: null, session_id: sid };
  // Stale + not parked: process alive but not heartbeating = logged out (AUTH-LOST); dead = CRASHED.
  const state = (isPidAlive && isPidAlive(s)) ? 'AUTH-LOST' : 'CRASHED';
  return { state, remediation: REMEDIATION[state], session_id: sid };
}

/**
 * Badge summary over a classified set: per-state counts + the ACTIONABLE list (CRASHED + AUTH-LOST
 * only — STOPPED/ALIVE are non-actionable, surfaced as counts).
 * @param {Array<{state:string, remediation?:string|null, session_id?:string|null}>} classified
 */
export function summarizeWatchdog(classified = []) {
  const counts = { CRASHED: 0, 'AUTH-LOST': 0, STOPPED: 0, ALIVE: 0 };
  const actionable = [];
  const list = Array.isArray(classified) ? classified : [];
  for (const c of list) {
    if (!c || !c.state || !(c.state in counts)) continue;
    counts[c.state] += 1;
    if (c.state === 'CRASHED' || c.state === 'AUTH-LOST') {
      actionable.push({ session_id: c.session_id || null, state: c.state, remediation: c.remediation || REMEDIATION[c.state] });
    }
  }
  return { counts, actionable, total: list.length };
}

/**
 * Fail-soft absence probe (42P01 / PGRST205) — mirrors lib/fleet/session-registry.js.
 * SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 PLAN_VERIFICATION adversarial-review fix:
 * runWatchdog() now routes errors through fetchAllPaginated's thrown Error, which drops the
 * original .code — detection falls through entirely to the message regex, so it must also
 * match the real-world PGRST205 "schema cache" message shape (lib/eva-support/*.js convention),
 * not just the 42P01 "does not exist" shape that survived by coincidence of wording.
 */
export function tableAbsent(error) {
  if (!error) return false;
  const code = error.code || error.details || '';
  return code === '42P01' || code === 'PGRST205' || /does not exist|relation .* not exist|not found|schema cache/i.test(error.message || '');
}

/**
 * FR-2 adapter: read live sessions from claude_sessions (the SD-A registry) and classify each.
 * Fail-soft: an absent table / read error → empty watchdog set (never throws). deps.isPidAlive /
 * deps.isWithinArmedSilence default to conservative no-ops so a caller can inject the real predicates.
 * @param {{ supabase:object, isPidAlive?:Function, isWithinArmedSilence?:Function }} deps
 * @param {{ nowMs:number, staleThresholdMs:number }} opts
 */
export async function runWatchdog(deps = {}, opts = {}) {
  const { supabase, isPidAlive, isWithinArmedSilence } = deps;
  const { nowMs, staleThresholdMs } = opts;
  try {
    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6/FR-7: claude_sessions is a growing,
    // unfiltered table read here — every session feeds the watchdog badge, so a silently
    // capped read would leave sessions past the cap unclassified. Paginate to completion.
    let data;
    try {
      data = await fetchAllPaginated(() => supabase
        .from('claude_sessions')
        .select('session_id, terminal_id, pid, pid_validated_at, heartbeat_at, loop_state, expected_silence_until, status')
        .order('session_id', { ascending: true }));
    } catch (e) {
      return tableAbsent(e) ? { inert: true, ...summarizeWatchdog([]) } : { error: e.message, ...summarizeWatchdog([]) };
    }
    const classified = (data || []).map((s) => classifyWatchdogState(s, { nowMs, staleThresholdMs, isPidAlive, isWithinArmedSilence }));
    return { ...summarizeWatchdog(classified), classified };
  } catch (e) {
    return { inert: true, error: (e && e.message) || String(e), ...summarizeWatchdog([]) };
  }
}
