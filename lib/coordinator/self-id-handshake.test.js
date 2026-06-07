/**
 * Unit tests for the 3-part mutual self-identification handshake.
 * SD-LEO-INFRA-ADD-PART-MUTUAL-001.
 *
 * Network-free: the pure core (decideSelfIdHandshake) is exercised against injected
 * session_coordination rows + self-context. The IO wiring (planAndApplySelfIdHandshake
 * / announceSelfId / discoverCoordinatorViaHandshake) is exercised against a fake
 * supabase that records inserts and an injected registerFn — NO real DB, NO fs writes,
 * NO network.
 *
 * Asserts (per the SD deliverable):
 *   (1) INITIATOR declares identity; RESPONDER self-identifies + (if coordinator) re-registers;
 *   (2) MUTUAL CONFIRM is emitted by the initiator;
 *   (3) handshake is idempotent (no duplicate reply/confirm);
 *   (4) flag-OFF is byte-identical-inert (zero writes);
 *   (5) discovery fallback finds a self-identified coordinator without the is_coordinator flag;
 *   (6) payloads carry NO signal_type / intent_action (off the friction router).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
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
  planAndApplySelfIdHandshake,
  announceSelfId,
  discoverCoordinatorViaHandshake,
} = require('./self-id-handshake.cjs');

const COORD = 'coordinator-session-uuid';
const WORKER = 'worker-session-uuid';

const requestRow = (over = {}) => ({
  id: over.id ?? 'req-1',
  sender_session: over.sender_session ?? WORKER,
  target_session: 'target_session' in over ? over.target_session : null, // broadcast
  payload: 'payload' in over ? over.payload : buildSelfIdRequestPayload({
    initiatorSession: WORKER, initiatorRole: 'worker', requestRole: 'coordinator',
  }),
});

const replyRow = (over = {}) => ({
  id: over.id ?? 'rep-1',
  sender_session: over.sender_session ?? COORD,
  target_session: 'target_session' in over ? over.target_session : WORKER,
  payload: 'payload' in over ? over.payload : buildSelfIdReplyPayload({
    responderSession: COORD, responderRole: 'coordinator', inReplyTo: 'req-1', isCoordinator: true,
  }),
});

// ── Builders (FR-1, no signal_type) ─────────────────────────────────────────

describe('payload builders — off the friction router', () => {
  it('request/reply/confirm carry kind and NO signal_type / intent_action', () => {
    const req = buildSelfIdRequestPayload({ initiatorSession: WORKER, initiatorRole: 'worker' });
    const rep = buildSelfIdReplyPayload({ responderSession: COORD, responderRole: 'coordinator', inReplyTo: 'req-1', isCoordinator: true });
    const con = buildSelfIdConfirmPayload({ confirmerSession: WORKER, peerSession: COORD, inReplyTo: 'rep-1' });
    expect(req.kind).toBe(SELF_ID_REQUEST_KIND);
    expect(req.request_role).toBe('coordinator'); // default
    expect(rep.kind).toBe(SELF_ID_REPLY_KIND);
    expect(rep.is_coordinator).toBe(true);
    expect(con.kind).toBe(SELF_ID_CONFIRM_KIND);
    for (const p of [req, rep, con]) {
      expect(p.signal_type).toBeUndefined();
      expect(p.intent_action).toBeUndefined();
    }
  });

  it('predicates classify each kind', () => {
    expect(isSelfIdRequest(requestRow())).toBe(true);
    expect(isSelfIdReply(replyRow())).toBe(true);
    expect(isSelfIdConfirm({ payload: { kind: SELF_ID_CONFIRM_KIND } })).toBe(true);
    expect(isSelfIdRequest(replyRow())).toBe(false);
  });
});

// ── CORE (pure) ─────────────────────────────────────────────────────────────

describe('decideSelfIdHandshake — pure core', () => {
  it('(1) the coordinator replies to a coordinator discovery request AND re-registers', () => {
    const [d] = decideSelfIdHandshake([requestRow()], { selfSessionId: COORD, selfRole: 'coordinator', selfIsCoordinator: true });
    expect(d.action).toBe('reply');
    expect(d.requestId).toBe('req-1');
    expect(d.to).toBe(WORKER);       // reply targets the initiator
    expect(d.register).toBe(true);   // self-heal the is_coordinator flag
  });

  it('a NON-coordinator does NOT answer a coordinator-role request', () => {
    const decisions = decideSelfIdHandshake([requestRow()], { selfSessionId: 'peer', selfRole: 'worker', selfIsCoordinator: false });
    expect(decisions).toHaveLength(0);
  });

  it('an empty/missing request_role lets any peer self-identify (mutual self-ID), register=false', () => {
    // Raw row with an empty request_role (the builder defaults '' → 'coordinator',
    // so this exercises the core's defensive branch for legacy/malformed rows).
    const req = requestRow({ payload: { kind: SELF_ID_REQUEST_KIND, initiator_session: WORKER, initiator_role: 'worker', request_role: '' } });
    const [d] = decideSelfIdHandshake([req], { selfSessionId: 'peer', selfRole: 'worker', selfIsCoordinator: false });
    expect(d.action).toBe('reply');
    expect(d.register).toBe(false);
  });

  it('a session never answers its OWN request', () => {
    const decisions = decideSelfIdHandshake([requestRow({ sender_session: COORD, payload: buildSelfIdRequestPayload({ initiatorSession: COORD, requestRole: 'coordinator' }) })],
      { selfSessionId: COORD, selfRole: 'coordinator', selfIsCoordinator: true });
    expect(decisions).toHaveLength(0);
  });

  it('(3) idempotent — a request already replied-to by self yields NO new reply', () => {
    const priorReply = replyRow({ id: 'my-rep', sender_session: COORD, target_session: WORKER,
      payload: buildSelfIdReplyPayload({ responderSession: COORD, responderRole: 'coordinator', inReplyTo: 'req-1', isCoordinator: true }) });
    const decisions = decideSelfIdHandshake([requestRow(), priorReply], { selfSessionId: COORD, selfRole: 'coordinator', selfIsCoordinator: true });
    // the prior reply is from self (skipped in initiator branch); the request is already-replied → no reply
    expect(decisions.filter(d => d.action === 'reply')).toHaveLength(0);
  });

  it('(2) the INITIATOR confirms a reply to its own request', () => {
    const [d] = decideSelfIdHandshake([replyRow()], { selfSessionId: WORKER, selfRole: 'worker', selfIsCoordinator: false });
    expect(d.action).toBe('confirm');
    expect(d.replyId).toBe('rep-1');
    expect(d.to).toBe(COORD);
    expect(d.peer).toBe(COORD);
  });

  it('(3) idempotent — a reply already confirmed by self yields NO new confirm', () => {
    const priorConfirm = { id: 'my-con', sender_session: WORKER, target_session: COORD,
      payload: buildSelfIdConfirmPayload({ confirmerSession: WORKER, peerSession: COORD, inReplyTo: 'rep-1' }) };
    const decisions = decideSelfIdHandshake([replyRow(), priorConfirm], { selfSessionId: WORKER, selfRole: 'worker', selfIsCoordinator: false });
    expect(decisions.filter(d => d.action === 'confirm')).toHaveLength(0);
  });

  it('ignores a reply not targeted at me, and a proactive announce (in_reply_to=null)', () => {
    const notMine = replyRow({ target_session: 'someone-else' });
    const announce = replyRow({ id: 'ann', target_session: null,
      payload: buildSelfIdReplyPayload({ responderSession: COORD, responderRole: 'coordinator', inReplyTo: null, isCoordinator: true }) });
    const decisions = decideSelfIdHandshake([notMine, announce], { selfSessionId: WORKER, selfRole: 'worker', selfIsCoordinator: false });
    expect(decisions).toHaveLength(0);
  });
});

// ── IO wiring (fake supabase, network-free) ─────────────────────────────────

function makeFakeSupabase({ limitData = [], singleData = null } = {}) {
  const inserts = [];
  const sb = {
    from(table) {
      if (table !== 'session_coordination' && table !== 'claude_sessions') {
        throw new Error('unexpected table ' + table);
      }
      const builder = {
        select() { return builder; },
        gte() { return builder; },
        eq() { return builder; },
        in() { return builder; },
        order() { return builder; },
        limit() { return Promise.resolve({ data: limitData, error: null }); },
        maybeSingle() { return Promise.resolve({ data: singleData, error: null }); },
        insert(row) { inserts.push(row); return Promise.resolve({ data: { id: 'ins-1' }, error: null }); },
      };
      return builder;
    },
  };
  return { sb, inserts };
}

describe('planAndApplySelfIdHandshake — tick wiring (network-free)', () => {
  it('flag ON (coordinator): replies to a discovery request + re-registers (injected registerFn)', async () => {
    const { sb, inserts } = makeFakeSupabase({ limitData: [requestRow()] });
    let registered = false;
    const res = await planAndApplySelfIdHandshake(sb, {
      selfSessionId: COORD, selfRole: 'coordinator', selfIsCoordinator: true,
      env: { COORD_SELF_ID_V1: 'true' },
      registerFn: async () => { registered = true; return { ok: true }; },
    });
    expect(res.enabled).toBe(true);
    expect(res.replied).toBe(1);
    expect(res.registered).toBe(1);
    expect(registered).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload.kind).toBe(SELF_ID_REPLY_KIND);
    expect(inserts[0].target_session).toBe(WORKER);
    expect(inserts[0].message_type).toBe('INFO');
    expect(inserts[0].payload.signal_type).toBeUndefined();
  });

  it('flag OFF: byte-identical-inert — decisions computed but ZERO writes, no register', async () => {
    const { sb, inserts } = makeFakeSupabase({ limitData: [requestRow()] });
    let registered = false;
    const res = await planAndApplySelfIdHandshake(sb, {
      selfSessionId: COORD, selfRole: 'coordinator', selfIsCoordinator: true,
      env: { COORD_SELF_ID_V1: 'false' },
      registerFn: async () => { registered = true; return { ok: true }; },
    });
    expect(res.enabled).toBe(false);
    expect(res.replied).toBe(0);
    expect(res.registered).toBe(0);
    expect(res.decisions.length).toBe(1); // pure core still ran
    expect(registered).toBe(false);
    expect(inserts).toHaveLength(0);
  });
});

describe('announceSelfId — proactive self-heal', () => {
  it('flag ON (coordinator): announces (broadcast) + re-registers', async () => {
    const { sb, inserts } = makeFakeSupabase();
    let registered = false;
    const res = await announceSelfId(sb, {
      selfSessionId: COORD, isCoordinator: true,
      env: { COORD_SELF_ID_V1: 'true' },
      registerFn: async () => { registered = true; return { ok: true }; },
    });
    expect(res.announced).toBe(1);
    expect(res.registered).toBe(1);
    expect(registered).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].target_session).toBeNull(); // broadcast
    expect(inserts[0].payload.is_coordinator).toBe(true);
  });

  it('flag OFF: inert (no announce, no register)', async () => {
    const { sb, inserts } = makeFakeSupabase();
    const res = await announceSelfId(sb, { selfSessionId: COORD, isCoordinator: true, env: { COORD_SELF_ID_V1: 'false' } });
    expect(res.announced).toBe(0);
    expect(inserts).toHaveLength(0);
  });
});

describe('discoverCoordinatorViaHandshake — resolve.cjs fallback', () => {
  it('flag OFF → null (no discovery attempt)', async () => {
    const { sb } = makeFakeSupabase();
    const r = await discoverCoordinatorViaHandshake(sb, WORKER, { env: { COORD_SELF_ID_V1: 'false' } });
    expect(r).toBeNull();
  });

  it('flag ON: returns the coordinator from a fresh self_id_reply (no is_coordinator flag needed)', async () => {
    const replies = [{ sender_session: COORD, payload: buildSelfIdReplyPayload({ responderSession: COORD, responderRole: 'coordinator', inReplyTo: null, isCoordinator: true }) }];
    const { sb } = makeFakeSupabase({ limitData: replies, singleData: { session_id: COORD, heartbeat_at: new Date().toISOString() } });
    const r = await discoverCoordinatorViaHandshake(sb, WORKER, { env: { COORD_SELF_ID_V1: 'true' } });
    expect(r).toBe(COORD);
  });

  it('flag ON, no coordinator identified → broadcasts a discovery request', async () => {
    const { sb, inserts } = makeFakeSupabase({ limitData: [] });
    const r = await discoverCoordinatorViaHandshake(sb, WORKER, { env: { COORD_SELF_ID_V1: 'true' } });
    expect(r).toBeNull();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload.kind).toBe(SELF_ID_REQUEST_KIND);
    expect(inserts[0].payload.request_role).toBe('coordinator');
  });
});

describe('selfIdEnabled — flag gate', () => {
  it('default OFF; "true" enables', () => {
    expect(selfIdEnabled({})).toBe(false);
    expect(selfIdEnabled({ COORD_SELF_ID_V1: 'false' })).toBe(false);
    expect(selfIdEnabled({ COORD_SELF_ID_V1: 'true' })).toBe(true);
  });
});
