// Tests for SD-LEO-INFRA-WORKER-CHECKIN-HANDSHAKE-001 / FR-1
// Proves the worker->coordinator two-way `request` round-trip is no longer
// gated off (exit 3) when COORDINATOR_TWOWAY_V2=on, and that the request
// payload + awaitCoordinatorReply round-trip completes.
//
// worker-signal.cjs `request` does: if (!isTwoWayV2Enabled()) process.exit(3).
// So proving isTwoWayV2Enabled() is true with the flag on === proving the
// request path is no longer a no-op. The reply consumption is proven by
// driving awaitCoordinatorReply() against an injected supabase stub.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { isTwoWayV2Enabled } = require('./resolve.cjs');
const { buildRequestPayload, awaitCoordinatorReply } = require('../../scripts/worker-signal.cjs');

describe('FR-1: COORDINATOR_TWOWAY_V2 gate (no more exit 3)', () => {
  const prev = process.env.COORDINATOR_TWOWAY_V2;
  afterEach(() => {
    if (prev === undefined) delete process.env.COORDINATOR_TWOWAY_V2;
    else process.env.COORDINATOR_TWOWAY_V2 = prev;
  });

  it('request path is gated OFF (would exit 3) when flag unset', () => {
    delete process.env.COORDINATOR_TWOWAY_V2;
    expect(isTwoWayV2Enabled()).toBe(false);
  });

  it('request path is ENABLED when COORDINATOR_TWOWAY_V2=on', () => {
    process.env.COORDINATOR_TWOWAY_V2 = 'on';
    expect(isTwoWayV2Enabled()).toBe(true);
  });
});

describe('FR-1: request payload contract', () => {
  it('builds a coordinator_request payload with a correlation id and no friction/intent discriminators', () => {
    const payload = buildRequestPayload({
      correlationId: 'corr-123',
      body: 'checking in — what should I work on?',
      senderCallsign: 'Alpha',
      repo: '/repo'
    });
    expect(payload.kind).toBe('coordinator_request');
    expect(payload.correlation_id).toBe('corr-123');
    expect(payload.expects_reply).toBe(true);
    expect(payload.sender_callsign).toBe('Alpha');
    // INVARIANT: request rows must NOT carry signal_type (friction channel) or
    // intent_action (deconfliction sweep) or signal-router / the intent sweep
    // would scoop them.
    expect(payload.signal_type).toBeUndefined();
    expect(payload.intent_action).toBeUndefined();
  });
});

describe('FR-1: awaitCoordinatorReply round-trip', () => {
  // Minimal supabase stub: session_coordination.select(...).eq().eq().order().limit()
  // resolves to whatever rows we queue.
  function buildSupabaseStub(rowsSequence) {
    let call = 0;
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => {
        const rows = rowsSequence[Math.min(call, rowsSequence.length - 1)];
        call += 1;
        return Promise.resolve({ data: rows, error: null });
      }),
    };
    return { from: vi.fn(() => chain) };
  }

  it('resolves ok=true when a correlated coordinator reply row is present', async () => {
    const replyRow = {
      id: 'reply-1',
      payload: { reply_to: 'corr-123', body: 'work on SD-FOO-001' },
      body: 'work on SD-FOO-001',
      sender_session: 'coordinator-xyz',
      created_at: '2026-06-07T12:00:00Z',
    };
    const supabase = buildSupabaseStub([[replyRow]]);
    const result = await awaitCoordinatorReply(supabase, {
      sessionId: 'worker-1',
      correlationId: 'corr-123',
      timeoutMs: 5000,
      pollMs: 10,
      now: () => 0,
      sleep: async () => {},
    });
    expect(result.ok).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(result.reply.id).toBe('reply-1');
    expect(result.reply.payload.reply_to).toBe('corr-123');
  });

  it('times out (ok=false) when no reply arrives before the deadline', async () => {
    const supabase = buildSupabaseStub([[]]); // never any rows
    let t = 0;
    const result = await awaitCoordinatorReply(supabase, {
      sessionId: 'worker-1',
      correlationId: 'corr-404',
      timeoutMs: 50,
      pollMs: 10,
      now: () => { const v = t; t += 20; return v; }, // advances past deadline
      sleep: async () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.reply).toBeNull();
  });
});
