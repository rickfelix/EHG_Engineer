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
                  limit: async () => ({
                    data: ledger.filter((r) => r[col] === val && r[col2] <= val2),
                    error: null,
                  }),
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
