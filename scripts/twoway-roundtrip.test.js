// SD-LEO-INFRA-COMPLETE-TWO-WAY-001 — M2: discovery -> reply -> await round-trip.
// Covers FR-5 (coordinator reply verb), FR-6 (inbox reply-skip / P0-1), FR-7
// (worker request payload + awaitCoordinatorReply). All correlation in payload
// JSONB; message_type stays INFO (no migration, P0-2).

import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const workerSignal = require('./worker-signal.cjs');
const coordinatorReply = require('./coordinator-reply.cjs');
const inbox = require('./hooks/coordination-inbox.cjs');

// --- minimal supabase mocks ---------------------------------------------------
function mockSelectChain(rows) {
  // awaitCoordinatorReply: from().select().eq().eq().order().limit() -> await
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: rows, error: null })
            })
          })
        })
      })
    })
  };
}

// =============================================================================
describe('FR-7: buildRequestPayload (worker request shape)', () => {
  it('carries correlation_id + expects_reply + kind, and NEVER signal_type/intent_action', () => {
    const p = workerSignal.buildRequestPayload({ correlationId: 'corr-1', body: 'need a decision', senderCallsign: 'Alpha', repo: '/repo' });
    expect(p.kind).toBe('coordinator_request');
    expect(p.correlation_id).toBe('corr-1');
    expect(p.expects_reply).toBe(true);
    expect(p.sender_callsign).toBe('Alpha');
    expect(p.body).toBe('need a decision');
    expect(p.signal_type).toBeUndefined();   // must not be scooped by signal-router
    expect(p.intent_action).toBeUndefined();  // must not be scooped by intent sweep
  });

  it('redacts secrets in the request body', () => {
    const p = workerSignal.buildRequestPayload({ correlationId: 'c', body: 'token ghp_' + 'a'.repeat(36) });
    expect(p.body).toContain('[REDACTED:GH_TOKEN]');
  });
});

describe('FR-7: awaitCoordinatorReply (poll + fail-open)', () => {
  it('AWAIT-1: resolves with the correlated reply when present', async () => {
    const replyRow = { id: 'r1', payload: { kind: 'coordinator_reply', reply_to: 'corr-1', body: 'do X' }, sender_session: 'coord', created_at: 'now' };
    const sb = mockSelectChain([replyRow]);
    const res = await workerSignal.awaitCoordinatorReply(sb, { sessionId: 'me', correlationId: 'corr-1', timeoutMs: 1000 });
    expect(res.ok).toBe(true);
    expect(res.timedOut).toBe(false);
    expect(res.reply.id).toBe('r1');
    expect(res.reply.payload.reply_to).toBe('corr-1');
  });

  it('AWAIT-2: times out cleanly when no reply (no hang)', async () => {
    const sb = mockSelectChain([]); // never any reply
    const res = await workerSignal.awaitCoordinatorReply(sb, { sessionId: 'me', correlationId: 'corr-x', timeoutMs: 0, sleep: () => Promise.resolve() });
    expect(res.ok).toBe(false);
    expect(res.timedOut).toBe(true);
    expect(res.reply).toBeNull();
  });

  it('AWAIT-3: fail-open — DB throw is swallowed and treated as no-reply -> timeout', async () => {
    const sb = { from: () => { throw new Error('db down'); } };
    const res = await workerSignal.awaitCoordinatorReply(sb, { sessionId: 'me', correlationId: 'c', timeoutMs: 0, sleep: () => Promise.resolve() });
    expect(res.timedOut).toBe(true);
    expect(res.ok).toBe(false);
  });
});

