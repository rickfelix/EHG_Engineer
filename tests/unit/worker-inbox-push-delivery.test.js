/**
 * SD-LEO-INFRA-WORKER-INBOX-PUSH-DELIVERY-001 — worker-facing coordinator push delivery.
 * Pins: /checkin surfaces coordinator COACHING/INFO/coordinator_reply (FR-1); friction/roll_call/
 * WA/SET_IDENTITY excluded (FR-1); non-draining bounded delivery — re-surface on missed render,
 * advisory bounded-ack after 2nd delivery, DIRECTIVE never auto-acked (FR-3); callsign re-hydration
 * from the durable SET_IDENTITY row (FR-2).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { isCoordinatorPush, surfaceCoordinatorMessages, rehydrateCallsign, resolveCheckin } = require('../../scripts/worker-checkin.cjs');
const ws = require('../../lib/fleet/worker-status.cjs');

// A fake sb that records session_coordination UPDATEs so we can assert the read/ack stamping.
function recordingSb({ setIdentityRow = null, sessionMeta = { role: 'worker' }, heldSd = null } = {}) {
  const updates = []; // {id, patch}
  return {
    updates,
    rpc: () => Promise.resolve({ data: { success: true }, error: null }),
    from(table) {
      let _eqId = null;
      const api = {
        _t: table, select() { return this; },
        eq(col, val) { if (col === 'id') _eqId = val; return this; },
        gte() { return this; }, order() { return this; }, limit() { return this; },
        is() { return this; },
        maybeSingle() {
          if (table === 'claude_sessions') return Promise.resolve({ data: { metadata: sessionMeta, sd_key: heldSd }, error: null });
          if (table === 'strategic_directives_v2') return Promise.resolve({ data: { status: 'in_progress' }, error: null });
          if (table === 'session_coordination') return Promise.resolve({ data: setIdentityRow, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        insert() { return Promise.resolve({ data: { id: 'rc-1' }, error: null, select: () => ({ single: () => Promise.resolve({ data: { id: 'rc-1' }, error: null }) }) }); },
        update(patch) { return { eq: (col, val) => { updates.push({ id: col === 'id' ? val : _eqId, patch }); return Promise.resolve({ error: null }); } }; },
      };
      // registerRollCall uses .insert().select().single()
      api.insert = (row) => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'rc-1' }, error: null }) }) });
      return api;
    },
  };
}

describe('isCoordinatorPush — selection (FR-1)', () => {
  it('surfaces a COACHING row', () => {
    expect(isCoordinatorPush({ message_type: 'COACHING', payload: {} })).toBe(true);
  });
  it('surfaces a plain coordinator INFO (no kind, no signal_type)', () => {
    expect(isCoordinatorPush({ message_type: 'INFO', payload: {} })).toBe(true);
  });
  it('surfaces an INFO coordinator_reply', () => {
    expect(isCoordinatorPush({ message_type: 'INFO', payload: { kind: 'coordinator_reply' } })).toBe(true);
  });
  it('EXCLUDES a friction signal (payload.signal_type)', () => {
    expect(isCoordinatorPush({ message_type: 'INFO', payload: { signal_type: 'stuck' } })).toBe(false);
  });
  it("EXCLUDES the worker's own roll_call", () => {
    expect(isCoordinatorPush({ message_type: 'INFO', payload: { kind: 'roll_call' } })).toBe(false);
  });
  it('EXCLUDES WORK_ASSIGNMENT and SET_IDENTITY (handled elsewhere)', () => {
    expect(isCoordinatorPush({ message_type: 'WORK_ASSIGNMENT', payload: {} })).toBe(false);
    expect(isCoordinatorPush({ message_type: 'SET_IDENTITY', payload: { callsign: 'Bravo' } })).toBe(false);
  });
});

describe('surfaceCoordinatorMessages — non-draining bounded delivery (FR-1/FR-3)', () => {
  it('surfaces unconsumed COACHING + excludes friction/roll_call; first delivery stamps read_at only', async () => {
    const sb = recordingSb();
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = async (_sb, _sid, opts) => {
      expect(opts.unackedOnly).toBe(true); // surfaces by acknowledged_at IS NULL
      return [
        { id: 'c1', message_type: 'COACHING', payload: {}, subject: 'tip', body: 'do X', created_at: '2026-06-13T01:00:00Z', read_at: null },
        { id: 'f1', message_type: 'INFO', payload: { signal_type: 'stuck' }, created_at: '2026-06-13T02:00:00Z', read_at: null },
        { id: 'r1', message_type: 'INFO', payload: { kind: 'roll_call' }, created_at: '2026-06-13T03:00:00Z', read_at: null },
      ];
    };
    try {
      const out = await surfaceCoordinatorMessages(sb, 'sess-1', { role: 'worker' });
      expect(out.map(m => m.id)).toEqual(['c1']);                 // only the COACHING row
      // first authoritative delivery: read_at only (DELIVERED), NOT acknowledged_at (re-surfaces once)
      expect(sb.updates).toEqual([{ id: 'c1', patch: { read_at: expect.any(String) } }]);
    } finally { ws.getMessagesForSession = orig; }
  });

  it('a SECOND delivery of an advisory row (read_at already set) stamps acknowledged_at (bounded)', async () => {
    const sb = recordingSb();
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = async () => [
      { id: 'c1', message_type: 'COACHING', payload: {}, subject: 's', body: 'b', created_at: '2026-06-13T01:00:00Z', read_at: '2026-06-13T01:30:00Z' },
    ];
    try {
      const out = await surfaceCoordinatorMessages(sb, 'sess-1', { role: 'worker' });
      expect(out.map(m => m.id)).toEqual(['c1']);                 // still surfaced this (2nd) time
      expect(sb.updates).toEqual([{ id: 'c1', patch: { acknowledged_at: expect.any(String) } }]); // now CONSUMED
    } finally { ws.getMessagesForSession = orig; }
  });

  it('a DIRECTIVE kind is NEVER auto-acked (read_at only, even on a 2nd delivery)', async () => {
    const sb = recordingSb();
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = async () => [
      { id: 'd1', message_type: 'INFO', payload: { kind: 'coordinator_request' }, created_at: '2026-06-13T01:00:00Z', read_at: '2026-06-13T01:30:00Z' },
    ];
    try {
      const out = await surfaceCoordinatorMessages(sb, 'sess-1', { role: 'worker' });
      // coordinator_request is a DIRECTIVE_KIND → surfaced but never auto-acked here
      expect(sb.updates).toEqual([]); // read_at already set + directive → no ack stamp
      expect(out.map(m => m.kind)).toContain('coordinator_request');
    } finally { ws.getMessagesForSession = orig; }
  });

  it('an ADAM-role session never auto-acks an advisory row either (mirror ackMessage guard)', async () => {
    const sb = recordingSb();
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = async () => [
      { id: 'c1', message_type: 'COACHING', payload: {}, created_at: '2026-06-13T01:00:00Z', read_at: '2026-06-13T01:30:00Z' },
    ];
    try {
      await surfaceCoordinatorMessages(sb, 'sess-adam', { role: 'adam' });
      expect(sb.updates).toEqual([]); // adam + already-delivered → no ack
    } finally { ws.getMessagesForSession = orig; }
  });

  it('fail-open: getMessagesForSession throwing yields [] (never breaks checkin)', async () => {
    const sb = recordingSb();
    const orig = ws.getMessagesForSession;
    ws.getMessagesForSession = async () => { throw new Error('db down'); };
    try {
      expect(await surfaceCoordinatorMessages(sb, 'sess-1', {})).toEqual([]);
    } finally { ws.getMessagesForSession = orig; }
  });
});

describe('rehydrateCallsign — durable SET_IDENTITY re-hydration (FR-2)', () => {
  it('re-hydrates the callsign from the SET_IDENTITY row and persists it back to metadata', async () => {
    const sb = recordingSb({ setIdentityRow: { payload: { callsign: 'Charlie', color: 'green', display_name: 'Charlie | idle' }, created_at: '2026-06-13T00:00:00Z' } });
    const cs = await rehydrateCallsign(sb, 'sess-x', { role: 'worker' });
    expect(cs).toBe('Charlie');
    // persisted back to claude_sessions.metadata.fleet_identity
    const persisted = sb.updates.find(u => u.patch && u.patch.metadata);
    expect(persisted.patch.metadata.fleet_identity.callsign).toBe('Charlie');
  });

  it('no SET_IDENTITY row → returns null (never fabricates), fail-open', async () => {
    const sb = recordingSb({ setIdentityRow: null });
    expect(await rehydrateCallsign(sb, 'sess-x', null)).toBe(null);
  });
});

describe('resolveCheckin — coordinator_messages[] surfaces on the response (FR-1 integration)', () => {
  it('attaches coordinator_messages[] to the resume response without dropping the claim', async () => {
    const sb = recordingSb({ heldSd: 'SD-CURRENT-001' });
    const orig = ws.getMessagesForSession;
    // option-aware stub: unreadOnly (WA peek/step-5) → none; unackedOnly (push surfacer) → a COACHING row
    ws.getMessagesForSession = async (_sb, _sid, opts = {}) => {
      if (opts.unackedOnly) return [{ id: 'c1', message_type: 'COACHING', payload: {}, subject: 'heads up', body: 'rebase first', created_at: '2026-06-13T01:00:00Z', read_at: null }];
      return [];
    };
    try {
      const res = await resolveCheckin(sb, 'sess-busy', { getCoordinator: async () => null });
      expect(res.action).toBe('resume');
      expect(res.sd).toBe('SD-CURRENT-001');                       // claim kept
      expect(Array.isArray(res.coordinator_messages)).toBe(true);
      expect(res.coordinator_messages.map(m => m.id)).toEqual(['c1']); // coaching surfaced on resume
    } finally { ws.getMessagesForSession = orig; }
  });
});
