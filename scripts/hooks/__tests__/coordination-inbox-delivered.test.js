// Tests for SD-LEO-INFRA-COORDINATOR-WORKER-DELIVERED-001
// scripts/hooks/coordination-inbox.cjs::insertDeliveredRowIfRequested
//
// Receiver-side DELIVERED-layer auto-insertion. When the hook surfaces an inbound
// INFO row with payload.request_ack=true, it inserts a paired DELIVERED row back
// to the original sender. Provides transport-layer confirmation independent of
// LLM activity, closing the structural ~50% ACK-rate observability gap (RCA
// 2026-05-04, ~/.claude/plans/root-cause-hazy-sloth.md).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';

const HOOK_PATH = path.resolve(__dirname, '../coordination-inbox.cjs');

function loadHook() {
  delete require.cache[require.resolve(HOOK_PATH)];
  return require(HOOK_PATH);
}

// Build a chainable mock that records calls. Pre-populate `selectResult` to
// control the dedup query response; `insertImpl` is invoked when .insert is
// called (default: resolves successfully).
function makeMockSupabase({ selectResult = { data: [] }, insertImpl } = {}) {
  const calls = { select: [], insert: [] };
  const selectChain = {
    select: vi.fn(function () { return this; }),
    eq: vi.fn(function (col, val) { calls.select.push({ col, val }); return this; }),
    limit: vi.fn(function () { return Promise.resolve(selectResult); })
  };
  const insertFn = vi.fn((row) => {
    calls.insert.push(row);
    if (typeof insertImpl === 'function') return insertImpl(row);
    return Promise.resolve({ data: [row], error: null });
  });
  const tableHandle = {
    select: () => selectChain,
    insert: insertFn
  };
  const supabase = { from: vi.fn(() => tableHandle) };
  return { supabase, calls, insertFn, selectChain };
}

const SENDER_SESSION = 'coord-aaaa1111-2222-3333-4444-555566667777';
const WORKER_SESSION = 'worker-bbbb2222-3333-4444-5555-666677778888';
const ORIG_ID = 'cccc3333-4444-5555-6666-777788889999';

function makeMsg(overrides = {}) {
  return {
    id: ORIG_ID,
    sender_session: SENDER_SESSION,
    message_type: 'INFO',
    subject: 'test bulletin',
    payload: { request_ack: true, topic: 'unit-test' },
    ...overrides
  };
}

describe('TS-1 happy path: request_ack=true triggers DELIVERED insertion with correct fields', () => {
  it('inserts one row with subject=[DELIVERED <8-hex>] and full payload', async () => {
    const hook = loadHook();
    const { supabase, calls } = makeMockSupabase();
    const result = await hook.insertDeliveredRowIfRequested(supabase, WORKER_SESSION, makeMsg());
    expect(result).toBe('inserted');
    expect(calls.insert).toHaveLength(1);
    const inserted = calls.insert[0];
    expect(inserted.message_type).toBe('INFO');
    expect(inserted.sender_session).toBe(WORKER_SESSION);
    expect(inserted.target_session).toBe(SENDER_SESSION);
    expect(inserted.subject).toBe('[DELIVERED cccc3333]');
    expect(inserted.payload.delivered_for).toBe(ORIG_ID);
    expect(inserted.payload.sender).toBe(WORKER_SESSION);
    expect(inserted.payload.kind).toBe('transport_ack');
    expect(inserted.sender_type).toBe('worker');
  });
});

describe('TS-2 no-op: request_ack absent/false/string yields no insertion', () => {
  it('skips when payload.request_ack is absent', async () => {
    const hook = loadHook();
    const { supabase, calls } = makeMockSupabase();
    const r = await hook.insertDeliveredRowIfRequested(supabase, WORKER_SESSION, makeMsg({ payload: { topic: 'no-ack' } }));
    expect(r).toBe('skipped');
    expect(calls.insert).toHaveLength(0);
  });
  it('skips when payload.request_ack === false', async () => {
    const hook = loadHook();
    const { supabase, calls } = makeMockSupabase();
    const r = await hook.insertDeliveredRowIfRequested(supabase, WORKER_SESSION, makeMsg({ payload: { request_ack: false } }));
    expect(r).toBe('skipped');
    expect(calls.insert).toHaveLength(0);
  });
  it('skips when payload.request_ack === "true" (string, not boolean)', async () => {
    const hook = loadHook();
    const { supabase, calls } = makeMockSupabase();
    const r = await hook.insertDeliveredRowIfRequested(supabase, WORKER_SESSION, makeMsg({ payload: { request_ack: 'true' } }));
    expect(r).toBe('skipped');
    expect(calls.insert).toHaveLength(0);
  });
});

