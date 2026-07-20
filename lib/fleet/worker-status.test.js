// Tests for SD-LEO-INFRA-WORKER-CHECKIN-HANDSHAKE-001 / FR-3
// lib/fleet/worker-status.cjs — schema-contract helper.
// Pins the canonical column names (so the from_session/to_session/last_heartbeat
// folklore can never silently creep back) and proves the query helpers issue
// queries against the CORRECT columns.

import { describe, it, expect, vi } from 'vitest';

const ws = require('./worker-status.cjs');

describe('FR-3: canonical column contract', () => {
  it('session_coordination uses sender_session/target_session (NOT from_session/to_session)', () => {
    expect(ws.SESSION_COORDINATION_COLUMNS.senderSession).toBe('sender_session');
    expect(ws.SESSION_COORDINATION_COLUMNS.targetSession).toBe('target_session');
    expect(Object.values(ws.SESSION_COORDINATION_COLUMNS)).not.toContain('from_session');
    expect(Object.values(ws.SESSION_COORDINATION_COLUMNS)).not.toContain('to_session');
  });

  it('claude_sessions uses heartbeat_at (NOT last_heartbeat)', () => {
    expect(ws.CLAUDE_SESSIONS_COLUMNS.heartbeatAt).toBe('heartbeat_at');
    expect(Object.values(ws.CLAUDE_SESSIONS_COLUMNS)).not.toContain('last_heartbeat');
  });

  it('roll_call discriminator rides on payload.kind, not signal_type', () => {
    expect(ws.PAYLOAD_KINDS.ROLL_CALL).toBe('roll_call');
    expect(ws.PAYLOAD_KINDS.COORDINATOR_REQUEST).toBe('coordinator_request');
  });
});

// A supabase stub that records the exact columns passed to query builders, so we
// can assert the helper does NOT regress to a folklore column name.
function recordingStub() {
  const calls = { table: null, eq: [], gte: [], order: [], is: [], select: null };
  const chain = {
    select: vi.fn((cols) => { calls.select = cols; return chain; }),
    eq: vi.fn((col, val) => { calls.eq.push([col, val]); return chain; }),
    gte: vi.fn((col, val) => { calls.gte.push([col, val]); return chain; }),
    is: vi.fn((col, val) => { calls.is.push([col, val]); return chain; }),
    // chainable so a second .order() (getActiveSessions' unique tiebreaker, FR-6 batch 9) works too
    order: vi.fn((col, opts) => { calls.order.push([col, opts]); return chain; }),
    // fetchAllPaginated's terminal .range() call (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9)
    range: vi.fn(() => Promise.resolve({ data: [], error: null })),
    then: (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
  };
  return { sb: { from: vi.fn((t) => { calls.table = t; return chain; }) }, calls };
}

describe('FR-3: query helpers use correct columns', () => {
  it('getMessagesForSession queries session_coordination by target_session', async () => {
    const { sb, calls } = recordingStub();
    await ws.getMessagesForSession(sb, 'worker-1');
    expect(calls.table).toBe('session_coordination');
    expect(calls.eq).toContainEqual(['target_session', 'worker-1']);
    expect(calls.order[0][0]).toBe('created_at');
    // never the folklore name
    expect(calls.eq.map(e => e[0])).not.toContain('to_session');
  });

  it('getActiveSessions filters claude_sessions by heartbeat_at', async () => {
    const { sb, calls } = recordingStub();
    await ws.getActiveSessions(sb, { withinMs: 60000 });
    expect(calls.table).toBe('claude_sessions');
    expect(calls.gte[0][0]).toBe('heartbeat_at');
    expect(calls.order[0][0]).toBe('heartbeat_at');
  });
});
