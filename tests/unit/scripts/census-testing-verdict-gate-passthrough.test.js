/**
 * QF-20260902-824, item (a): dry-run census for the SUBAGENT_VERDICT_MODE flip.
 *
 * The test-worthy part is classifyAtAcceptTime()'s at-or-before-acceptance filter --
 * without it, a TESTING re-run recorded AFTER a handoff was already accepted (a later
 * phase's re-test, a retry) reads as evidence the gate saw, which it could not have.
 * Measured live before this fix existed: 15 of 29 candidate rows in a real 7-day sample
 * had evidence_at AFTER accepted_at and were false positives under a naive
 * "latest row regardless of time" query.
 */
import { describe, it, expect } from 'vitest';
import { classifyAtAcceptTime, runCensus } from '../../../scripts/census-testing-verdict-gate-passthrough.mjs';

describe('classifyAtAcceptTime()', () => {
  it('is NOT rejecting when the only TESTING row is a BLOCKED verdict recorded AFTER acceptance', () => {
    const result = classifyAtAcceptTime('2026-09-02T13:57:50Z', [
      { verdict: 'BLOCKED', created_at: '2026-09-02T17:51:48Z' }, // after acceptance
    ]);
    expect(result.rejecting).toBe(false);
  });

  it('IS rejecting when a BLOCKED verdict was recorded BEFORE acceptance', () => {
    const result = classifyAtAcceptTime('2026-09-02T18:13:09Z', [
      { verdict: 'BLOCKED', created_at: '2026-09-02T18:11:54Z' }, // before acceptance
    ]);
    expect(result.rejecting).toBe(true);
    expect(result.verdict).toBe('BLOCKED');
  });

  it('uses the LATEST prior row when multiple exist before acceptance (a fixed-then-rejected sequence)', () => {
    const result = classifyAtAcceptTime('2026-09-02T18:00:00Z', [
      { verdict: 'PASS', created_at: '2026-09-02T17:00:00Z' },
      { verdict: 'BLOCKED', created_at: '2026-09-02T17:30:00Z' }, // most recent prior row
    ]);
    expect(result.rejecting).toBe(true);
  });

  it('is NOT rejecting when the latest prior row is a passing verdict', () => {
    const result = classifyAtAcceptTime('2026-09-02T18:00:00Z', [
      { verdict: 'BLOCKED', created_at: '2026-09-02T16:00:00Z' },
      { verdict: 'PASS', created_at: '2026-09-02T17:00:00Z' }, // most recent prior row
    ]);
    expect(result.rejecting).toBe(false);
  });

  it('is NOT rejecting when there is no TESTING evidence at all before acceptance', () => {
    expect(classifyAtAcceptTime('2026-09-02T18:00:00Z', []).rejecting).toBe(false);
    expect(classifyAtAcceptTime('2026-09-02T18:00:00Z', null).rejecting).toBe(false);
  });

  it.each(['FAIL', 'BLOCKED', 'PENDING', 'MANUAL_REQUIRED', 'ERROR'])('classifies %s as rejecting', (verdict) => {
    const result = classifyAtAcceptTime('2026-09-02T18:00:00Z', [{ verdict, created_at: '2026-09-02T17:00:00Z' }]);
    expect(result.rejecting).toBe(true);
  });

  it.each(['PASS', 'CONDITIONAL_PASS', 'WARNING'])('classifies %s as NOT rejecting', (verdict) => {
    const result = classifyAtAcceptTime('2026-09-02T18:00:00Z', [{ verdict, created_at: '2026-09-02T17:00:00Z' }]);
    expect(result.rejecting).toBe(false);
  });
});

describe('runCensus()', () => {
  function makeFakeSupabase({ handoffs, testingRowsBySd }) {
    return {
      from(table) {
        if (table === 'sd_phase_handoffs') {
          return {
            select: () => ({
              in: () => ({
                eq: () => ({
                  gte: async () => ({ data: handoffs, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'sub_agent_execution_results') {
          return {
            select: () => ({
              eq: (col, sdId) => ({
                ilike: () => ({
                  lte: () => ({
                    order: () => ({
                      limit: async () => ({ data: testingRowsBySd[sdId] || [], error: null }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    };
  }

  it('read-only: never calls anything but select/eq/in/gte/ilike/lte/order/limit — no insert/update/delete', async () => {
    const supabase = makeFakeSupabase({
      handoffs: [{ id: 'h1', sd_id: 'sd-1', handoff_type: 'PLAN-TO-EXEC', accepted_at: '2026-09-02T18:00:00Z', created_at: '2026-09-02T17:00:00Z' }],
      testingRowsBySd: { 'sd-1': [{ verdict: 'PASS', created_at: '2026-09-02T17:30:00Z' }] },
    });
    // If runCensus ever called .insert/.update/.delete, the fake client's `from()` would
    // throw on the missing method before reaching those (they are never stubbed above).
    const result = await runCensus({ supabase, days: 7 });
    expect(result.scanned).toBe(1);
    expect(result.wouldHaveRefused).toEqual([]);
  });

  it('reports exactly the handoffs that would have been refused, with verdict and evidence timestamp', async () => {
    const supabase = makeFakeSupabase({
      handoffs: [
        { id: 'h1', sd_id: 'sd-1', handoff_type: 'PLAN-TO-EXEC', accepted_at: '2026-09-02T18:00:00Z', created_at: '2026-09-02T17:00:00Z' },
        { id: 'h2', sd_id: 'sd-2', handoff_type: 'EXEC-TO-PLAN', accepted_at: '2026-09-02T19:00:00Z', created_at: '2026-09-02T18:30:00Z' },
      ],
      testingRowsBySd: {
        'sd-1': [{ verdict: 'BLOCKED', created_at: '2026-09-02T17:45:00Z' }],
        'sd-2': [{ verdict: 'PASS', created_at: '2026-09-02T18:45:00Z' }],
      },
    });
    const result = await runCensus({ supabase, days: 7 });
    expect(result.scanned).toBe(2);
    expect(result.wouldHaveRefused).toHaveLength(1);
    expect(result.wouldHaveRefused[0]).toMatchObject({ handoff_id: 'h1', verdict: 'BLOCKED' });
  });

  it('a single sub-agent lookup failure does not abort the whole census — that handoff is just excluded, not fatal', async () => {
    const supabase = {
      from(table) {
        if (table === 'sd_phase_handoffs') {
          return { select: () => ({ in: () => ({ eq: () => ({ gte: async () => ({ data: [{ id: 'h1', sd_id: 'sd-1', accepted_at: '2026-09-02T18:00:00Z', created_at: '2026-09-02T17:00:00Z', handoff_type: 'PLAN-TO-EXEC' }], error: null }) }) }) }) };
        }
        return { select: () => ({ eq: () => ({ ilike: () => ({ lte: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: 'boom' } }) }) }) }) }) }) };
      },
    };
    const result = await runCensus({ supabase, days: 7 });
    expect(result.scanned).toBe(1);
    expect(result.wouldHaveRefused).toEqual([]);
  });
});
