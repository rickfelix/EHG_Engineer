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
 * session that EXISTS, is CURRENTLY ACTIVE by heartbeat, and IS THE ACTIVE COORDINATOR per the
 * canonical resolver. That rejects
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

/*
 * AUTHORIZATION IS "IS THE ACTIVE COORDINATOR", NOT A ROLE FIELD — and the first version of this
 * file got that wrong in a way every test hid.
 *
 * I originally authorized on metadata.role ∈ {coordinator, chairman} and proved it with 13 green
 * tests. Then CI's schema-reference-lint failed on an unrelated line and the measurement that
 * followed showed the design was fiction: across 13,068 claude_sessions rows, metadata.role is set
 * on TWENTY, metadata.callsign on FIVE, and the roles that do appear are adam / solomon /
 * adam_retired — never 'coordinator'. The guard would have refused EVERY caller including the real
 * coordinator, which is as broken as refusing none, and it passed because every test hand-built
 * `metadata: { role: 'coordinator' }`. I invented the data shape my guard depended on and then
 * tested against my invention.
 *
 * The canonical answer already exists: lib/coordinator/resolve.cjs getActiveCoordinatorId(), which
 * resolves via the pointer file and metadata->>is_coordinator, and already carries the ghost-session
 * and staleness guards that took several QFs to get right. Asking it is both correct and avoids
 * standing up a second source of truth for "who is the coordinator".
 *
 * Chairman is deliberately NOT an authorization path here: the chairman is not a fleet session, so
 * there is nothing for this writer to corroborate against. Inventing one would repeat the mistake
 * this comment exists to record.
 */

/** A session older than this is not "live" for authorization purposes. */
const ACTIVE_HEARTBEAT_MS = 15 * 60 * 1000;

/** Upper bound on how long one call may pin the switch on. A switch with no expiry is a switch
 *  nobody remembers to turn off. */
const MAX_EXPIRES_MS = 4 * 60 * 60 * 1000;

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
function evaluateActor(session, nowMs, activeCoordinatorId) {
  if (!session) {
    return { ok: false, code: 'ACTOR_NOT_FOUND', detail: 'no session row matches the claimed actor' };
  }
  // The authorization question, asked of the canonical resolver rather than of a field.
  if (!activeCoordinatorId) {
    return {
      ok: false,
      code: 'NO_ACTIVE_COORDINATOR',
      detail: 'no active coordinator resolves; refusing rather than guessing who may fire the switch',
    };
  }
  if (String(session.session_id) !== String(activeCoordinatorId)) {
    return {
      ok: false,
      code: 'ACTOR_NOT_COORDINATOR',
      detail: `actor is not the active coordinator (active=${String(activeCoordinatorId).slice(0, 12)}…)`,
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
  return { ok: true, role: 'coordinator', callsign: (session.metadata && session.metadata.callsign) || null };
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
  const { supabase, insertCoordinationRow, lookupSession = defaultLookupSession, resolveActiveCoordinator = defaultResolveActiveCoordinator, now = Date.now } = deps || {};
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
  // expiresInMs was caller-supplied and UNVALIDATED, so one call could pin the fleet kill switch on
  // indefinitely — a switch with no expiry is a switch nobody remembers to turn off. Bounded, and
  // rejected rather than silently clamped: quietly shortening a duration the caller asked for would
  // make the row's expires_at disagree with the operator's intent without telling anyone.
  if (!Number.isFinite(expiresInMs) || expiresInMs <= 0 || expiresInMs > MAX_EXPIRES_MS) {
    throw new KillSwitchAuthorizationError(
      `expiresInMs must be > 0 and <= ${MAX_EXPIRES_MS}ms (${MAX_EXPIRES_MS / 3600000}h); got ${expiresInMs}`,
      'KILL_SWITCH_BAD_EXPIRY',
    );
  }

  const nowMs = now();
  const session = await lookupSession(supabase, String(actor).trim());
  const activeCoordinatorId = await resolveActiveCoordinator(supabase);
  const verdict = evaluateActor(session, nowMs, activeCoordinatorId);
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
        method: 'corroborated_against_active_coordinator',
        authenticated: false,
        corroborated_at: new Date(nowMs).toISOString(),
        // 'role_authorized' was a leftover label from the REFUTED metadata.role design. The check
        // actually performed is active-coordinator identity; a label describing a check that is not
        // run is an audit record that misdescribes itself.
        checks: ['session_exists', 'heartbeat_within_window', 'is_active_coordinator'],
        residual_gap:
          'CORROBORATION, NOT AUTHENTICATION — and there are cheaper forges than impersonating a live seat. '
          + '(a) the authorization anchor .claude/active-coordinator.json is gitignored, per-checkout and '
          + 'writable by ANY local process, and under the default COORDINATOR_TWOWAY_V2=OFF path it resolves '
          + 'FIRST, so writing your own session id into that file authorizes you; '
          + '(b) metadata.is_coordinator is stampable via setActiveCoordinator with no authorization check; '
          + '(c) all seats share one service-role key, so a local holder can also name a different live seat. '
          + 'Closing any of these needs a per-seat credential — a separate SD. Do not read this row as proof '
          + 'of who fired the switch; read it as proof of what was checked.',
      },
    },
  };

  return insertCoordinationRow(supabase, row, { select: '*', single: true });
}

/**
 * Ask the CANONICAL resolver who the active coordinator is. Injectable for tests, but the default
 * deliberately delegates rather than re-deriving: resolve.cjs already encodes the pointer-file vs
 * DB precedence, the nil-UUID guard, ghost-session detection and the staleness window, each of
 * which took its own QF to get right. A second implementation of "who is the coordinator" would
 * drift from that one silently.
 *
 * Fails CLOSED: any resolver error yields null, and evaluateActor refuses on a null coordinator
 * rather than guessing. Refusing to fire a kill switch is recoverable; firing it wrongly is not.
 */
async function defaultResolveActiveCoordinator(supabase) {
  try {
    const { getActiveCoordinatorId } = require('./resolve.cjs');
    return (await getActiveCoordinatorId(supabase)) || null;
  } catch {
    return null;
  }
}

async function defaultLookupSession(supabase, sessionId) {
  const { data } = await supabase
    .from('claude_sessions')
    .select('session_id, status, heartbeat_at, metadata')
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
  ACTIVE_HEARTBEAT_MS,
  MAX_EXPIRES_MS,
  defaultResolveActiveCoordinator,
};
