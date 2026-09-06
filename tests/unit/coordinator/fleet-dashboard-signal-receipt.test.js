/**
 * QF-20260906-162 — writeSignalReceipts (scripts/fleet-dashboard.cjs), the coordinator
 * inbox's delivery-receipt write site. For each enumerated payload.signal_type='stuck' AND
 * payload.severity='high' row, writes ONE kind=signal_receipt row back to the original
 * sender via dispatchToWorker — a RECEIPT, never an ack: it must never touch
 * acknowledged_at/answered_at on the original signal row (that stays
 * coordinator-ack-signal.cjs's job alone), and it must be idempotent across re-enumeration
 * of the same still-unacknowledged row.
 *
 * dispatchToWorker (lib/coordinator/dispatch.cjs) is a CJS `require()` inside
 * scripts/fleet-dashboard.cjs (also CJS) — confirmed empirically that vi.mock does not
 * intercept a nested require() between two .cjs files in this project's vitest config, even
 * when the outer file is loaded via ESM import(). So this file drives the REAL
 * dispatchToWorker -> insertCoordinationRow choke point through a permissive generic
 * supabase double (every guard inside it resolves benign-empty/live-target by default),
 * matching the established pattern in tests/unit/coordinator/dispatch-default-ttl.test.js
 * and dispatch-send-backpressure.test.js — and asserts on the row actually reaching
 * session_coordination.insert(), the one place every internal guard funnels through.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { writeSignalReceipts } = require('../../../scripts/fleet-dashboard.cjs');

const COORDINATOR = 'c0000000-0000-4000-8000-000000000001';

// Deterministic, valid-hex UUID per fixture id (assertValidTarget requires the full
// 8-4-4-4-12 hex shape — a sentinel or truncated id is refused before any DB lookup).
const UUID_BY_ID = {
  a: '00000000-0000-4000-8000-00000000000a',
  b: '00000000-0000-4000-8000-00000000000b',
  c: '00000000-0000-4000-8000-00000000000c',
  'sig-123': '00000000-0000-4000-8000-000000000123',
};
const targetFor = (id) => UUID_BY_ID[id] || (() => { throw new Error(`no fixture UUID mapped for id=${id}`); })();

const signal = (id, overrides = {}) => ({
  id,
  sender_session: targetFor(id),
  payload: { signal_type: 'stuck', severity: 'high' },
  ...overrides,
});

/**
 * Generic, permissive double for insertCoordinationRow's full guard chain: every
 * claude_sessions lookup reports a live, fresh-heartbeat row (any target this double is told
 * about is "live" — assertValidTarget's dominant check); every OTHER session_coordination
 * select-style query (dedup / disposition / target-drain) resolves empty (no match, i.e.
 * "not a duplicate", "not disposed"); the one query this test actually controls is
 * writeSignalReceipts' own existence-check, which terminates on `.in(...)` — every other
 * session_coordination select terminates on `.maybeSingle()`/`.limit()`, so `.in()` is an
 * unambiguous fingerprint for it. The final `session_coordination.insert(row)` is recorded.
 */
