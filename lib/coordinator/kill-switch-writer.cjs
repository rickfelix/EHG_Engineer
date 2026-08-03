/**
 * Governed kill-switch writer — SD-LEO-INFRA-COORDINATION-BUS-ACCESS-001 FR-2.
 *
 * THE HOLE THIS CLOSES. The fleet-enforcement kill switch had NO shipped writer. Delta established
 * that empirically (SECURITY evidence 64b7328a): anon INSERT -> 42501, authenticated-JWT INSERT ->
 * 42501, service_role -> accepted, with refusals confirmed by DELETION COUNT rather than by error
 * code alone. So its de-facto write authorization was possession of the service-role key — held by
 * every fleet seat, i.e. by exactly the population the enforcement constrains. Any worker could
 * disable a fleet-wide safety enforcement for every other worker, and `sender_session` is free text
 * (Delta's probe set it to an arbitrary string and it was accepted), so the resulting row was not
 * attributable to any authorised operator.
 *
 * WHAT THIS CAN AND CANNOT PROMISE — read this before trusting an actor value.
 * There is NO per-seat authentication in this system. Measured: three Supabase keys exist (ANON,
 * SCHEMA_READER, SERVICE_ROLE) and all are SHARED; there is no sign-in flow for fleet seats. Every
 * seat presents the identical service-role key, so the database cannot distinguish one seat from
 * another and there is no authenticated context to derive an actor from.
 *
 * Therefore this writer CORROBORATES rather than AUTHENTICATES. The claimed actor must name a
 * session that EXISTS, is CURRENTLY ACTIVE by heartbeat, and holds the claimed role. That rejects
 * arbitrary strings, absent actors and dead sessions — the whole of what was observed being
 * accepted. It does NOT stop a local process holding the service key from naming a DIFFERENT live
 * seat. Closing that needs a per-seat credential and is a separate SD.
 *
 * Because the difference matters, every row records HOW attribution was established. An attribution
 * whose strength is unstated gets read as stronger than it is — which is this SD's own defect class,
 * one level up.
 *
 * SENTINEL SHAPE IS NOT OURS TO CHANGE. target_sd carries the broadcast because
 * session_coordination has CHECK valid_target ((target_session IS NOT NULL) OR (target_sd IS NOT
 * NULL)) — a null-targeted row is structurally uninsertable. Format and consumers stay exactly as
 * the enforcement SD shipped them; only WHO CAN WRITE changes.
 */

const FLEET_BROADCAST_SD = '__FLEET_ENFORCEMENT__';
const KILL_SWITCH_KIND = 'fleet_enforcement_kill';

/** Seats permitted to fire the switch. A worker seat may not disable enforcement for the fleet. */
const AUTHORIZED_ROLES = Object.freeze(['coordinator', 'chairman']);

/** A session older than this is not "live" for authorization purposes. */
const ACTIVE_HEARTBEAT_MS = 15 * 60 * 1000;

class KillSwitchAuthorizationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'KillSwitchAuthorizationError';
    this.code = code || 'KILL_SWITCH_UNAUTHORIZED';
  }
}

/**
 * Corroborate a claimed actor against live state. PURE of I/O apart from the injected lookup, so the
 * decision logic is testable without a database.
 *
 * @param {object} session   the claude_sessions row for the claimed id, or null
 * @param {number} nowMs
 * @returns {{ok:true, role:string, callsign:string|null} | {ok:false, code:string, detail:string}}
 */
function evaluateActor(session, nowMs) {
  if (!session) {
    return { ok: false, code: 'ACTOR_NOT_FOUND', detail: 'no session row matches the claimed actor' };
  }
  const role = (session.metadata && session.metadata.role) || session.role || null;
  if (!role) {
    return { ok: false, code: 'ACTOR_ROLE_UNKNOWN', detail: 'session carries no role' };
  }
  if (!AUTHORIZED_ROLES.includes(String(role))) {
    return {
      ok: false,
      code: 'ACTOR_ROLE_FORBIDDEN',
      detail: `role '${role}' may not fire the fleet kill switch (allowed: ${AUTHORIZED_ROLES.join(', ')})`,
    };
  }
  const hb = session.heartbeat_at ? Date.parse(session.heartbeat_at) : NaN;
  if (!Number.isFinite(hb)) {
    return { ok: false, code: 'ACTOR_NO_HEARTBEAT', detail: 'session has no parseable heartbeat_at' };
  }
  // A stale seat cannot fire the switch: "this session existed once" is not authorization, and an
  // abandoned row is exactly what an impersonator would reach for.
  if (nowMs - hb > ACTIVE_HEARTBEAT_MS) {
    return {
      ok: false,
      code: 'ACTOR_NOT_LIVE',
      detail: `last heartbeat ${Math.round((nowMs - hb) / 60000)}m ago exceeds the ${ACTIVE_HEARTBEAT_MS / 60000}m liveness window`,
    };
  }
  return { ok: true, role: String(role), callsign: session.callsign || null };
}

