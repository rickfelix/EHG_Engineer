/**
 * Unit tests for lib/governance/per-loop-health-gauges.js's pure detector + fetch shaping.
 *
 * SD-LEO-INFRA-009-LEAF-PER-001 (C-009 leaf 3): per-loop health KPIs (witnesses-before-prevention,
 * recurrence-after-closure) computed from the leaf-1 spine (v_improvement_ledger).
 *
 * @module tests/unit/governance/per-loop-health-gauges.test.js
 */

import { describe, it, expect } from 'vitest';
import {
  LOOP_IDS,
  computeLoopHealth,
  fetchLoopStageRows,
} from '../../../lib/governance/per-loop-health-gauges.js';

describe('computeLoopHealth: loops without a PREVENT stage', () => {
  it('B_signal_aggregation is always not-applicable, regardless of input rows', () => {
    const rows = [{ cycle_id: 'c1', stage: 'RECORD', entered_at: '2026-01-01T00:00:00Z' }];
    expect(computeLoopHealth('B_signal_aggregation', rows)).toEqual({
      applicable: false, witnessesBeforePrevention: null, recurrenceAfterClosure: null, count: 0,
    });
  });

  it('C_retro_learn is always not-applicable, even with a (spurious) PREVENT row present', () => {
    const rows = [
      { cycle_id: 'c1', stage: 'RECORD', entered_at: '2026-01-01T00:00:00Z' },
      { cycle_id: 'c1', stage: 'PREVENT', entered_at: '2026-01-02T00:00:00Z' },
    ];
    expect(computeLoopHealth('C_retro_learn', rows)).toEqual({
      applicable: false, witnessesBeforePrevention: null, recurrenceAfterClosure: null, count: 0,
    });
  });
});

describe('computeLoopHealth: applicable loops (A/D/E/F)', () => {
  it('counts a cycle with only a RECORD row as an un-prevented witness', () => {
    const rows = [{ cycle_id: 'c1', stage: 'RECORD', entered_at: '2026-01-01T00:00:00Z' }];
    const result = computeLoopHealth('A_applied_rate', rows);
    expect(result).toMatchObject({ applicable: true, witnessesBeforePrevention: 1, recurrenceAfterClosure: 0, count: 0 });
  });

  it('does not count a normal forward-order RECORD-then-PREVENT cycle in either KPI', () => {
    const rows = [
      { cycle_id: 'c1', stage: 'RECORD', entered_at: '2026-01-01T00:00:00Z' },
      { cycle_id: 'c1', stage: 'PREVENT', entered_at: '2026-01-02T00:00:00Z' },
    ];
    const result = computeLoopHealth('A_applied_rate', rows);
    expect(result).toMatchObject({ applicable: true, witnessesBeforePrevention: 0, recurrenceAfterClosure: 0, count: 0 });
  });

  it('counts a cycle whose RECORD reappears after its own earliest PREVENT as a recurrence', () => {
    const rows = [
      { cycle_id: 'c1', stage: 'RECORD', entered_at: '2026-01-01T00:00:00Z' },
      { cycle_id: 'c1', stage: 'PREVENT', entered_at: '2026-01-02T00:00:00Z' },
      { cycle_id: 'c1', stage: 'RECORD', entered_at: '2026-01-03T00:00:00Z' },
    ];
    const result = computeLoopHealth('A_applied_rate', rows);
    expect(result).toMatchObject({ applicable: true, witnessesBeforePrevention: 0, recurrenceAfterClosure: 1, count: 1 });
  });

  it('uses the EARLIEST PREVENT per cycle when multiple PREVENT rows exist', () => {
    const rows = [
      { cycle_id: 'c1', stage: 'RECORD', entered_at: '2026-01-01T00:00:00Z' },
      { cycle_id: 'c1', stage: 'PREVENT', entered_at: '2026-01-05T00:00:00Z' },
      { cycle_id: 'c1', stage: 'PREVENT', entered_at: '2026-01-02T00:00:00Z' },
      { cycle_id: 'c1', stage: 'RECORD', entered_at: '2026-01-03T00:00:00Z' },
    ];
    // The earliest PREVENT is 01-02; the second RECORD (01-03) is after it -> recurrence.
    const result = computeLoopHealth('A_applied_rate', rows);
    expect(result).toMatchObject({ recurrenceAfterClosure: 1 });
  });

  it('trips (count:1) when witnessesBeforePrevention exceeds the target of 2', () => {
    const rows = [
      { cycle_id: 'c1', stage: 'RECORD', entered_at: '2026-01-01T00:00:00Z' },
      { cycle_id: 'c2', stage: 'RECORD', entered_at: '2026-01-01T00:00:00Z' },
      { cycle_id: 'c3', stage: 'RECORD', entered_at: '2026-01-01T00:00:00Z' },
    ];
    const result = computeLoopHealth('F_pat_registry', rows);
    expect(result).toMatchObject({ witnessesBeforePrevention: 3, count: 1 });
  });

  it('does not trip when witnessesBeforePrevention is at or below the target of 2', () => {
    const rows = [
      { cycle_id: 'c1', stage: 'RECORD', entered_at: '2026-01-01T00:00:00Z' },
      { cycle_id: 'c2', stage: 'RECORD', entered_at: '2026-01-01T00:00:00Z' },
    ];
    const result = computeLoopHealth('F_pat_registry', rows);
    expect(result).toMatchObject({ witnessesBeforePrevention: 2, recurrenceAfterClosure: 0, count: 0 });
  });

  it('handles an empty/undefined row list defensively (a loop with no activity yet)', () => {
    expect(computeLoopHealth('D_convergence_clone', [])).toMatchObject({ applicable: true, witnessesBeforePrevention: 0, recurrenceAfterClosure: 0, count: 0 });
    expect(computeLoopHealth('D_convergence_clone', undefined)).toMatchObject({ applicable: true, witnessesBeforePrevention: 0, recurrenceAfterClosure: 0, count: 0 });
  });

  it('ignores a row with a missing cycle_id or an unparseable entered_at rather than throwing', () => {
    const rows = [
      { cycle_id: null, stage: 'RECORD', entered_at: '2026-01-01T00:00:00Z' },
      { cycle_id: 'c1', stage: 'RECORD', entered_at: 'not-a-date' },
    ];
    expect(() => computeLoopHealth('E_role_self_review', rows)).not.toThrow();
    expect(computeLoopHealth('E_role_self_review', rows)).toMatchObject({ applicable: true, witnessesBeforePrevention: 0, recurrenceAfterClosure: 0, count: 0 });
  });
});

