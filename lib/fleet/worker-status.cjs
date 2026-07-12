/**
 * Fleet worker-status schema-contract helper
 * SD-LEO-INFRA-WORKER-CHECKIN-HANDSHAKE-001 / FR-3
 *
 * Two jobs, both of which kill a tax that every fresh worker session re-pays
 * (the ~12-tool-call reverse-engineering documented in the SD / PAT-FLEET-CHECKIN-001):
 *
 *   1. ENV TAX — expose a self-env-loading supabase client. Reuses
 *      lib/supabase-client.cjs, which walks up from cwd to find `.env`, so
 *      callers never need `node --env-file=.env` (the #1 first-query failure
 *      "supabaseUrl is required").
 *
 *   2. SCHEMA-FOLKLORE TAX — export the CANONICAL column names for the fleet
 *      tables, verified against the live DB (2026-06-07). Folklore names that
 *      do NOT exist and cost wasted queries:
 *        - session_coordination: `from_session`/`to_session`  -> WRONG
 *        - claude_sessions:       `last_heartbeat`             -> WRONG
 *      The correct names are below. Import the contract instead of guessing.
 *
 * NOTE: this file is `.cjs` (not `.js`) on purpose. package.json has
 * `type: module`, so a bare `.js` here would be ESM and could NOT be required
 * by scripts/worker-checkin.cjs (CommonJS). This mirrors lib/coordinator/*.cjs.
 */

const { createSupabaseServiceClient, createSupabaseClient } = require('../supabase-client.cjs');

// --- Canonical column contract (verified against live DB 2026-06-07) ---

const SESSION_COORDINATION_COLUMNS = Object.freeze({
  id: 'id',
  targetSession: 'target_session',   // NOT to_session
  targetSd: 'target_sd',
  messageType: 'message_type',
  subject: 'subject',
  body: 'body',
  payload: 'payload',
  senderSession: 'sender_session',   // NOT from_session
  senderType: 'sender_type',
  createdAt: 'created_at',
  expiresAt: 'expires_at',
  readAt: 'read_at',
  acknowledgedAt: 'acknowledged_at',
});

const CLAUDE_SESSIONS_COLUMNS = Object.freeze({
  sessionId: 'session_id',
  sdKey: 'sd_key',
  status: 'status',
  heartbeatAt: 'heartbeat_at',        // NOT last_heartbeat
  worktreePath: 'worktree_path',
  metadata: 'metadata',
  claimingSessionId: 'claiming_session_id',
  expectedSilenceUntil: 'expected_silence_until',
});

// payload.kind discriminators carried on the existing INFO message_type. Using
// payload.kind (NOT payload.signal_type) keeps roll-call / request / reply rows
// OFF the friction signal-router and the intent-deconfliction sweep.
const PAYLOAD_KINDS = Object.freeze({
  ROLL_CALL: 'roll_call',             // FR-2 worker availability registration
  COORDINATOR_REQUEST: 'coordinator_request',
  COORDINATOR_REPLY: 'coordinator_reply',
  WORK_ASSIGNMENT: 'work_assignment',
  ADAM_ADVISORY: 'adam_advisory',     // SD-...-001-B: Adam advisory clean lane (off friction router)
  CANARY_REQUEST: 'canary_request',   // SD-LEO-INFRA-CANARY-SUPPORT-TRIGGER-RELIABILITY-001: durable Adam canary-verification request (advisory; excluded from the Adam generic inbox drain — owned by the canary responder)
  SOLOMON_CONSULT: 'solomon_consult', // SD-LEO-INFRA-SOLOMON-CONSULT-001D: worker/Adam→Solomon oracle consult (off friction router; reply travels under adam_advisory+oracle:true; intentionally NOT a DIRECTIVE_KIND)
  RELAY_REQUEST: 'relay_request',     // SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-DELIVERY-GUARANTEE-001 / FR-1: a tracked relay-request the coordinator drains deliberately (never processed inline in the active thread). Intentionally NOT a DIRECTIVE_KIND — the generic worker inbox drain must never auto-consume it; only coordinator-relay-drain.cjs may act on it.
  RELAY_CONFIRM: 'relay_confirm',     // FR-2: the durable confirm-back row correlated to a relay_request via payload.correlation_id — CONFIRM-ON-RELAY is only satisfied once this row exists.
  CHAIRMAN_DIRECTIVE: 'chairman_directive', // SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-B / FR-1: a durable BROADCAST chairman directive all 3 roles (Adam/coordinator/Solomon) surface FIRST-CLASS with per-role ack-tracking. Intentionally a DIRECTIVE_KIND (below) so the generic inbox drain NEVER auto-acks/consumes it (the last-hop silent-death root cause). Its ack REPLY carries payload.kind='chairman_directive_ack' (NOT a directive — a terminal reply, so it is deliberately NOT in DIRECTIVE_KINDS).
  COORDINATOR_RESERVATION: 'coordinator_reservation', // SD-LEO-INFRA-DISPATCH-AUTH-AUTO-AUTHORIZE-001-C: a coordinator-authored, non-consuming fence (target_session=NULL, target_sd set, self-compared expires_at) that suppresses belt self-claim of a specific SD for every session except the one it names. Drained read-only by lib/checkin/steps/drain-reservations.cjs into ctx.reservations — never stamped read_at/acknowledged_at, so it is intentionally NOT a DIRECTIVE_KIND (no agent ever "acts" on it; the axis check IS the action).
  SEAT_BUSY_RESERVATION: 'seat_busy_reservation', // SD-LEO-INFRA-NON-SD-WORK-CLAIM-FENCE-001: a coordinator-authored, non-consuming fence (target_session=<worker>, target_sd=NULL, self-compared expires_at) that suppresses ALL self-claim-of-new-work tiers for the ONE seat it names, for directed non-SD work (console assessment, audit sweep, open-loop gather) that is structurally invisible to COORDINATOR_RESERVATION above (which is keyed on target_sd). Drained read-only by lib/checkin/steps/seat-busy-fence.cjs into ctx.seatBusy — intentionally NOT a DIRECTIVE_KIND, same rationale as COORDINATOR_RESERVATION (the fence check IS the action).
  FENCE_NOTICE: 'fence_notice', // SD-LEO-INFRA-MID-FLIGHT-DIRECTIVE-001 / FR-2: a hard-stop/sequencing-fence notice (e.g. "do not run PLAN-TO-EXEC until sibling X passes") that a busy worker must see PROMPTLY, not just eventually. A DIRECTIVE_KIND (below) for deliver-not-consume semantics AND priority-exempt from coordination-inbox.cjs's oldest-N row cap (FR-1) — an older low-priority directive must never starve a newer fence notice out of the surfaced window.
});