describe('TS-3 idempotence: dedup pre-SELECT prevents duplicate DELIVERED rows', () => {
  it('returns "duplicate" and does NOT insert when an existing row matches subject+sender+target', async () => {
    const hook = loadHook();
    const { supabase, calls } = makeMockSupabase({ selectResult: { data: [{ id: 'existing-uuid' }] } });
    const r = await hook.insertDeliveredRowIfRequested(supabase, WORKER_SESSION, makeMsg());
    expect(r).toBe('duplicate');
    expect(calls.insert).toHaveLength(0);
  });
});

describe('TS-4 error path: INSERT failure logs to stderr and does not throw', () => {
  it('returns "error", emits stderr line, no throw', async () => {
    const hook = loadHook();
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const failingInsert = () => { throw new Error('simulated network error'); };
    const { supabase } = makeMockSupabase({ insertImpl: failingInsert });
    let threw = false;
    let result;
    try {
      result = await hook.insertDeliveredRowIfRequested(supabase, WORKER_SESSION, makeMsg());
    } catch { threw = true; }
    expect(threw).toBe(false);
    expect(result).toBe('error');
    const stderrCall = stderrSpy.mock.calls.find(c => String(c[0]).startsWith('[coord-inbox] DELIVERED insert failed:'));
    expect(stderrCall).toBeDefined();
    expect(String(stderrCall[0])).toContain('simulated network error');
    stderrSpy.mockRestore();
  });
});

describe('TS-5 sender attribution: passed-in sessionId appears in inserted row', () => {
  it('uses caller-provided sessionId for both sender_session and payload.sender', async () => {
    const hook = loadHook();
    const sentinel = 'sentinel-uuid-9999';
    const { supabase, calls } = makeMockSupabase();
    await hook.insertDeliveredRowIfRequested(supabase, sentinel, makeMsg());
    expect(calls.insert).toHaveLength(1);
    expect(calls.insert[0].sender_session).toBe(sentinel);
    expect(calls.insert[0].payload.sender).toBe(sentinel);
  });
});

describe('TS-6 subject format: 8-char hex prefix conformance', () => {
  it('produces subject matching /^\\[DELIVERED [a-f0-9]{8}\\]$/', async () => {
    const hook = loadHook();
    const { supabase, calls } = makeMockSupabase();
    await hook.insertDeliveredRowIfRequested(supabase, WORKER_SESSION, makeMsg());
    expect(calls.insert[0].subject).toMatch(/^\[DELIVERED [a-f0-9]{8}\]$/);
    expect(calls.insert[0].subject).toBe('[DELIVERED cccc3333]');
  });
});

describe('FR-R3 robustness: missing sender_session/id/sessionId is skipped (not error)', () => {
  it('skips when msg.sender_session is null', async () => {
    const hook = loadHook();
    const { supabase, calls } = makeMockSupabase();
    const r = await hook.insertDeliveredRowIfRequested(supabase, WORKER_SESSION, makeMsg({ sender_session: null }));
    expect(r).toBe('skipped');
    expect(calls.insert).toHaveLength(0);
  });
  it('skips when msg.id is missing', async () => {
    const hook = loadHook();
    const { supabase, calls } = makeMockSupabase();
    const r = await hook.insertDeliveredRowIfRequested(supabase, WORKER_SESSION, makeMsg({ id: undefined }));
    expect(r).toBe('skipped');
    expect(calls.insert).toHaveLength(0);
  });
  it('skips when sessionId arg is null', async () => {
    const hook = loadHook();
    const { supabase, calls } = makeMockSupabase();
    const r = await hook.insertDeliveredRowIfRequested(supabase, null, makeMsg());
    expect(r).toBe('skipped');
    expect(calls.insert).toHaveLength(0);
  });
});

describe('Dedup query shape: select filters by subject + sender + target', () => {
  it('chains .eq(subject), .eq(sender_session), .eq(target_session) before .limit(1)', async () => {
    const hook = loadHook();
    const { supabase, calls } = makeMockSupabase();
    await hook.insertDeliveredRowIfRequested(supabase, WORKER_SESSION, makeMsg());
    const subjectFilter = calls.select.find(c => c.col === 'subject');
    const senderFilter = calls.select.find(c => c.col === 'sender_session');
    const targetFilter = calls.select.find(c => c.col === 'target_session');
    expect(subjectFilter?.val).toBe('[DELIVERED cccc3333]');
    expect(senderFilter?.val).toBe(WORKER_SESSION);
    expect(targetFilter?.val).toBe(SENDER_SESSION);
  });
});
