/**
 * 3-part mutual self-identification handshake for coordinator discovery.
 *
 * SD-LEO-INFRA-ADD-PART-MUTUAL-001
 *
 * Real incident (2026-06-07): the Anthropic API issue cycled the coordinator + all
 * 6 workers into fresh sessions. The new coordinator never ran `/coordinator start`,
 * so claude_sessions.metadata.is_coordinator was never set — zero coordinator-flagged
 * sessions while a coordinator was genuinely alive. lib/coordinator/resolve.cjs
 * getActiveCoordinatorId() (every path filters on metadata.is_coordinator='true')
 * returned null, so the coordinator was UNDISCOVERABLE-despite-alive and Adam could
 * not route to it. Recovery was manual: Adam broadcast a self-ID handshake, the
 * coordinator self-identified AND re-registered its flag.
 *
 * This module makes that recovery a protocol primitive. The handshake is a 3-part
 * mutual self-identification exchange carried over the EXISTING session_coordination
 * transport (NO DB migration), mirroring the lib/coordinator/adam-action-ack.cjs
 * pattern (pure DI core + flag-gated, fail-open tick):
 *
 *   (1) INITIATOR declares identity — a `self_id_request` row asks "who is the
 *       coordinator?" (payload.request_role) and declares the initiator's own
 *       session_id + role.
 *   (2) RESPONDER self-identifies — a session matching the requested role replies
 *       with a `self_id_reply` (its role + session_id) and, when it is genuinely the
 *       coordinator, RE-REGISTERS via resolve.cjs setActiveCoordinator() — self-
 *       healing the discovery gap so the next flag lookup succeeds without the
 *       handshake.
 *   (3) MUTUAL CONFIRM — the initiator answers a reply to its own request with a
 *       `self_id_confirm`, so each party has acknowledged it verified the other.
 *
 * The is_coordinator flag stays PRIMARY (resolve.cjs tries it first); this handshake
 * is a FALLBACK used only when the flag is empty. All write behavior is gated behind
 * COORD_SELF_ID_V1 (default OFF) — flag-OFF the module is byte-identical-inert (the
 * core still returns decisions, but the tick performs ZERO DB writes).
 *
 * INVARIANT: handshake rows use payload.kind on message_type=INFO with NO
 * payload.signal_type / intent_action, so neither the friction signal-router
 * (lib/coordinator/signal-router.cjs) nor the intent-deconfliction sweep scoops them
 * — identical contract to roll_call / comms_check / adam_advisory.
 *
 * CommonJS (.cjs) so scripts/stale-session-sweep.cjs (the .cjs coordinator tick) and
 * scripts/coordinator-comms-check.mjs (via createRequire) can require() it. resolve.cjs
 * is lazy-require()d inside function bodies to avoid a circular module dependency.
 *
 * @module lib/coordinator/self-id-handshake
 */

'use strict';

/** payload.kind discriminators (mirror lib/fleet/worker-status.cjs PAYLOAD_KINDS —
 *  carried on the existing INFO message_type, OFF the friction router). */
const SELF_ID_REQUEST_KIND = 'self_id_request';
const SELF_ID_REPLY_KIND = 'self_id_reply';
const SELF_ID_CONFIRM_KIND = 'self_id_confirm';

/** Heartbeat-freshness window for a coordinator discovered via a self_id_reply
 *  (matches resolve.cjs STALE_THRESHOLD_MIN). */
const DEFAULT_STALE_MIN = 10;

/** Don't re-broadcast a discovery request more than once per this window. */
const DEFAULT_REQUEST_DEDUP_MIN = 5;

/** Env flag gating all WRITE behavior (default OFF). Flag-OFF the tick is fully
 *  inert (zero writes) — the pure core still returns decisions so callers/tests can
 *  observe them, mirroring adam-action-ack.cjs escalationEnabled(). */
function selfIdEnabled(env) {
  env = env || process.env;
  return String(env.COORD_SELF_ID_V1 ?? 'false').toLowerCase() !== 'false';
}

