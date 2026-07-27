/**
 * SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-4 — singleton-aware spawn.
 *
 * ONE decision function, consumed by BOTH the addSession route and the panel. That is not tidiness
 * — it is the FR's invariant: "every disabled button state corresponds to a route that returns 400
 * for the same condition". Two implementations drift, and a UI-only gate is exactly the failure
 * this SD documents as having ALREADY HAPPENED on this page: `role` was once written as
 * FLEET_WORKER_ROLE with ZERO readers, so clicking "start the coordinator" spawned a session that
 * fell through to the worker path and came up self-claiming DRAFT SDs — WHILE THE UI REPORTED
 * SUCCESS. The route is the enforcement; the button only renders what the route would say.
 *
 * THE WINDOW MISMATCH IS LOAD-BEARING, NOT AN INCONSISTENCY TO TIDY AWAY.
 *   The panel's "live" window is 3600s. The registration guard's freshness is 600s.
 *   Gate naively on the PANEL's window and the button blocks for up to FIFTY MINUTES during which
 *   the spawn would have SUCCEEDED — the guard would not have refused it. So the gate is the
 *   GUARD's 600s, and the 600–3600s band is not a refusal at all: it is a RELABEL.
 *   Between 600s and 3600s the correct affordance is "Replace the stale Adam", ENABLED.
 *
 * COORDINATOR IS NEVER REFUSED. Silent takeover is designed behaviour (resolve.cjs), and refusing
 * it BREAKS SUCCESSION — a coordinator could never be replaced. Adam and Solomon are refused
 * because registration itself will refuse them; the route just says so first, with the holder named.
 */

/** The registration guard's freshness window — the one that actually decides. */
export const GUARD_FRESHNESS_MS = 600_000;
/** The panel's display window. Deliberately WIDER; gating on it would block valid spawns. */
export const PANEL_LIVE_WINDOW_MS = 3_600_000;

export const SINGLETON_ROLES = Object.freeze(['adam', 'solomon', 'coordinator']);
/** Coordinator is a singleton but is REPLACEABLE — takeover is how succession works. */
export const REFUSABLE_SINGLETON_ROLES = Object.freeze(['adam', 'solomon']);

export function isSingletonRole(role) {
  return SINGLETON_ROLES.includes(String(role || '').toLowerCase());
}

/**
 * Decide whether a spawn request may proceed.
 *
 * @param {{
 *   role: string,
 *   holder: {session_id: string, identity_kind?: string, heartbeat_age_ms?: number}|null,
 *   nowMs?: number,
 * }} o
 * @returns {{allowed:boolean, httpStatus:number, reason:string|null, uiLabel:string,
 *            uiEnabled:boolean, holderIsFresh:boolean}}
 */
export function decideSingletonSpawn({ role, holder } = {}) {
  const r = String(role || '').toLowerCase();
  const label = r ? r.charAt(0).toUpperCase() + r.slice(1) : 'session';

  if (!isSingletonRole(r)) {
    return { allowed: true, httpStatus: 200, reason: null, uiLabel: `Start a ${r || 'session'}`, uiEnabled: true, holderIsFresh: false };
  }

  // identity_kind must MATCH the role. A row that merely once carried the role is not a holder
  // of it now — gating on a stale stamp would block a spawn the guard would have allowed.
  const kindMatches = !holder || !holder.identity_kind || String(holder.identity_kind).toLowerCase() === r;
  const age = holder && Number.isFinite(holder.heartbeat_age_ms) ? holder.heartbeat_age_ms : Infinity;
  const holderIsFresh = Boolean(holder) && kindMatches && age <= GUARD_FRESHNESS_MS;

  if (r === 'coordinator') {
    // Never refused. Refusing would break succession outright.
    return {
      allowed: true,
      httpStatus: 200,
      reason: null,
      uiLabel: holderIsFresh ? `Take over from the live coordinator` : 'Start the coordinator',
      uiEnabled: true,
      holderIsFresh,
    };
  }

  if (holderIsFresh) {
    const who = holder.session_id ? String(holder.session_id).slice(0, 8) : 'unknown';
    return {
      allowed: false,
      httpStatus: 400,
      reason: `a live ${label} already holds this role (session ${who}, last heartbeat ${Math.round(age / 1000)}s ago); spawning a second one would be refused at registration`,
      uiLabel: `${label} is live`,
      uiEnabled: false,
      holderIsFresh,
    };
  }

  // Holder exists but is PAST the guard's window — including the 600–3600s band the panel still
  // renders as "live". The spawn WOULD succeed, so it must not be blocked; it is relabelled.
  if (holder && kindMatches && age < PANEL_LIVE_WINDOW_MS) {
    return {
      allowed: true,
      httpStatus: 200,
      reason: null,
      uiLabel: `Replace the stale ${label}`,
      uiEnabled: true,
      holderIsFresh: false,
    };
  }

  return { allowed: true, httpStatus: 200, reason: null, uiLabel: `Start ${label}`, uiEnabled: true, holderIsFresh: false };
}

/**
 * THE INVARIANT, as an assertable function: the button and the route agree, always.
 * A disabled button must correspond to a route that refuses the same condition, and an
 * enabled one to a route that allows it.
 */
export function buttonAgreesWithRoute(decision) {
  return Boolean(decision) && decision.uiEnabled === decision.allowed;
}
