/**
 * Unit tests for the reply-class SSOT + PING-ON-SILENCE detector.
 * SD-LEO-INFRA-ROLE-BASED-COMMS-ROUTING-PROTOCOL-001-C.
 *
 * Network-free: an injected fake supabase records insert/update calls.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  REPLY_CLASSES,
  DEFAULT_REPLY_WINDOW_MS,
  isValidReplyClass,
  computeReplyExpectedBy,
  findOverdueReplyNeeded,
  checkAndPingOverdueReplies,
} = require('./reply-class.cjs');

const NOW = Date.parse('2026-07-02T12:00:00.000Z');
const PAST = new Date(NOW - 60_000).toISOString();   // 1min ago -> overdue
const FUTURE = new Date(NOW + 60_000).toISOString();  // 1min from now -> not yet due

describe('reply-class taxonomy', () => {
  it('REPLY_CLASSES is exactly the 3 documented values', () => {
    expect(REPLY_CLASSES).toEqual(['fire-and-forget', 'reply-needed', 'live-handshake']);
  });
  it('isValidReplyClass accepts the 3 values and rejects anything else', () => {
    for (const v of REPLY_CLASSES) expect(isValidReplyClass(v)).toBe(true);
    expect(isValidReplyClass('maybe')).toBe(false);
    expect(isValidReplyClass(undefined)).toBe(false);
  });
  it('computeReplyExpectedBy adds the default window when none given', () => {
    const iso = computeReplyExpectedBy(NOW);
    expect(Date.parse(iso) - NOW).toBe(DEFAULT_REPLY_WINDOW_MS);
  });
  it('computeReplyExpectedBy honors a custom window', () => {
    const iso = computeReplyExpectedBy(NOW, 5000);
    expect(Date.parse(iso) - NOW).toBe(5000);
  });
});

// TS-1/TS-2: classification matrix.
describe('findOverdueReplyNeeded — classification matrix', () => {
  it('fire-and-forget is NEVER a candidate regardless of age', () => {
    const rows = [{ id: 'r1', payload: { reply_class: 'fire-and-forget', reply_expected_by: PAST } }];
    expect(findOverdueReplyNeeded(rows, NOW)).toHaveLength(0);
  });
  it('live-handshake is NEVER a candidate (synchronous await owns it, not the sweep)', () => {
    const rows = [{ id: 'r2', payload: { reply_class: 'live-handshake', reply_expected_by: PAST } }];
    expect(findOverdueReplyNeeded(rows, NOW)).toHaveLength(0);
  });
  it('reply-needed within its window is NOT a candidate', () => {
    const rows = [{ id: 'r3', payload: { reply_class: 'reply-needed', reply_expected_by: FUTURE, correlation_id: 'c3' } }];
    expect(findOverdueReplyNeeded(rows, NOW)).toHaveLength(0);
  });
  it('reply-needed past its window, unanswered, un-pinged IS a candidate', () => {
    const rows = [{ id: 'r4', payload: { reply_class: 'reply-needed', reply_expected_by: PAST, correlation_id: 'c4' } }];
    const result = findOverdueReplyNeeded(rows, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r4');
  });
  it('reply-needed past its window but ALREADY ANSWERED is NOT a candidate', () => {
    const rows = [{ id: 'r5', payload: { reply_class: 'reply-needed', reply_expected_by: PAST, correlation_id: 'c5' } }];
    expect(findOverdueReplyNeeded(rows, NOW, new Set(['c5']))).toHaveLength(0);
  });
  it('reply-needed past its window but ALREADY PINGED (ping_sent_at set) is NOT a candidate', () => {
    const rows = [{ id: 'r6', payload: { reply_class: 'reply-needed', reply_expected_by: PAST, correlation_id: 'c6', ping_sent_at: PAST } }];
    expect(findOverdueReplyNeeded(rows, NOW)).toHaveLength(0);
  });
  it('reply-needed with no reply_expected_by set is NOT a candidate (nothing to be overdue against)', () => {
    const rows = [{ id: 'r7', payload: { reply_class: 'reply-needed', correlation_id: 'c7' } }];
    expect(findOverdueReplyNeeded(rows, NOW)).toHaveLength(0);
  });
});

// Fake supabase: records inserts/updates; `rows` seeds the initial sender-owned query result.
function makeFakeSupabase({ rows = [], answeredRows = [] } = {}) {
  const inserts = [];
  const updates = [];
  const sb = {
    from(table) {
      if (table !== 'session_coordination') throw new Error('unexpected table ' + table);
      const b = {
        _mode: null,
        select(cols) {
          // resolveAnsweredSet selects 'id, payload' (FR-6: + id for its pagination tiebreaker);
          // the sender-owned sweep selects more columns.
          this._mode = cols === 'id, payload' ? 'answered' : 'sweep';
          return this;
        },
        eq() { return this; },
        is() { return this; },
        in() { return this; },
        // FR-6 (count-truncation discipline): resolveAnsweredSet paginates via
        // fetchAllPaginated, so its chain ends .order(...).range(from, to).
        order() { return this; },
        range(from, to) {
          const src = this._mode === 'answered' ? answeredRows : rows;
          return Promise.resolve({ data: src.slice(from, to + 1), error: null });
        },
        limit() {
          if (this._mode === 'answered') return Promise.resolve({ data: answeredRows, error: null });
          return Promise.resolve({ data: rows, error: null });
        },
        insert(row) {
          inserts.push(row);
          return { select() { return this; }, single() { return Promise.resolve({ data: { id: 'ping-1' }, error: null }); } };
        },
        update(patch) {
          updates.push(patch);
          return { eq() { return Promise.resolve({ data: null, error: null }); } };
        },
      };
      return b;
    },
  };
  return { sb, inserts, updates };
}

// TS-3: single-fire dedup across repeated ticks. `insert` is stubbed directly (DI'd via
// opts.insert) so this test exercises checkAndPingOverdueReplies's OWN logic, not
// dispatch.cjs's separate target-validation layer (already covered by dispatch.test.js).
describe('checkAndPingOverdueReplies — single-fire PING-ON-SILENCE', () => {
  const overdueRow = {
    id: 'row-overdue', target_session: 'live-uuid-1', subject: 'a subject', body: 'a body', created_at: '2026-07-02T10:00:00.000Z',
    payload: { reply_class: 'reply-needed', reply_expected_by: PAST, correlation_id: 'corr-x' },
  };
  function makeStubInsert(inserts) {
    return async (supabase, row) => { inserts.push(row); return { data: { id: 'ping-1' }, error: null }; };
  }

  it('pings exactly once for one overdue, unanswered, un-pinged row', async () => {
    const { sb, inserts: rawInserts, updates } = makeFakeSupabase({ rows: [overdueRow], answeredRows: [] });
    const inserts = [];
    const result = await checkAndPingOverdueReplies(sb, { sessionId: 'me', senderType: 'adam', now: NOW, insert: makeStubInsert(inserts) });
    expect(result.pinged).toBe(1);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload.kind).toBe('ping_on_silence');
    expect(inserts[0].payload.reply_to).toBe('corr-x');
    expect(inserts[0].payload.reply_class).toBe('fire-and-forget'); // a ping is never itself chased
    expect(inserts[0].target_session).toBe('live-uuid-1');
    expect(updates).toHaveLength(1); // ping_sent_at stamp on the original row
  });

  it('never pings an already-answered reply-needed row', async () => {
    const { sb } = makeFakeSupabase({ rows: [overdueRow], answeredRows: [{ payload: { reply_to: 'corr-x' } }] });
    const inserts = [];
    const result = await checkAndPingOverdueReplies(sb, { sessionId: 'me', senderType: 'adam', now: NOW, insert: makeStubInsert(inserts) });
    expect(result.pinged).toBe(0);
    expect(inserts).toHaveLength(0);
  });

  it('never pings a sentinel target (nobody-in-particular is listening)', async () => {
    const sentinelRow = { ...overdueRow, target_session: 'broadcast-coordinator' };
    const { sb } = makeFakeSupabase({ rows: [sentinelRow], answeredRows: [] });
    const inserts = [];
    const result = await checkAndPingOverdueReplies(sb, { sessionId: 'me', senderType: 'adam', now: NOW, insert: makeStubInsert(inserts) });
    expect(result.pinged).toBe(0);
    expect(inserts).toHaveLength(0);
  });

  it('a SECOND tick against the same (now-pinged) row sends nothing — the query itself excludes ping_sent_at rows', async () => {
    // Once ping_sent_at is stamped, the real query's .is('payload->>ping_sent_at', null) excludes the
    // row server-side. Simulate the post-first-tick DB state directly (empty query result).
    const { sb } = makeFakeSupabase({ rows: [], answeredRows: [] });
    const inserts = [];
    const result = await checkAndPingOverdueReplies(sb, { sessionId: 'me', senderType: 'adam', now: NOW, insert: makeStubInsert(inserts) });
    expect(result.pinged).toBe(0);
    expect(inserts).toHaveLength(0);
  });
});

// TS-4: negative control — the dedup gate must be load-bearing, not a tautology.
describe('negative control: findOverdueReplyNeeded WITHOUT the ping_sent_at gate', () => {
  it('would (incorrectly) re-flag an already-pinged row as a fresh candidate', () => {
    const rows = [{ id: 'r8', payload: { reply_class: 'reply-needed', reply_expected_by: PAST, correlation_id: 'c8', ping_sent_at: PAST } }];
    // The REAL function correctly excludes it:
    expect(findOverdueReplyNeeded(rows, NOW)).toHaveLength(0);
    // A naive re-implementation without the ping_sent_at check would wrongly include it —
    // proving the assertion above is sensitive to the gate, not vacuously true.
    const naive = rows.filter((r) => r.payload.reply_class === 'reply-needed' && Date.parse(r.payload.reply_expected_by) <= NOW);
    expect(naive).toHaveLength(1);
  });
});