describe('FR-6: shouldSkipCoordinatorReply (inbox skip / P0-1, default-OFF)', () => {
  afterEach(() => { delete process.env.COORDINATOR_TWOWAY_V2; });

  const replyMsg = { message_type: 'INFO', payload: { kind: 'coordinator_reply', reply_to: 'c' } };

  it('SKIP-1: flag OFF -> never skips (byte-identical inbox behavior)', () => {
    delete process.env.COORDINATOR_TWOWAY_V2;
    expect(inbox.shouldSkipCoordinatorReply(replyMsg)).toBe(false);
  });

  it('SKIP-2: flag ON -> skips a coordinator_reply INFO row', () => {
    process.env.COORDINATOR_TWOWAY_V2 = 'on';
    expect(inbox.shouldSkipCoordinatorReply(replyMsg)).toBe(true);
  });

  it('SKIP-3: flag ON -> does NOT skip ordinary rows (signals, work assignments, null payload)', () => {
    process.env.COORDINATOR_TWOWAY_V2 = 'on';
    expect(inbox.shouldSkipCoordinatorReply({ message_type: 'INFO', payload: { signal_type: 'stuck' } })).toBe(false);
    expect(inbox.shouldSkipCoordinatorReply({ message_type: 'WORK_ASSIGNMENT', payload: { kind: 'coordinator_reply' } })).toBe(false);
    expect(inbox.shouldSkipCoordinatorReply({ message_type: 'INFO', payload: null })).toBe(false);
    expect(inbox.shouldSkipCoordinatorReply(null)).toBe(false);
  });
});

describe('FR-5: coordinator-reply (buildReplyPayload + sendCoordinatorReply)', () => {
  it('REPLY-1: buildReplyPayload sets kind=coordinator_reply + reply_to, no signal_type', () => {
    const p = coordinatorReply.buildReplyPayload({ correlationId: 'corr-9', body: 'approved', coordinatorSession: 'coord-1' });
    expect(p.kind).toBe('coordinator_reply');
    expect(p.reply_to).toBe('corr-9');
    expect(p.sender).toBe('coord-1');
    expect(p.body).toBe('approved');
    expect(p.signal_type).toBeUndefined();
  });

  it('REPLY-2: sendCoordinatorReply inserts an INFO row targeting the worker, never broadcast', async () => {
    let captured = null;
    const sb = {
      from: () => ({
        insert: (row) => { captured = row; return { select: () => ({ single: () => Promise.resolve({ data: { id: 'reply-1' }, error: null }) }) }; }
      })
    };
    const { data } = await coordinatorReply.sendCoordinatorReply(sb, {
      coordinatorSession: 'coord-1', workerSession: 'worker-7', correlationId: 'corr-9', body: 'approved'
    });
    expect(data.id).toBe('reply-1');
    expect(captured.message_type).toBe('INFO');         // no new enum value (P0-2)
    expect(captured.target_session).toBe('worker-7');   // specific worker, not broadcast (P1-3)
    expect(captured.target_session).not.toBe('broadcast-coordinator');
    expect(captured.payload.kind).toBe('coordinator_reply');
    expect(captured.payload.reply_to).toBe('corr-9');
    expect(captured.payload.signal_type).toBeUndefined();
    expect(typeof captured.expires_at).toBe('string');
  });
});

describe('Round-trip correlation invariant', () => {
  it('worker request correlation_id matches the reply reply_to the await polls for', async () => {
    const correlationId = 'rt-correlation-123';
    const reqPayload = workerSignal.buildRequestPayload({ correlationId, body: 'q' });
    const replyPayload = coordinatorReply.buildReplyPayload({ correlationId, body: 'a', coordinatorSession: 'c' });
    expect(replyPayload.reply_to).toBe(reqPayload.correlation_id);

    // The await keys on payload->>reply_to == correlation_id; simulate the matched row.
    const sb = mockSelectChain([{ id: 'x', payload: replyPayload, sender_session: 'c', created_at: 't' }]);
    const res = await workerSignal.awaitCoordinatorReply(sb, { sessionId: 'w', correlationId, timeoutMs: 1000 });
    expect(res.ok).toBe(true);
    expect(res.reply.payload.reply_to).toBe(correlationId);
  });
});
