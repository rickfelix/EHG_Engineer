/**
 * session_coordination lane delivery contract — SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001.
 *
 * ONE module for SEND validation and canonical DRAIN reads, closing the architecture gap
 * behind nine first-hand defect instances (untyped rows silently skipped, dual body
 * locations splitting readers, courtesy-ACKs blocking canonical answers, re-target
 * provenance loss, mechanical rows rendered as authored messages).
 *
 * FR-1 — validateOnSend: typed payload.kind enforcement staged OFF/OBSERVE/ENFORCE,
 * reusing lib/claim/gates/dispatch-authorization.cjs's proven two-flag-ladder shape
 * VERBATIM. A universally-required validator would break the live fleet today (payload-less
 * rows are deliberate in places; ~34 raw insert sites bypass the existing partial choke
 * point at lib/coordinator/dispatch.cjs:587) -- OFF by default, ENFORCE only after an
 * observe-window confirms near-zero unexpected violations on the named seams.
 *
 * FR-2 — readCanonicalBody: dual-read (payload.body primary, body column fallback).
 * Three divergent read orders exist live today (payload-first, column-first,
 * subject-first); one reader never checks the body column at all (the coordinator_request
 * body-drop, instance 4). Canonical = payload.body; fallback preserves legacy rows written
 * before this SD with no historical backfill required.
 */
'use strict';

const BASE_FLAG = 'session_coordination_lane_contract_born_denied';
const ENFORCE_FLAG = 'session_coordination_lane_contract_enforce';

/**
 * Resolve the SEND-validation mode from the two-flag ladder. Any evaluator fault resolves
 * to 'off' -- a flag-infrastructure error must never change delivery behavior on live
 * fleet coordination.
 * @param {{isEnabledFn?: (flagKey: string) => Promise<boolean>}} [opts] test seam
 * @returns {Promise<'off'|'observe'|'enforce'>}
 */
async function resolveLaneContractMode({ isEnabledFn } = {}) {
  try {
    let isEnabled = isEnabledFn;
    if (typeof isEnabled !== 'function') {
      ({ isEnabled } = await import('../feature-flags/evaluator.js'));
    }
    if (!(await isEnabled(BASE_FLAG))) return 'off';
    return (await isEnabled(ENFORCE_FLAG)) ? 'enforce' : 'observe';
  } catch {
    return 'off'; // fail-soft, matches dispatch-authorization.cjs precedent
  }
}

/**
 * Validate a session_coordination row against the SEND contract (payload.kind required).
 * off     -> {valid:true, mode:'off'} with zero checks
 * observe -> valid row: {valid:true, mode}; invalid row: {valid:true, would_deny:true, reason}
 * enforce -> valid row: {valid:true, mode}; invalid row: {valid:false, reason}
 *
 * @param {object} row - the row about to be inserted (must have .payload)
 * @param {{mode: 'off'|'observe'|'enforce'}} opts - caller-resolved mode (see resolveLaneContractMode)
 * @returns {{valid: boolean, mode: string, would_deny?: boolean, reason?: string}}
 */
function validateOnSend(row, { mode = 'off' } = {}) {
  if (mode !== 'observe' && mode !== 'enforce') {
    return { valid: true, mode: 'off' };
  }
  const kind = row && row.payload && typeof row.payload === 'object' ? row.payload.kind : undefined;
  if (kind !== undefined && kind !== null && kind !== '') {
    return { valid: true, mode };
  }
  const reason = 'lane_contract_untyped_payload_kind';
  return mode === 'observe'
    ? { valid: true, mode, would_deny: true, reason }
    : { valid: false, mode, reason };
}

/** One consistent WOULD-DENY line for the observe-window evidence trail. */
function formatWouldDenyLine(row, verdict) {
  const id = (row && row.id) || '(pre-insert)';
  return `LANE_CONTRACT_WOULD_DENY row=${id} reason=${verdict.reason} (observe mode — send proceeds; SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001)`;
}

const WOULD_DENY_EVENT_TYPE = 'LANE_CONTRACT_WOULD_DENY';

/**
 * Durable observe-window evidence, fail-soft (a write failure never blocks or alters the
 * send that observe mode already guarantees never blocks). Mirrors
 * dispatch-authorization.cjs's recordWouldDenyEvidence exactly.
 * @param {object} supabase - service-role client
 * @param {object} row
 * @param {{reason?: string}} verdict
 * @returns {Promise<void>}
 */
async function recordWouldDenyEvidence(supabase, row, verdict) {
  try {
    await supabase.from('system_events').insert({
      event_type: WOULD_DENY_EVENT_TYPE,
      payload: { reason: verdict.reason, row_subject: row && row.subject, target_session: row && row.target_session },
    });
  } catch {
    // fail-soft by design
  }
}

