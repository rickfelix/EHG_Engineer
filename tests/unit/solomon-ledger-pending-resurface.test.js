/**
 * Unit tests for scripts/solomon-ledger-pending-resurface.cjs — QF-20260704-598.
 * Pending Solomon-ledger rows can decay silently past their SLA; this mirrors
 * feedback-sla-gauge.cjs's dedup-before-insert discipline into Adam's inbox instead.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  dedupKeyFor,
  planStalePending,
  resurfaceStalePending,
} = require('../../scripts/solomon-ledger-pending-resurface.cjs');

const ADAM_ID = 'adam-session-1';

/** Mutable in-memory mock for the 2 tables this module touches. */
function createMockSupabase({ ledgerRows = [], inboxRows = [] } = {}) {
  const ledger = [...ledgerRows];
  const inbox = [...inboxRows];
  return {
    from(table) {
      if (table === 'solomon_advice_outcome_ledger') {
        return {
          select: () => ({
            eq: (col, val) => ({
              lte: (col2, val2) => ({
                order: () => ({
                  range: async (from, to) => {
                    const filtered = ledger
                      .filter((r) => r[col] === val && r[col2] <= val2)
                      .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
                    return { data: filtered.slice(from, to + 1), error: null };
                  },
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'session_coordination') {
        return {
          select: () => ({
            eq: (col1, val1) => ({
              eq: (col2, val2) => ({
                limit: async () => ({
                  data: inbox.filter((r) => r[col1] === val1 && (r.payload || {}).dedup_key === val2),
                  error: null,
                }),
              }),
            }),
          }),
          insert: async (row) => { inbox.push(row); return { error: null }; },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    _inbox: inbox,
  };
}

describe('dedupKeyFor()', () => {
  it('is stable for the same ledger row + day, and changes across days', () => {
    const day1 = new Date('2026-07-04T10:00:00Z').getTime();
    const day2 = new Date('2026-07-05T10:00:00Z').getTime();
    expect(dedupKeyFor('ledger-1', day1)).toBe(dedupKeyFor('ledger-1', day1));
    expect(dedupKeyFor('ledger-1', day1)).not.toBe(dedupKeyFor('ledger-1', day2));
  });
});

describe('planStalePending()', () => {
  it('surfaces only pending rows older than the threshold', async () => {
    const nowMs = new Date('2026-07-05T12:00:00Z').getTime();
    const supabase = createMockSupabase({
      ledgerRows: [
        { id: 'l1', decision: 'pending', created_at: '2026-07-04T00:00:00Z' }, // 36h old — stale
        { id: 'l2', decision: 'pending', created_at: '2026-07-05T11:00:00Z' }, // 1h old — fresh
        { id: 'l3', decision: 'accepted', created_at: '2026-07-01T00:00:00Z' }, // decided — excluded
      ],
    });
    const rows = await planStalePending(supabase, { thresholdHours: 24, nowMs });
    expect(rows.map((r) => r.id)).toEqual(['l1']);
  });

  // QF-20260710-743: the original .limit(50) query starved every row past the oldest 50
  // whenever the head of the queue never resolved. Pins the fix with a small pageSize so
  // the fixture doesn't need 51+ rows to prove pagination past a single page.
  it('pages past a single-page window so rows beyond it are not starved (QF-20260710-743)', async () => {
    const nowMs = new Date('2026-07-05T12:00:00Z').getTime();
    const ledgerRows = Array.from({ length: 5 }, (_, i) => ({
      id: `l${i + 1}`,
      decision: 'pending',
      created_at: new Date(nowMs - (5 - i) * 48 * 60 * 60 * 1000).toISOString(), // all stale, oldest first
    }));
    const supabase = createMockSupabase({ ledgerRows });

    const rows = await planStalePending(supabase, { thresholdHours: 24, nowMs, pageSize: 2, maxPages: 5 });
    expect(rows.map((r) => r.id)).toEqual(['l1', 'l2', 'l3', 'l4', 'l5']);
  });

  it('respects maxPages as a bounded safety cap rather than looping forever', async () => {
    const nowMs = new Date('2026-07-05T12:00:00Z').getTime();
    const ledgerRows = Array.from({ length: 10 }, (_, i) => ({
      id: `l${i + 1}`,
      decision: 'pending',
      created_at: new Date(nowMs - (10 - i) * 48 * 60 * 60 * 1000).toISOString(),
    }));
    const supabase = createMockSupabase({ ledgerRows });

    const rows = await planStalePending(supabase, { thresholdHours: 24, nowMs, pageSize: 2, maxPages: 3 });
    expect(rows).toHaveLength(6); // 3 pages * 2 per page, not the full 10
  });
});

describe('resurfaceStalePending() — daily dedup + no-noise-on-fresh-rows', () => {
  it('resurfaces a stale pending row into Adams inbox exactly once', async () => {
    const nowMs = new Date('2026-07-05T12:00:00Z').getTime();
    const supabase = createMockSupabase({
      ledgerRows: [{ id: 'l1', decision: 'pending', correlation_id: 'corr-1', sd_key: null, proposal_summary: 'do the thing', created_at: '2026-07-04T00:00:00Z' }],
    });
    const { candidates, resurfaced } = await resurfaceStalePending(supabase, ADAM_ID, { thresholdHours: 24, nowMs });
    expect(candidates).toHaveLength(1);
    expect(resurfaced).toEqual(['l1']);
    expect(supabase._inbox).toHaveLength(1);
    expect(supabase._inbox[0].target_session).toBe(ADAM_ID);
    expect(supabase._inbox[0].payload.ledger_id).toBe('l1');
  });

  it('does not re-resurface the same row on a second run the same day (dedup)', async () => {
    const nowMs = new Date('2026-07-05T12:00:00Z').getTime();
    const supabase = createMockSupabase({
      ledgerRows: [{ id: 'l1', decision: 'pending', correlation_id: 'corr-1', sd_key: null, proposal_summary: 'do the thing', created_at: '2026-07-04T00:00:00Z' }],
    });
    await resurfaceStalePending(supabase, ADAM_ID, { thresholdHours: 24, nowMs });
    const second = await resurfaceStalePending(supabase, ADAM_ID, { thresholdHours: 24, nowMs: nowMs + 60_000 });
    expect(second.resurfaced).toEqual([]);
    expect(supabase._inbox).toHaveLength(1); // no duplicate insert
  });

  it('produces zero candidates and zero noise when no pending row is stale', async () => {
    const nowMs = new Date('2026-07-05T12:00:00Z').getTime();
    const supabase = createMockSupabase({
      ledgerRows: [{ id: 'l1', decision: 'pending', correlation_id: 'corr-1', sd_key: null, proposal_summary: 'fresh', created_at: '2026-07-05T11:00:00Z' }],
    });
    const { candidates, resurfaced } = await resurfaceStalePending(supabase, ADAM_ID, { thresholdHours: 24, nowMs });
    expect(candidates).toHaveLength(0);
    expect(resurfaced).toHaveLength(0);
    expect(supabase._inbox).toHaveLength(0);
  });
});
