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
]);

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
 */
async function getMessagesForSession(sb, sessionId, { sinceIso = null, unreadOnly = false, unackedOnly = false } = {}) {
  const C = SESSION_COORDINATION_COLUMNS;
  let q = sb
    .from('session_coordination')
    .select([C.id, C.messageType, C.subject, C.body, C.payload, C.senderType, C.createdAt, C.readAt, C.acknowledgedAt].join(', '))
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
  return data || [];
}

module.exports = {
  SESSION_COORDINATION_COLUMNS,
  CLAUDE_SESSIONS_COLUMNS,
  PAYLOAD_KINDS,
  DIRECTIVE_KINDS,
  FLEET_ACTIVE_WINDOW_MS,
  getServiceClient,
  getReadClient,
  getActiveSessions,
  getMessagesForSession,
};