/**
 * Canonical body read (FR-2). payload.body is the canonical location; the body column is
 * a fallback for legacy rows written before this SD (no backfill). Returns '' (never
 * null/undefined) when neither location has content, so callers doing string operations
 * never need a null-check.
 * @param {{ body?: string, payload?: { body?: string } }} row
 * @returns {string}
 */
function readCanonicalBody(row) {
  if (!row) return '';
  const payloadBody = row.payload && typeof row.payload === 'object' ? row.payload.body : undefined;
  if (typeof payloadBody === 'string' && payloadBody.length > 0) return payloadBody;
  if (typeof row.body === 'string') return row.body;
  return '';
}

/**
 * ---------------------------------------------------------------------------------------
 * SD-LEO-INFRA-COMMS-LANE-TTLS-001 — kind->lane mapping + lane TTL registry (FR-1) and
 * payload-only expired-unread stamping (FR-2).
 *
 * NOT the same "lane" as this file's own SEND-contract mode (off/observe/enforce) above —
 * this is a SEPARATE conceptual axis: which of 4 delivery lanes (directive/reply/advisory/
 * suggestion) a live payload.kind belongs to, and how long an unread row in that lane may
 * age before it counts as an expired dead letter.
 *
 * The mapping is built ON TOP of lib/fleet/worker-status.cjs's existing, exhaustive-by-
 * design DIRECTIVE_KINDS / ADVISORY_KINDS registries (never duplicated) rather than
 * re-deriving a parallel taxonomy from scratch — a fully-paged 6662-row census (STORIES
 * evidence 414186aa) found ZERO live rows whose payload.kind is literally "directive" or
 * "advisory"; those are this SD's CONCEPTUAL lane names, not payload.kind values, so every
 * real kind must be bucketed explicitly.
 *
 * Exhaustive, no silent drop: resolveLaneForKind ALWAYS returns one of the 4 tracked lanes
 * or the explicit 'untracked' bucket — never null/undefined/throw. Landing in 'untracked'
 * is a reviewed classification (mirrors INFORMATIONAL_KINDS' own "not a shrug" contract),
 * not a gap; those kinds carry no TTL and are never eligible for the FR-2 expired-unread
 * stamp.
 */
const { DIRECTIVE_KINDS, ADVISORY_KINDS } = require('../fleet/worker-status.cjs');

const COMMS_LANE_TTLS_SD = 'SD-LEO-INFRA-COMMS-LANE-TTLS-001';

/** The 4 tracked conceptual lanes, in priority order for resolveLaneForKind's lookup. */
const LANES = Object.freeze(['directive', 'reply', 'advisory', 'suggestion']);

/** Kinds landing in the 'untracked' bucket are a reviewed decision, not a gap — see header. */
const UNTRACKED_LANE = 'untracked';

// 'reply' = worker-status.cjs's own ADVISORY_KINDS list (coordinator_reply, completion_nudge)
// -- terminal acks/replies, NOT this SD's 'advisory' lane. Kept as its own explicit list
// (not re-exported under a renamed key) so a future edit to worker-status.cjs's list is
// picked up here automatically without this file re-deciding the mapping.
const REPLY_KINDS = ADVISORY_KINDS;

// This SD's 'advisory' lane: heads-up / consult / feedback kinds that are neither a
// directive (genuine required action) nor a terminal reply. Explicit list -- there is no
// existing registry for this bucket to defer to.
const ADVISORY_LANE_KINDS = Object.freeze([
  'adam_advisory',
  'coordinator_advisory',
  'chairman_heads_up',
  'chairman_handoff',
  'solomon_duty_reminder',
  'solomon_consult',
  'coordinator_adam_feedback',
  'canary_request',
  'relay_request',
  'relay_confirm',
  'coordinator_reservation',
  'seat_busy_reservation',
  'cross_party_ping',
  'assist_request',
  'reconcile_consult',
  'coordinator_source_request',
  'coordinator_review',
]);

// This SD's 'suggestion' lane: dispatch-belt suggestions and their accept/override reply.
const SUGGESTION_LANE_KINDS = Object.freeze(['dispatch_suggestion', 'dispatch_override']);

const LANE_KIND_SETS = Object.freeze({
  directive: DIRECTIVE_KINDS,
  reply: REPLY_KINDS,
  advisory: ADVISORY_LANE_KINDS,
  suggestion: SUGGESTION_LANE_KINDS,
});

/**
 * Bucket a real live payload.kind into one of the 4 tracked lanes, or 'untracked' if no
 * bucket claims it (roll_call, periodic_liveness_*, ping_on_silence, comms_check, ack,
 * etc. -- machine-emitted/self-deduped kinds with no dead-letter concept, same set
 * worker-status.cjs's own INFORMATIONAL_KINDS/ADAM_EXCLUDED_KINDS already exclude from
 * every other actionability axis).
 * @param {string|null|undefined} kind
 * @returns {'directive'|'reply'|'advisory'|'suggestion'|'untracked'}
 */