describe('LOOP_IDS', () => {
  it('lists exactly the 6 leaf-1 spine loops', () => {
    expect(LOOP_IDS).toEqual([
      'A_applied_rate',
      'B_signal_aggregation',
      'C_retro_learn',
      'D_convergence_clone',
      'E_role_self_review',
      'F_pat_registry',
    ]);
  });
});

describe('fetchLoopStageRows', () => {
  // FR-6 (count-truncation discipline): fetchLoopStageRows now paginates via fetchAllPaginated,
  // so the chain ends in .range(from, to) instead of .limit(n) — the mock slices accordingly.
  function makeSb(rows, capturedOrderCalls) {
    return {
      from(_table) {
        const chain = {
          select() { return chain; },
          eq() { return chain; },
          in() { return chain; },
          order(col, opts) {
            if (capturedOrderCalls) capturedOrderCalls.push({ col, opts });
            return chain;
          },
          range: async (from, to) => ({ data: rows.slice(from, to + 1), error: null }),
        };
        return chain;
      },
    };
  }

  it('orders by entered_at DESCENDING so a truncated read keeps the most recent activity, not the oldest', async () => {
    const orderCalls = [];
    await fetchLoopStageRows(makeSb([], orderCalls), 'A_applied_rate', { limit: 10 });
    expect(orderCalls[0]).toEqual({ col: 'entered_at', opts: { ascending: false } });
    // The pagination tiebreaker is a secondary order — the primary DESC recency order stays first.
    expect(orderCalls.map((c) => c.col)).toEqual(['entered_at', 'cycle_id']);
  });

  it('returns truncated:false when fewer rows than the limit are returned', async () => {
    const rows = [{ cycle_id: 'c1', stage: 'RECORD', entered_at: '2026-01-01T00:00:00Z' }];
    const result = await fetchLoopStageRows(makeSb(rows), 'A_applied_rate', { limit: 10 });
    expect(result).toEqual({ rows, truncated: false });
  });

  it('returns truncated:true when the row count equals the configured limit', async () => {
    const rows = [
      { cycle_id: 'c1', stage: 'RECORD', entered_at: '2026-01-01T00:00:00Z' },
      { cycle_id: 'c2', stage: 'RECORD', entered_at: '2026-01-01T00:00:00Z' },
    ];
    const result = await fetchLoopStageRows(makeSb(rows), 'F_pat_registry', { limit: 2 });
    expect(result.truncated).toBe(true);
  });

  it('throws a descriptive error on a query failure (fail-loud, matches the sibling fetcher contract)', async () => {
    const failChain = {
      select: () => failChain, eq: () => failChain, in: () => failChain, order: () => failChain,
      range: async () => ({ data: null, error: { message: 'boom' } }),
    };
    const sb = { from: () => failChain };
    await expect(fetchLoopStageRows(sb, 'A_applied_rate')).rejects.toThrow(/A_applied_rate.*boom/);
  });
});