function mockSupabase({ existingReceipts = [], existenceCheckThrows = false, liveTargets = [] } = {}) {
  const inserted = [];
  const updateCalls = [];
  const live = new Set(liveTargets);

  function sessionCoordinationChain() {
    let sawIn = false;
    const chain = {
      select() { return chain; },
      eq() { return chain; },
      not() { return chain; },
      is() { return chain; },
      gt() { return chain; },
      gte() { return chain; },
      order() { return chain; },
      limit() { return chain; },
      in() {
        sawIn = true;
        if (existenceCheckThrows) throw new Error('existence-check query failed');
        return Promise.resolve({ data: existingReceipts, error: null });
      },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      single() { return Promise.resolve({ data: null, error: null }); },
      update(...args) { updateCalls.push(args); return chain; },
      insert(row) {
        const stored = { id: `row-${inserted.length + 1}`, ...row };
        inserted.push(stored);
        chain._inserted = stored;
        return chain;
      },
      then(resolve, reject) {
        if (sawIn) return Promise.resolve({ data: existingReceipts, error: null }).then(resolve, reject);
        // Any other select-style await (dedup/disposition checks) — no match, fail-open-safe.
        return Promise.resolve({ data: chain._inserted ? [chain._inserted] : [], error: null }).then(resolve, reject);
      },
    };
    return chain;
  }

  function claudeSessionsChain() {
    let lastEqCol = null;
    let lastEqVal = null;
    const chain = {
      select() { return chain; },
      eq(col, val) { lastEqCol = col; lastEqVal = val; return chain; },
      is() { return chain; },
      gte() { return chain; },
      limit() { return chain; },
      maybeSingle() {
        if (lastEqCol === 'session_id' && live.has(lastEqVal)) {
          return Promise.resolve({ data: { session_id: lastEqVal, heartbeat_at: new Date().toISOString(), sd_key: null }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then(resolve, reject) { return Promise.resolve({ data: null, error: null }).then(resolve, reject); },
    };
    return chain;
  }

  function genericChain() {
    const chain = {
      select() { return chain; },
      eq() { return chain; },
      not() { return chain; },
      is() { return chain; },
      order() { return chain; },
      limit() { return chain; },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      single() { return Promise.resolve({ data: null, error: null }); },
      then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); },
    };
    return chain;
  }

  const supabase = {
    from(table) {
      if (table === 'session_coordination') return sessionCoordinationChain();
      if (table === 'claude_sessions') return claudeSessionsChain();
      return genericChain();
    },
  };
  return { supabase, inserted, updateCalls };
}

describe('writeSignalReceipts: filtering', () => {
  it('writes a receipt only for signal_type=stuck AND severity=high rows', async () => {
    const a = signal('a');
    const { supabase, inserted } = mockSupabase({ liveTargets: [a.sender_session] });
    const signals = [
      a,
      { id: 'b', sender_session: targetFor('b'), payload: { signal_type: 'stuck', severity: 'medium' } },
      { id: 'c', sender_session: targetFor('c'), payload: { signal_type: 'harness-bug', severity: 'high' } },
    ];
    const result = await writeSignalReceipts(supabase, COORDINATOR, signals);
    expect(result).toEqual({ written: 1, skipped: 0 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].target_session).toBe(a.sender_session);
  });

  it('short-circuits with zero supabase calls when no signal qualifies', async () => {
    let fromCalled = false;
    const supabase = { from: () => { fromCalled = true; } };
    const signals = [{ id: 'b', sender_session: targetFor('b'), payload: { signal_type: 'stuck', severity: 'low' } }];
    const result = await writeSignalReceipts(supabase, COORDINATOR, signals);
    expect(result).toEqual({ written: 0, skipped: 0 });
    expect(fromCalled).toBe(false);
  });

  it('skips (never dispatches) a qualifying row with no sender_session to receipt back to', async () => {
    const { supabase, inserted } = mockSupabase();
    const signals = [signal('a', { sender_session: null })];
    const result = await writeSignalReceipts(supabase, COORDINATOR, signals);
    expect(result).toEqual({ written: 0, skipped: 1 });
    expect(inserted).toHaveLength(0);
  });
});

describe('writeSignalReceipts: idempotency', () => {
  it('skips a row that already has a signal_receipt (by correlation_id), writes the rest', async () => {
    const a = signal('a');
    const b = signal('b');
    const { supabase, inserted } = mockSupabase({
      existingReceipts: [{ payload: { correlation_id: 'a' } }],
      liveTargets: [a.sender_session, b.sender_session],
    });
    const result = await writeSignalReceipts(supabase, COORDINATOR, [a, b]);
    expect(result).toEqual({ written: 1, skipped: 1 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].payload.correlation_id).toBe('b');
  });

  it('re-enumerating the SAME batch a second time (receipt now exists for both) is a full no-op write-wise', async () => {
    const a = signal('a');
    const b = signal('b');
    const { supabase, inserted } = mockSupabase({
      existingReceipts: [{ payload: { correlation_id: 'a' } }, { payload: { correlation_id: 'b' } }],
      liveTargets: [a.sender_session, b.sender_session],
    });
    const result = await writeSignalReceipts(supabase, COORDINATOR, [a, b]);
    expect(result).toEqual({ written: 0, skipped: 2 });
    expect(inserted).toHaveLength(0);
  });
});

describe('writeSignalReceipts: never touches the original signal row', () => {
  it('issues no update() call at all — a receipt is a new row, never a mutation of the enumerated row', async () => {
    const a = signal('a');
    const { supabase, updateCalls } = mockSupabase({ liveTargets: [a.sender_session] });
    await writeSignalReceipts(supabase, COORDINATOR, [a]);
    expect(updateCalls).toEqual([]);
  });

  it('the inserted receipt row never sets acknowledged_at/answered_at', async () => {
    const a = signal('a');
    const { supabase, inserted } = mockSupabase({ liveTargets: [a.sender_session] });
    await writeSignalReceipts(supabase, COORDINATOR, [a]);
    const row = inserted[0];
    expect(row).not.toHaveProperty('acknowledged_at');
    expect(row).not.toHaveProperty('answered_at');
    expect(row.payload).not.toHaveProperty('acknowledged_at');
    expect(row.payload).not.toHaveProperty('answered_at');
  });
});

describe('writeSignalReceipts: payload shape', () => {
  it('stamps kind=signal_receipt, producer=coordinatorId, and correlation_id=the signal id', async () => {
    const sig = signal('sig-123');
    const { supabase, inserted } = mockSupabase({ liveTargets: [sig.sender_session] });
    await writeSignalReceipts(supabase, COORDINATOR, [sig]);
    const row = inserted[0];
    expect(row.payload.kind).toBe('signal_receipt');
    expect(row.payload.producer).toBe(COORDINATOR);
    expect(row.payload.correlation_id).toBe('sig-123');
    expect(row.payload.enumerated_row_id).toBe('sig-123');
    expect(row.target_session).toBe(sig.sender_session);
    expect(row.sender_session).toBe(COORDINATOR);
    expect(row.message_type).toBe('INFO');
  });
});

describe('writeSignalReceipts: fail-soft', () => {
  it('an existence-check query failure does not block the write (fail-soft toward at-least-once, never lost)', async () => {
    const a = signal('a');
    const { supabase, inserted } = mockSupabase({ existenceCheckThrows: true, liveTargets: [a.sender_session] });
    const result = await writeSignalReceipts(supabase, COORDINATOR, [a]);
    expect(result).toEqual({ written: 1, skipped: 0 });
    expect(inserted).toHaveLength(1);
  });

  it('a refused dispatch (unknown/dead target) for one row is counted as skipped and does not stop the batch', async () => {
    const a = signal('a'); // NOT in liveTargets -> assertValidTarget refuses (DISPATCH_TARGET_UNKNOWN)
    const b = signal('b');
    const { supabase, inserted } = mockSupabase({ liveTargets: [b.sender_session] });
    const result = await writeSignalReceipts(supabase, COORDINATOR, [a, b]);
    expect(result).toEqual({ written: 1, skipped: 1 });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].payload.correlation_id).toBe('b');
  });
});