// ── Predicates (pure) ───────────────────────────────────────────────────────

function isSelfIdRequest(msg) {
  return !!msg && !!msg.payload && msg.payload.kind === SELF_ID_REQUEST_KIND;
}
function isSelfIdReply(msg) {
  return !!msg && !!msg.payload && msg.payload.kind === SELF_ID_REPLY_KIND;
}
function isSelfIdConfirm(msg) {
  return !!msg && !!msg.payload && msg.payload.kind === SELF_ID_CONFIRM_KIND;
}

// ── Payload builders (pure; NO signal_type / intent_action) ─────────────────

/** (1) INITIATOR declares identity + asks who holds requestRole (default 'coordinator'). */
function buildSelfIdRequestPayload({ initiatorSession, initiatorRole, requestRole } = {}) {
  return {
    kind: SELF_ID_REQUEST_KIND,
    initiator_session: initiatorSession || null,
    initiator_role: initiatorRole || 'unknown',
    request_role: requestRole || 'coordinator',
  };
}

/** (2) RESPONDER self-identifies (role + session_id). inReplyTo is null for a
 *  PROACTIVE announce (e.g. at coordinator startup) or the request id for a reply. */
function buildSelfIdReplyPayload({ responderSession, responderRole, inReplyTo, isCoordinator } = {}) {
  return {
    kind: SELF_ID_REPLY_KIND,
    responder_session: responderSession || null,
    role: responderRole || 'unknown',
    is_coordinator: !!isCoordinator,
    in_reply_to: inReplyTo || null,
  };
}

/** (3) MUTUAL CONFIRM — the initiator acknowledges it verified the responder. */
function buildSelfIdConfirmPayload({ confirmerSession, peerSession, inReplyTo } = {}) {
  return {
    kind: SELF_ID_CONFIRM_KIND,
    confirmer_session: confirmerSession || null,
    peer_session: peerSession || null,
    in_reply_to: inReplyTo || null,
  };
}

// ── CORE — pure, dependency-injected decision function ──────────────────────

/**
 * Given handshake rows + self-context, decide the actions THIS session should take,
 * WITHOUT performing any IO. Mirrors adam-action-ack.cjs decideAdamActionAcks.
 *
 * Decisions (no side effects):
 *   { action: 'reply',   requestId, to, register }  — I match a discovery request → reply (+ re-register if I'm the coordinator)
 *   { action: 'confirm', replyId, to, peer }        — a reply to MY request arrived → mutual confirm
 *
 * Idempotency is pure: a request I have already replied to (a self_id_reply from me
 * with in_reply_to===requestId is present in `messages`) yields no 'reply'; a reply I
 * have already confirmed (a self_id_confirm from me with in_reply_to===replyId present)
 * yields no 'confirm'. This makes repeated ticks converge with no duplicate rows.
 *
 * @param {Array<object>} messages - session_coordination rows (mixed kinds)
 * @param {object} opts
 * @param {string} opts.selfSessionId - my session_id
 * @param {string} [opts.selfRole='unknown'] - my declared role
 * @param {boolean} [opts.selfIsCoordinator=false] - am I genuinely the coordinator?
 * @returns {Array<object>} decisions
 */