// FR-3 (SD-LEO-INFRA-COORD-ADAM-COMMS-RESILIENT-001): payload.kind values that are
// DIRECTIVES — rows that require genuine agent action. NO poll/drain path may ever
// stamp acknowledged_at on these (read_at = DELIVERED is allowed; acknowledged_at /
// payload.actioned_at = ACTIONED is reserved for the agent that actually processed
// the row). This is the ALLOWLIST shape the QF-20260610-545 lesson demands: classify
// the KIND of the row, never the sender_type (the sender allowlist missed `chairman`
// and auto-acked 5 live directives unseen — harness-bug 43c2dee2). Consumers MUST
// import this list — never duplicate it (source-pinned by
// tests/unit/coord-adam-comms-resilient.test.js).
const DIRECTIVE_KINDS = Object.freeze([
  'coordinator_request',
  'work_assignment',
  'adam_action_required',
  'coordinator_reminder',
  'coordinator_to_adam',
  // SD-LEO-FIX-ADAM-INBOX-FULL-LANE-001: a coordinator_directive is a directed action item
  // for Adam (two-stage no-auto-ack, same as the rest of this allowlist) — without it the
  // full-lane inbox drain would silently drop a directive carrying this kind.
  'coordinator_directive',
  // SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-B / FR-1 (THE HIGHEST-LEVERAGE FIX): a
  // chairman_directive is a BROADCAST directive all 3 roles must genuinely action. Without it
  // here, the generic inbox drain auto-acked/consumed it before any role acted — the exact
  // last-hop silent death that let a 5-min-baseline directive die (Solomon ran 2h
  // non-compliant). As a DIRECTIVE_KIND it is deliver-not-consume (read_at=DELIVERED only;
  // payload.actioned_at=ACTIONED reserved for the acting role). The ack reply
  // (chairman_directive_ack) is a terminal reply, NOT a directive — deliberately absent here.
  'chairman_directive',
  // SD-LEO-INFRA-MID-FLIGHT-DIRECTIVE-001 / FR-2: fence/hard-stop notices need the same
  // deliver-not-consume guarantee as the rest of this allowlist, PLUS priority-exempt
  // selection in coordination-inbox.cjs (FR-1) so an older row never starves it out of
  // the oldest-N surfaced window.
  'fence_notice',
]);

// Kinds that must NEVER be starved out of coordination-inbox.cjs's oldest-N row cap —
// a subset of DIRECTIVE_KINDS whose urgency requires priority-exempt selection, not just
// deliver-not-consume semantics. Kept as its own list (not "all of DIRECTIVE_KINDS") so
// existing directive kinds keep today's plain oldest-first fairness ordering; only the
// kinds explicitly named here bypass the row cap.
const PRIORITY_EXEMPT_DIRECTIVE_KINDS = Object.freeze(['fence_notice']);

// SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001: handler-owned / terminal kinds the Adam
// lane surfaces must NEVER drain, list, or count in the acknowledged_at IS NULL recovery
// tier — each either has a dedicated responder that owns the row (canary_request,
// comms_check) or is a terminal acknowledgement nobody ever acks (ack, coordinator_ack),
// which would pollute an unacked-tier forever. Canonical home here (kinds module) so
// adam-advisory.cjs, read-adam-directives.cjs and adam-quiet-tick.mjs share one list
// without a require cycle (adam-advisory already requires read-adam-directives).
const ADAM_EXCLUDED_KINDS = Object.freeze(['canary_request', 'comms_check', 'ack', 'coordinator_ack']);

const FLEET_ACTIVE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Self-env-loading service client (RLS-bypass). Throws only if no URL/service
 * key can be found after the ancestor `.env` walk.
 */
function getServiceClient() {
  return createSupabaseServiceClient();
}

/**
 * Self-env-loading read client. Prefers the service client (so reads are not
 * RLS-filtered); falls back to the anon client when no service key is present.
 */
function getReadClient() {
  try {
    return createSupabaseServiceClient();
  } catch {
    return createSupabaseClient();
  }
}

/**
 * Sessions that have heartbeat within `withinMs` (default 15m), newest first.
 * Uses heartbeat_at (the correct column) so callers don't trip on last_heartbeat.
 */
async function getActiveSessions(sb, { withinMs = FLEET_ACTIVE_WINDOW_MS } = {}) {
  const C = CLAUDE_SESSIONS_COLUMNS;
  const since = new Date(Date.now() - withinMs).toISOString();
  const { data, error } = await sb
    .from('claude_sessions')
    .select([C.sessionId, C.sdKey, C.status, C.heartbeatAt, C.worktreePath, C.metadata].join(', '))
    .gte(C.heartbeatAt, since)
    .order(C.heartbeatAt, { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Coordination messages addressed to a session, newest first. Uses
 * target_session/sender_session/created_at (the correct columns).
 *
 * SD-LEO-INFRA-DURABLE-PARK-EXPIRED-001 / FR-1: `excludeExpired` drops rows whose
 * expires_at has passed (beyond `expiryGraceMs`, default 60s to tolerate clock
 * skew between sessions). Opt-in and defaulted OFF so the 13+ other callers of
 * this helper (nudges, reservations, resume history, etc.) are unaffected —
 * only the WORK_ASSIGNMENT pull in lib/checkin/steps/directed-assignment.cjs
 * needs a TTL'd assignment to stop being re-selected after it expires.
 */
async function getMessagesForSession(sb, sessionId, { sinceIso = null, unreadOnly = false, unackedOnly = false, excludeExpired = false, expiryGraceMs = 60000 } = {}) {
  const C = SESSION_COORDINATION_COLUMNS;
  let q = sb
    .from('session_coordination')
    .select([C.id, C.messageType, C.subject, C.body, C.payload, C.senderType, C.createdAt, C.expiresAt, C.readAt, C.acknowledgedAt].join(', '))
    .eq(C.targetSession, sessionId)
    .order(C.createdAt, { ascending: false });
  if (sinceIso) q = q.gte(C.createdAt, sinceIso);
  if (unreadOnly) q = q.is(C.readAt, null);
  // unackedOnly = genuinely UNCONSUMED (acknowledged_at IS NULL) regardless of read_at. The
  // coordinator->worker push surfacer (worker-checkin) re-surfaces until ACKNOWLEDGED, so it
  // must not be hidden merely because a poll stamped read_at=DELIVERED (the read/ack split).
  if (unackedOnly) q = q.is(C.acknowledgedAt, null);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data || [];
  if (!excludeExpired) return rows;
  const cutoff = Date.now() - expiryGraceMs;
  return rows.filter((m) => {
    const raw = m[C.expiresAt];
    if (!raw) return true;
    const exp = Date.parse(raw);
    return !Number.isFinite(exp) || exp >= cutoff;
  });
}

module.exports = {
  SESSION_COORDINATION_COLUMNS,
  CLAUDE_SESSIONS_COLUMNS,
  PAYLOAD_KINDS,
  DIRECTIVE_KINDS,
  PRIORITY_EXEMPT_DIRECTIVE_KINDS,
  ADAM_EXCLUDED_KINDS,
  FLEET_ACTIVE_WINDOW_MS,
  getServiceClient,
  getReadClient,
  getActiveSessions,
  getMessagesForSession,
};