/**
 * Fire the fleet-enforcement kill switch through the ONE governed path.
 *
 * @param {object}   deps
 * @param {object}   deps.supabase
 * @param {Function} deps.insertCoordinationRow  the existing CI-enforced insert choke — this writer
 *                                               deliberately does NOT open a fourth insert path
 * @param {Function} [deps.lookupSession]        async (supabase, sessionId) => session row | null
 * @param {Function} [deps.now]                  () => ms
 * @param {object}   args
 * @param {string}   args.actor                  the claimed session id firing the switch
 * @param {string}   args.reason                 free text, REQUIRED — a switch with no stated reason
 *                                               is indistinguishable from an accident
 * @param {number}   [args.expiresInMs]
 */
async function fireFleetEnforcementKill(deps, args) {
  const { supabase, insertCoordinationRow, lookupSession = defaultLookupSession, now = Date.now } = deps || {};
  const { actor, reason, expiresInMs = 60 * 60 * 1000 } = args || {};

  if (typeof insertCoordinationRow !== 'function') {
    throw new KillSwitchAuthorizationError('insertCoordinationRow must be supplied — the writer must not open a second insert path', 'KILL_SWITCH_NO_CHOKE');
  }
  // Required, and required to be MEANINGFUL. An empty-string actor or reason satisfies a truthiness
  // check while carrying no information, which is the shape of a field that exists to be reported
  // rather than to be used.
  if (!actor || !String(actor).trim()) {
    throw new KillSwitchAuthorizationError('actor is required', 'KILL_SWITCH_NO_ACTOR');
  }
  if (!reason || !String(reason).trim()) {
    throw new KillSwitchAuthorizationError('reason is required', 'KILL_SWITCH_NO_REASON');
  }

  const nowMs = now();
  const session = await lookupSession(supabase, String(actor).trim());
  const verdict = evaluateActor(session, nowMs);
  if (!verdict.ok) {
    throw new KillSwitchAuthorizationError(
      `kill switch refused: ${verdict.detail} (actor=${actor})`,
      verdict.code,
    );
  }

  const row = {
    target_sd: FLEET_BROADCAST_SD,
    sender_session: String(actor).trim(),
    message_type: 'INFO',
    expires_at: new Date(nowMs + expiresInMs).toISOString(),
    payload: {
      kind: KILL_SWITCH_KIND,
      reason: String(reason).trim(),
      actor: String(actor).trim(),
      actor_role: verdict.role,
      actor_callsign: verdict.callsign,
      // THE STRENGTH OF THE ATTRIBUTION, RECORDED. Not decoration: a reader who assumes this is
      // authenticated would over-trust it, and the gap is not visible from the row otherwise.
      attribution: {
        method: 'corroborated_against_claude_sessions',
        authenticated: false,
        corroborated_at: new Date(nowMs).toISOString(),
        checks: ['session_exists', 'heartbeat_within_window', 'role_authorized'],
        residual_gap: 'all seats share one service-role key; a local holder can name a different live seat',
      },
    },
  };

  return insertCoordinationRow(supabase, row, { select: '*', single: true });
}

async function defaultLookupSession(supabase, sessionId) {
  const { data } = await supabase
    .from('claude_sessions')
    .select('session_id, callsign, status, heartbeat_at, metadata')
    .eq('session_id', sessionId)
    .maybeSingle();
  return data || null;
}

module.exports = {
  fireFleetEnforcementKill,
  evaluateActor,
  KillSwitchAuthorizationError,
  FLEET_BROADCAST_SD,
  KILL_SWITCH_KIND,
  AUTHORIZED_ROLES,
  ACTIVE_HEARTBEAT_MS,
};