function decideSelfIdHandshake(messages, opts) {
  opts = opts || {};
  const self = opts.selfSessionId || null;
  const selfRole = opts.selfRole || 'unknown';
  const selfIsCoord = opts.selfIsCoordinator === true;
  const rows = Array.isArray(messages) ? messages : [];

  // Pre-scan my own prior responses for idempotency dedup.
  const repliedRequestIds = new Set();
  const confirmedReplyIds = new Set();
  for (const m of rows) {
    if (isSelfIdReply(m) && m.payload.responder_session === self && m.payload.in_reply_to) {
      repliedRequestIds.add(m.payload.in_reply_to);
    }
    if (isSelfIdConfirm(m) && m.payload.confirmer_session === self && m.payload.in_reply_to) {
      confirmedReplyIds.add(m.payload.in_reply_to);
    }
  }

  const out = [];
  for (const m of rows) {
    if (!m || m.id == null) continue;

    // (2) RESPONDER: a discovery request I can answer.
    if (isSelfIdRequest(m)) {
      const initiator = (m.payload && m.payload.initiator_session) || m.sender_session || null;
      if (initiator === self) continue;                 // don't answer my own request
      if (repliedRequestIds.has(m.id)) continue;         // idempotent — already replied
      // Preserve an empty/missing request_role (do NOT default it here): no specific
      // role requested → any peer may self-identify (mutual self-ID). The builder
      // defaults the common case to 'coordinator'; this branch handles raw/legacy rows.
      const requestRole = m.payload && m.payload.request_role;
      const roleMatches =
        (!requestRole) ||                                  // no specific role → any peer self-IDs
        (requestRole === 'coordinator' && selfIsCoord) ||
        (requestRole === selfRole);
      if (!roleMatches) continue;
      out.push({
        action: 'reply',
        requestId: m.id,
        to: initiator,
        register: selfIsCoord && (requestRole === 'coordinator' || !requestRole),
        reason: 'self matches requested role — self-identify' + (selfIsCoord ? ' + re-register' : ''),
      });
      continue;
    }

    // (3) INITIATOR: a reply to MY request → mutual confirm.
    if (isSelfIdReply(m)) {
      const targetedAtMe = m.target_session === self;
      const responder = (m.payload && m.payload.responder_session) || m.sender_session || null;
      const inReplyTo = m.payload && m.payload.in_reply_to;
      if (!targetedAtMe || responder === self || !inReplyTo) continue; // not my reply / my own announce
      if (confirmedReplyIds.has(m.id)) continue;          // idempotent — already confirmed
      out.push({
        action: 'confirm',
        replyId: m.id,
        to: responder,
        peer: responder,
        inReplyTo,
        reason: 'reply to my discovery request — mutual confirm',
      });
      continue;
    }
  }
  return out;
}

// ── Tick wiring (IO) — FAIL-OPEN, flag-gated ────────────────────────────────

/**
 * Insert a session_coordination handshake row. INFO message_type, payload.kind only
 * (no signal_type). FAIL-OPEN: resolves {ok:false} on error, never throws.
 */
