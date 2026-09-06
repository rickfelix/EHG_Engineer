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
function mockSupabase({ existingReceipts = [], existenceCheckThrows = false, existenceCheckResolvesError = false, liveTargets = [] } = {}) {
  const inserted = [];
  const updateCalls = [];
  const limitCalls = [];
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
      limit(n) { limitCalls.push(n); return chain; },
      in() {
        if (existenceCheckThrows) throw new Error('existence-check query failed');
        sawIn = true;
        return chain;
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
        if (sawIn) {
          if (existenceCheckResolvesError) {
            return Promise.resolve({ data: null, error: { message: 'relation does not exist' } }).then(resolve, reject);
          }
          return Promise.resolve({ data: existingReceipts, error: null }).then(resolve, reject);
        }
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
  return { supabase, inserted, updateCalls, limitCalls };
}

describe('writeSignalReceipts: filtering', () => {
  // SD-LEO-INFRA-COORDINATOR-RECEIPTS-BROADCAST-CONSTRAINTS-001 FR-1 (AC-1): the stuck+high
  // filter is REMOVED -- every signal in the enumerated batch, any signal_type/severity, gets
  // exactly one receipt.
  it('writes a receipt for every signal in the batch, regardless of signal_type/severity', async () => {
    const a = signal('a');
    const b = { id: 'b', sender_session: targetFor('b'), payload: { signal_type: 'stuck', severity: 'medium' } };
    const c = { id: 'c', sender_session: targetFor('c'), payload: { signal_type: 'harness-bug', severity: 'high' } };
    const { supabase, inserted } = mockSupabase({ liveTargets: [a.sender_session, targetFor('b'), targetFor('c')] });
    const result = await writeSignalReceipts(supabase, COORDINATOR, [a, b, c]);
    expect(result).toEqual({ written: 3, skipped: 0 });
    expect(inserted).toHaveLength(3);
    expect(inserted.map((r) => r.target_session).sort()).toEqual([a.sender_session, targetFor('b'), targetFor('c')].sort());
  });

  it('short-circuits with zero supabase calls when the batch is empty', async () => {
    let fromCalled = false;
    const supabase = { from: () => { fromCalled = true; } };
    const result = await writeSignalReceipts(supabase, COORDINATOR, []);
    expect(result).toEqual({ written: 0, skipped: 0 });
    expect(fromCalled).toBe(false);
  });

  // TST-P6 / AC-17: the existence-check bound must be DERIVED from the batch's own length, never
  // a fixed literal -- the old .limit(50) was justified only by the stuck+high filter's 1-2-row
  // premise, which the widening above removes.
  it('AC-17: the existence-check limit scales with the enumerated batch size, not a fixed literal', async () => {
    const twentySignals = Array.from({ length: 20 }, (_, i) => ({
      id: `sig-${i}`, sender_session: targetFor('a'), payload: { signal_type: 'need-sweep', severity: 'medium' },
    }));
    const { supabase, limitCalls } = mockSupabase({ liveTargets: [targetFor('a')] });
    await writeSignalReceipts(supabase, COORDINATOR, twentySignals);
    expect(limitCalls[0]).toBeGreaterThanOrEqual(20);
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

  // AC-2 / TS-2b: the disposition line renders into Subject (coordination-inbox.cjs has no
  // generic payload-field render), derived from fields signal-router.cjs already stamps.
  it('AC-2: renders "queued" in the Subject for a plain unrouted signal', async () => {
    const sig = signal('a');
    const { supabase, inserted } = mockSupabase({ liveTargets: [sig.sender_session] });
    await writeSignalReceipts(supabase, COORDINATOR, [sig]);
    expect(inserted[0].subject).toContain('queued');
    expect(inserted[0].payload.receipt).toBe('queued');
  });

  it('AC-2: renders "routed:harness_backlog" in the Subject for a promoted signal', async () => {
    const sig = signal('b', { payload: { signal_type: 'stuck', severity: 'high', routed_to_feedback_id: 'fb-1' } });
    const { supabase, inserted } = mockSupabase({ liveTargets: [sig.sender_session] });
    await writeSignalReceipts(supabase, COORDINATOR, [sig]);
    expect(inserted[0].subject).toContain('routed:harness_backlog');
    expect(inserted[0].payload.receipt).toBe('routed:harness_backlog');
  });

  it('AC-2: renders "needs-decision:coordinator" in the Subject for a lone-routed signal', async () => {
    const sig = signal('c', { payload: { signal_type: 'stuck', severity: 'high', routed_to_coordinator: true } });
    const { supabase, inserted } = mockSupabase({ liveTargets: [sig.sender_session] });
    await writeSignalReceipts(supabase, COORDINATOR, [sig]);
    expect(inserted[0].subject).toContain('needs-decision:coordinator');
    expect(inserted[0].payload.receipt).toBe('needs-decision:coordinator');
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

  // Round-2 post-merge review (PR #8356): supabase-js/postgrest-js return a query failure as
  // {data: null, error} — they do NOT throw. The test above only covers the reject() path; this
  // covers the resolve-with-error path, which previously discarded `error` and silently treated
  // the failed lookup as "zero existing receipts", risking a duplicate receipt write for the
  // whole batch instead of hitting the documented fail-soft catch.
  it('an existence-check query RESOLVING with {data:null,error} (not throwing) is also fail-soft, not a silent false-negative', async () => {
    const a = signal('a');
    const { supabase, inserted } = mockSupabase({ existenceCheckResolvesError: true, liveTargets: [a.sender_session] });
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