function resolveLaneForKind(kind) {
  if (!kind) return UNTRACKED_LANE;
  for (const lane of LANES) {
    if (LANE_KIND_SETS[lane].includes(kind)) return lane;
  }
  return UNTRACKED_LANE;
}

/**
 * Per-lane TTL registry, re-keyed from lib/coordinator/reply-class.cjs's single
 * DEFAULT_REPLY_WINDOW_MS (2h) into 4 lane-appropriate windows. 'untracked' deliberately
 * has NO entry -- resolveLaneTtlMs returns null for it, and null means "never eligible"
 * everywhere this registry is consulted (FR-2's isExpiredUnread, any future gauge).
 */
const LANE_TTL_MS = Object.freeze({
  directive: 2 * 60 * 60 * 1000, // matches reply-class.cjs DEFAULT_REPLY_WINDOW_MS -- genuine action required
  reply: 4 * 60 * 60 * 1000,
  advisory: 24 * 60 * 60 * 1000,
  suggestion: 48 * 60 * 60 * 1000,
});

/**
 * @param {'directive'|'reply'|'advisory'|'suggestion'|'untracked'|string} lane
 * @returns {number|null} TTL in ms, or null for 'untracked'/any unrecognized lane
 */
function resolveLaneTtlMs(lane) {
  return Object.prototype.hasOwnProperty.call(LANE_TTL_MS, lane) ? LANE_TTL_MS[lane] : null;
}

const DEAD_LETTER_TTL_MARKER_KEY = 'dead_letter_ttl';

/**
 * FR-2 predicate: is this row an expired, unread dead letter for its lane's TTL?
 * Mirrors lib/coordination/dead-letter-drain.js's isPurgeEligible fail-closed shape
 * exactly -- absent/unparseable timestamps, an already-read row, or an untracked lane
 * (null TTL) all resolve to NOT eligible; there is no default-to-eligible path.
 * @param {{payload?:{kind?:string}, created_at?:string|null, read_at?:string|null}} row
 * @param {{nowMs?:number}} [opts]
 * @returns {boolean}
 */
function isExpiredUnread(row = {}, { nowMs = Date.now() } = {}) {
  if (row.read_at) return false;
  const lane = resolveLaneForKind(row.payload && row.payload.kind);
  const ttlMs = resolveLaneTtlMs(lane);
  if (ttlMs === null) return false;
  const createdAt = row.created_at ? new Date(row.created_at).getTime() : NaN;
  if (!Number.isFinite(createdAt)) return false;
  return (nowMs - createdAt) > ttlMs;
}

/**
 * FR-2 patch builder: the marker this SD stamps on an expired-unread row. PAYLOAD-ONLY --
 * writes payload.dead_letter_ttl (an object), never a timestamp column, same discipline as
 * dead-letter-drain.js's buildStampPatch and the SAME reason that key is chosen: it must
 * never collide with that module's own payload.dead_letter_drained marker (a different
 * key, already live on this table) nor with the payload.dead_letter key already live on
 * ~63% of rows via the periodic-liveness target_dead path (STORIES evidence 414186aa).
 * @param {{payload?:object}} row
 * @param {{nowMs?:number}} [opts]
 * @returns {{payload:object}}
 */
function buildExpiredUnreadStampPatch(row = {}, { nowMs = Date.now() } = {}) {
  const lane = resolveLaneForKind(row.payload && row.payload.kind);
  const ttlMs = resolveLaneTtlMs(lane);
  return {
    payload: {
      ...(row.payload || {}),
      [DEAD_LETTER_TTL_MARKER_KEY]: {
        lane,
        ttl_ms: ttlMs,
        at: new Date(nowMs).toISOString(),
        sd: COMMS_LANE_TTLS_SD,
      },
    },
  };
}

module.exports = {
  resolveLaneContractMode,
  validateOnSend,
  formatWouldDenyLine,
  recordWouldDenyEvidence,
  readCanonicalBody,
  WOULD_DENY_EVENT_TYPE,
  BASE_FLAG,
  ENFORCE_FLAG,
  // SD-LEO-INFRA-COMMS-LANE-TTLS-001 FR-1/FR-2
  LANES,
  UNTRACKED_LANE,
  LANE_KIND_SETS,
  LANE_TTL_MS,
  DEAD_LETTER_TTL_MARKER_KEY,
  COMMS_LANE_TTLS_SD,
  resolveLaneForKind,
  resolveLaneTtlMs,
  isExpiredUnread,
  buildExpiredUnreadStampPatch,
};