async function insertHandshakeRow(supabase, { senderSession, targetSession, subject, body, payload }) {
  try {
    const { error } = await supabase.from('session_coordination').insert({
      sender_session: senderSession || 'self-id',
      target_session: targetSession || null,
      message_type: 'INFO',
      subject: subject || '[SELF_ID]',
      body: body || null,
      payload,
      sender_type: 'self-id',
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/** Re-register self as coordinator (self-heal). Lazy-require resolve.cjs to avoid a
 *  circular module dependency. FAIL-OPEN. */
async function selfRegisterCoordinator(supabase, selfSessionId) {
  try {
    const { setActiveCoordinator } = require('./resolve.cjs');
    await setActiveCoordinator(supabase, selfSessionId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/**
 * Load handshake rows relevant to this session within the window: requests (broadcast
 * or targeted to me), and replies/confirms targeted to me. READ-ONLY; fail-soft to [].
 */
async function loadHandshakeRows(supabase, selfSessionId, opts) {
  opts = opts || {};
  const windowMin = Number.isFinite(opts.windowMin) ? opts.windowMin : 60;
  try {
    const cutoff = new Date((Number.isFinite(opts.now) ? opts.now : Date.now()) - windowMin * 60_000).toISOString();
    const { data, error } = await supabase
      .from('session_coordination')
      .select('id, sender_session, target_session, payload, subject, body, read_at, created_at')
      .gte('created_at', cutoff)
      .in('payload->>kind', [SELF_ID_REQUEST_KIND, SELF_ID_REPLY_KIND, SELF_ID_CONFIRM_KIND])
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) return [];
    // Keep rows that are broadcast (no target), targeted to me, or sent by me (for idempotency dedup).
    return (data || []).filter(
      (r) => !r.target_session || r.target_session === selfSessionId || r.sender_session === selfSessionId,
    );
  } catch (_) {
    return [];
  }
}

/**
 * Tick entry point. Loads relevant handshake rows, runs the pure core, and applies
 * reply/confirm writes + coordinator self-registration (flag-gated). FAIL-OPEN end to
 * end; fully inert (zero writes) when COORD_SELF_ID_V1 is OFF.
 *
 * @param {object} supabase
 * @param {object} opts - { selfSessionId, selfRole, selfIsCoordinator, env, now, windowMin }
 * @returns {Promise<{enabled, decisions, replied, confirmed, registered}>}
 */
async function planAndApplySelfIdHandshake(supabase, opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const self = opts.selfSessionId || null;
  const flagOn = selfIdEnabled(env);
  const registerFn = opts.registerFn || selfRegisterCoordinator; // DI seam for tests

  const messages = await loadHandshakeRows(supabase, self, { windowMin: opts.windowMin, now: opts.now });
  const decisions = decideSelfIdHandshake(messages, {
    selfSessionId: self,
    selfRole: opts.selfRole,
    selfIsCoordinator: opts.selfIsCoordinator,
  });

  // Flag OFF → return decisions but perform ZERO writes (byte-identical-inert).
  if (!flagOn) {
    return { enabled: false, decisions, replied: 0, confirmed: 0, registered: 0 };
  }

  let replied = 0, confirmed = 0, registered = 0;
  for (const d of decisions) {
    if (d.action === 'reply') {
      const payload = buildSelfIdReplyPayload({
        responderSession: self,
        responderRole: opts.selfRole,
        inReplyTo: d.requestId,
        isCoordinator: opts.selfIsCoordinator === true,
      });
      const res = await insertHandshakeRow(supabase, {
        senderSession: self,
        targetSession: d.to,
        subject: '[SELF_ID_REPLY]',
        body: 'self-identify: ' + (opts.selfRole || 'unknown') + ' ' + String(self).slice(0, 8),
        payload,
      });
      if (res.ok) {
        replied++;
        if (d.register) {
          const reg = await registerFn(supabase, self);
          if (reg && reg.ok) registered++;
        }
      }
    } else if (d.action === 'confirm') {
      const payload = buildSelfIdConfirmPayload({ confirmerSession: self, peerSession: d.peer, inReplyTo: d.replyId });
      const res = await insertHandshakeRow(supabase, {
        senderSession: self,
        targetSession: d.to,
        subject: '[SELF_ID_CONFIRM]',
        body: 'mutual confirm with ' + String(d.peer).slice(0, 8),
        payload,
      });
      if (res.ok) confirmed++;
    }
  }
  return { enabled: true, decisions, replied, confirmed, registered };
}

/**
 * Proactive identity announcement (e.g. at coordinator startup / comms-check). Writes
 * a broadcast self_id_reply (in_reply_to=null) declaring identity, and — when this
 * session is the coordinator — re-registers the is_coordinator flag (self-heal). This
 * is what closes the post-restart gap proactively. Flag-gated, fail-open.
 *
 * @returns {Promise<{enabled, announced, registered}>}
 */
async function announceSelfId(supabase, opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  const self = opts.selfSessionId || null;
  if (!selfIdEnabled(env) || !self) {
    return { enabled: selfIdEnabled(env), announced: 0, registered: 0 };
  }
  let announced = 0, registered = 0;
  const registerFn = opts.registerFn || selfRegisterCoordinator; // DI seam for tests
  const payload = buildSelfIdReplyPayload({
    responderSession: self,
    responderRole: opts.selfRole || (opts.isCoordinator ? 'coordinator' : 'unknown'),
    inReplyTo: null,
    isCoordinator: opts.isCoordinator === true,
  });
  const res = await insertHandshakeRow(supabase, {
    senderSession: self,
    targetSession: null, // broadcast
    subject: '[SELF_ID_ANNOUNCE]',
    body: 'announce: ' + (opts.isCoordinator ? 'coordinator' : (opts.selfRole || 'unknown')) + ' ' + String(self).slice(0, 8),
    payload,
  });
  if (res.ok) {
    announced++;
    if (opts.isCoordinator === true) {
      const reg = await registerFn(supabase, self);
      if (reg && reg.ok) registered++;
    }
  }
  return { enabled: true, announced, registered };
}

/**
 * resolve.cjs FALLBACK: discover the coordinator via the handshake when the
 * is_coordinator flag is empty on every session. (a) Read a recent coordinator
 * self_id_reply/announce whose responder session has a FRESH heartbeat → return that
 * session_id (discovered without the flag). (b) If none, broadcast a self_id_request
 * (idempotent within DEFAULT_REQUEST_DEDUP_MIN) so a live coordinator's tick replies +
 * self-registers, healing the gap for the next lookup. FAIL-OPEN → null on any error.
 *
 * @returns {Promise<string|null>} coordinator session_id or null
 */
async function discoverCoordinatorViaHandshake(supabase, selfSessionId, opts) {
  opts = opts || {};
  const env = opts.env || process.env;
  if (!selfIdEnabled(env) || !supabase) return null;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const staleMin = Number.isFinite(opts.staleMin) ? opts.staleMin : DEFAULT_STALE_MIN;
  try {
    const cutoff = new Date(now - staleMin * 60_000).toISOString();
    // (a) recent coordinator self-identification rows.
    const { data: replies } = await supabase
      .from('session_coordination')
      .select('sender_session, payload, created_at')
      .gte('created_at', cutoff)
      .eq('payload->>kind', SELF_ID_REPLY_KIND)
      .eq('payload->>is_coordinator', 'true')
      .order('created_at', { ascending: false })
      .limit(10);
    for (const r of replies || []) {
      const coordId = (r.payload && r.payload.responder_session) || r.sender_session;
      if (!coordId) continue;
      // Verify the responder is genuinely alive (fresh heartbeat).
      const { data: sess } = await supabase
        .from('claude_sessions')
        .select('session_id, heartbeat_at')
        .eq('session_id', coordId)
        .gte('heartbeat_at', cutoff)
        .maybeSingle();
      if (sess) return coordId;
    }

    // (b) no live coordinator identified → broadcast a discovery request (idempotent).
    const dedupCutoff = new Date(now - DEFAULT_REQUEST_DEDUP_MIN * 60_000).toISOString();
    const { data: recentReq } = await supabase
      .from('session_coordination')
      .select('id')
      .gte('created_at', dedupCutoff)
      .eq('payload->>kind', SELF_ID_REQUEST_KIND)
      .eq('payload->>initiator_session', selfSessionId || '')
      .limit(1);
    if (!recentReq || recentReq.length === 0) {
      await insertHandshakeRow(supabase, {
        senderSession: selfSessionId || 'self-id',
        targetSession: null, // broadcast
        subject: '[SELF_ID_REQUEST]',
        body: 'who is the coordinator? (is_coordinator flag empty — handshake discovery)',
        payload: buildSelfIdRequestPayload({
          initiatorSession: selfSessionId,
          initiatorRole: opts.selfRole || 'unknown',
          requestRole: 'coordinator',
        }),
      });
    }
    return null;
  } catch (_) {
    return null;
  }
}

module.exports = {
  // pure core + predicates + builders (unit-testable in isolation)
  decideSelfIdHandshake,
  isSelfIdRequest,
  isSelfIdReply,
  isSelfIdConfirm,
  buildSelfIdRequestPayload,
  buildSelfIdReplyPayload,
  buildSelfIdConfirmPayload,
  selfIdEnabled,
  SELF_ID_REQUEST_KIND,
  SELF_ID_REPLY_KIND,
  SELF_ID_CONFIRM_KIND,
  DEFAULT_STALE_MIN,
  // IO wiring (fail-open, flag-gated)
  insertHandshakeRow,
  loadHandshakeRows,
  planAndApplySelfIdHandshake,
  announceSelfId,
  discoverCoordinatorViaHandshake,
};
