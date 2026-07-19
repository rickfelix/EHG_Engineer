/**
 * SD-LEO-INFRA-ADOPTED-RESUME-FINAL-001 (FR-2, TS-4)
 *
 * lib/coordinator/strand-age-gauge.cjs — pending_approval/LEAD_FINAL strand-age gauge.
 * Read-only: no test may assert a mutation to strategic_directives_v2 or claiming_session_id.
 */
import { describe, it, expect } from 'vitest';
import { planStrandAgeGauge, resolveThresholdMs, formatAge, DEFAULT_THRESHOLD_MS } from '../../../lib/coordinator/strand-age-gauge.cjs';

const NOW = Date.parse('2026-07-04T12:00:00Z');

function makeSupabase({ candidates = [], handoffsBySdId = {} } = {}) {
  const calls = { updates: [], deletes: [] };
  const from = (table) => {
    if (table === 'strategic_directives_v2') {
      // FR-6 (count-truncation discipline): planStrandAgeGauge now paginates via
      // fetchAllPaginated, so the chain ends in .order(...).range(from, to).
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        range: (from, to) => Promise.resolve({ data: candidates.slice(from, to + 1), error: null }),
        update: (payload) => { calls.updates.push({ table, payload }); return builder; },
        delete: () => { calls.deletes.push({ table }); return builder; },
        then: (resolve) => resolve({ data: candidates, error: null }),
      };
      return builder;
    }
    if (table === 'sd_phase_handoffs') {
      let currentSdId = null;
      const builder = {
        select: () => builder,
        eq: (col, val) => { if (col === 'sd_id') currentSdId = val; return builder; },
        order: () => builder,
        limit: () => Promise.resolve({ data: handoffsBySdId[currentSdId] || [], error: null }),
      };
      return builder;
    }
    throw new Error(`Unexpected table: ${table}`);
  };
  return { from, _calls: calls };
}

describe('resolveThresholdMs', () => {
  it('defaults to 10 minutes when no env override', () => {
    expect(resolveThresholdMs({})).toBe(DEFAULT_THRESHOLD_MS);
    expect(DEFAULT_THRESHOLD_MS).toBe(10 * 60 * 1000);
  });

  it('honors STRAND_AGE_GAUGE_THRESHOLD_MIN override', () => {
    expect(resolveThresholdMs({ STRAND_AGE_GAUGE_THRESHOLD_MIN: '20' })).toBe(20 * 60 * 1000);
  });
});

describe('formatAge', () => {
  it('formats sub-hour ages in minutes', () => {
    expect(formatAge(15 * 60 * 1000)).toBe('15m');
  });
  it('formats multi-hour ages as Nh + remainder minutes', () => {
    expect(formatAge(150 * 60 * 1000)).toBe('2h30m');
    expect(formatAge(120 * 60 * 1000)).toBe('2h');
  });
});

describe('planStrandAgeGauge (TS-4)', () => {
  it('flags an SD stranded past the threshold, using updated_at', () => {
    const supabase = makeSupabase({
      candidates: [
        { sd_key: 'SD-STRANDED-001', id: 'uuid-1', updated_at: '2026-07-04T11:45:00Z', created_at: '2026-07-04T09:00:00Z' }, // 15min old
      ],
    });
    return planStrandAgeGauge(supabase, { nowMs: NOW }).then((gauge) => {
      expect(gauge.flagged).toHaveLength(1);
      expect(gauge.flagged[0].sd_key).toBe('SD-STRANDED-001');
      expect(gauge.flagged[0].ageSource).toBe('updated_at');
    });
  });

  it('does NOT flag a fresh pending_approval/LEAD_FINAL SD younger than the threshold (no false positive)', () => {
    const supabase = makeSupabase({
      candidates: [
        { sd_key: 'SD-FRESH-001', id: 'uuid-2', updated_at: '2026-07-04T11:58:00Z', created_at: '2026-07-04T11:00:00Z' }, // 2min old
      ],
    });
    return planStrandAgeGauge(supabase, { nowMs: NOW }).then((gauge) => {
      expect(gauge.flagged).toHaveLength(0);
      expect(gauge.rows).toHaveLength(1); // still tracked, just not flagged
    });
  });

  it('falls back to the latest sd_phase_handoffs.resolved_at when updated_at looks unreliable (predates created_at)', () => {
    const supabase = makeSupabase({
      candidates: [
        { sd_key: 'SD-UNRELIABLE-001', id: 'uuid-3', updated_at: '2026-07-01T00:00:00Z', created_at: '2026-07-04T09:00:00Z' },
      ],
      handoffsBySdId: {
        'uuid-3': [{ resolved_at: '2026-07-04T11:40:00Z' }], // 20min old
      },
    });
    return planStrandAgeGauge(supabase, { nowMs: NOW }).then((gauge) => {
      expect(gauge.flagged).toHaveLength(1);
      expect(gauge.flagged[0].ageSource).toBe('latest_handoff_resolved_at');
    });
  });

  it('returns no flagged rows and no error when there are no pending_approval/LEAD_FINAL candidates', () => {
    const supabase = makeSupabase({ candidates: [] });
    return planStrandAgeGauge(supabase, { nowMs: NOW }).then((gauge) => {
      expect(gauge.flagged).toEqual([]);
      expect(gauge.rows).toEqual([]);
    });
  });

  it('is read-only: never calls .update() or .delete() on strategic_directives_v2', () => {
    const supabase = makeSupabase({
      candidates: [
        { sd_key: 'SD-STRANDED-002', id: 'uuid-4', updated_at: '2026-07-04T11:00:00Z', created_at: '2026-07-04T09:00:00Z' },
      ],
    });
    return planStrandAgeGauge(supabase, { nowMs: NOW }).then(() => {
      expect(supabase._calls.updates).toEqual([]);
      expect(supabase._calls.deletes).toEqual([]);
    });
  });
});
