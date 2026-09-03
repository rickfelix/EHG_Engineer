/**
 * QF-20260902-824: coordinator flip-timing ruling (directive a4dfd033) -- flip
 * SUBAGENT_VERDICT_MODE=block ONLY when this in-flight census reads zero.
 */
import { describe, it, expect } from 'vitest';
import { runInFlightCensus } from '../../../scripts/census-inflight-testing-block-risk.mjs';

function makeFakeSupabase({ activeSds, handoffsBySd = {}, testingBySd = {} }) {
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return { select: () => ({ eq: () => ({ limit: async () => ({ data: activeSds, error: null }) }) }) };
      }
      if (table === 'sd_phase_handoffs') {
        return {
          select: () => ({
            eq: (col, sdId) => ({
              order: () => ({
                limit: async () => ({ data: handoffsBySd[sdId] || [], error: null }),
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
                order: () => ({
                  limit: async () => ({ data: testingBySd[sdId] || [], error: null }),
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

describe('runInFlightCensus()', () => {
  it('excludes an SD whose latest handoff is already accepted, even with a rejecting TESTING verdict', async () => {
    const supabase = makeFakeSupabase({
      activeSds: [{ id: 'sd-1', sd_key: 'SD-X' }],
      handoffsBySd: { 'sd-1': [{ status: 'accepted', created_at: '2026-09-02T18:00:00Z' }] },
      testingBySd: { 'sd-1': [{ verdict: 'BLOCKED', created_at: '2026-09-02T17:00:00Z' }] },
    });
    const result = await runInFlightCensus({ supabase });
    expect(result.blocking).toEqual([]);
  });

  it('flags an SD that is in-flight (latest handoff rejected) AND carries a rejecting TESTING verdict', async () => {
    const supabase = makeFakeSupabase({
      activeSds: [{ id: 'sd-1', sd_key: 'SD-LEO-FIX-KPI-COUNTS-CHEAP-001' }],
      handoffsBySd: { 'sd-1': [{ status: 'rejected', created_at: '2026-09-02T18:00:00Z' }] },
      testingBySd: { 'sd-1': [{ verdict: 'BLOCKED', created_at: '2026-09-02T17:00:00Z' }] },
    });
    const result = await runInFlightCensus({ supabase });
    expect(result.blocking).toHaveLength(1);
    expect(result.blocking[0]).toMatchObject({ sd_key: 'SD-LEO-FIX-KPI-COUNTS-CHEAP-001', testing_verdict: 'BLOCKED' });
  });

  it('excludes an in-flight SD whose latest TESTING verdict is passing', async () => {
    const supabase = makeFakeSupabase({
      activeSds: [{ id: 'sd-1', sd_key: 'SD-X' }],
      handoffsBySd: { 'sd-1': [{ status: 'blocked', created_at: '2026-09-02T18:00:00Z' }] },
      testingBySd: { 'sd-1': [{ verdict: 'PASS', created_at: '2026-09-02T17:00:00Z' }] },
    });
    const result = await runInFlightCensus({ supabase });
    expect(result.blocking).toEqual([]);
  });

  it('excludes an in-flight SD with NO TESTING evidence at all', async () => {
    const supabase = makeFakeSupabase({
      activeSds: [{ id: 'sd-1', sd_key: 'SD-X' }],
      handoffsBySd: { 'sd-1': [{ status: 'rejected', created_at: '2026-09-02T18:00:00Z' }] },
      testingBySd: {},
    });
    const result = await runInFlightCensus({ supabase });
    expect(result.blocking).toEqual([]);
  });

  it('excludes an active SD with NO handoff rows at all (never yet through any phase)', async () => {
    const supabase = makeFakeSupabase({
      activeSds: [{ id: 'sd-1', sd_key: 'SD-X' }],
      handoffsBySd: {},
      testingBySd: { 'sd-1': [{ verdict: 'BLOCKED', created_at: '2026-09-02T17:00:00Z' }] },
    });
    const result = await runInFlightCensus({ supabase });
    // latest_handoff_status is null (not 'accepted'), so this SD is correctly IN scope --
    // and it IS flagged, since a real rejecting verdict exists.
    expect(result.blocking).toHaveLength(1);
  });

  it('a single lookup failure excludes just that SD rather than aborting the whole census', async () => {
    const supabase = {
      from(table) {
        if (table === 'strategic_directives_v2') {
          return { select: () => ({ eq: () => ({ limit: async () => ({ data: [{ id: 'sd-1', sd_key: 'SD-X' }, { id: 'sd-2', sd_key: 'SD-Y' }], error: null }) }) }) };
        }
        if (table === 'sd_phase_handoffs') {
          return {
            select: () => ({
              eq: (col, sdId) => ({
                order: () => ({
                  limit: async () => sdId === 'sd-1'
                    ? { data: null, error: { message: 'boom' } }
                    : { data: [{ status: 'rejected', created_at: '2026-09-02T18:00:00Z' }], error: null },
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({ eq: () => ({ ilike: () => ({ order: () => ({ limit: async () => ({ data: [{ verdict: 'FAIL', created_at: '2026-09-02T17:00:00Z' }], error: null }) }) }) }) }),
        };
      },
    };
    const result = await runInFlightCensus({ supabase });
    expect(result.scannedActiveSds).toBe(2);
    expect(result.blocking).toHaveLength(1);
    expect(result.blocking[0].sd_key).toBe('SD-Y');
  });

  it('reports scannedActiveSds as the total count of active SDs, not just the blocking ones', async () => {
    const supabase = makeFakeSupabase({
      activeSds: [{ id: 'sd-1', sd_key: 'SD-A' }, { id: 'sd-2', sd_key: 'SD-B' }],
      handoffsBySd: {
        'sd-1': [{ status: 'accepted', created_at: '2026-09-02T18:00:00Z' }],
        'sd-2': [{ status: 'accepted', created_at: '2026-09-02T18:00:00Z' }],
      },
    });
    const result = await runInFlightCensus({ supabase });
    expect(result.scannedActiveSds).toBe(2);
    expect(result.blocking).toEqual([]);
  });
});
