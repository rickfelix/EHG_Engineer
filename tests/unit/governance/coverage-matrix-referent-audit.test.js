/**
 * SD-LEO-INFRA-COVERAGE-MATRIX-SURFACE-001, FR-6 -- unit coverage for the monthly referent-audit
 * rotation's decision logic (delta computation, sample selection, period-idempotency), using
 * injected-stub Supabase clients.
 */
import { describe, it, expect } from 'vitest';
import { selectSampleVerificationCandidates, runRotation } from '../../../lib/governance/coverage-matrix-referent-audit.js';

describe('selectSampleVerificationCandidates', () => {
  it('selects at most 3 candidates by default', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ surface_class: 'db_table', surface_key: `t${i}` }));
    expect(selectSampleVerificationCandidates(rows)).toHaveLength(3);
  });

  it('returns all rows (not padded/duplicated) when fewer than the sample size exist', () => {
    const rows = [{ surface_class: 'db_table', surface_key: 't0' }];
    expect(selectSampleVerificationCandidates(rows)).toEqual(rows);
  });

  it('returns an empty array (not a throw) with zero covered rows', () => {
    expect(selectSampleVerificationCandidates([])).toEqual([]);
  });
});

function fakeSupabase({ priorRunThisMonth = null, lastRun = null, coverageMatrixRows = [], coveredRows = [] } = {}) {
  const insertedRuns = [];
  const insertedFeedback = [];
  return {
    insertedRuns,
    insertedFeedback,
    from: (table) => {
      if (table === 'coverage_matrix_rotation_runs') {
        return {
          select: () => ({
            gte: () => ({ limit: () => Promise.resolve({ data: priorRunThisMonth ? [priorRunThisMonth] : [], error: null }) }),
            order: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: lastRun, error: null }) }) }),
          }),
          insert: (row) => { insertedRuns.push(row); return Promise.resolve({ error: null }); },
        };
      }
      if (table === 'coverage_matrix') {
        return {
          select: (cols) => {
            // computeDelta selects is_active/first_seen_at (optionally .gt for warm start); the
            // covered-rows fetch selects only surface_class/surface_key then .eq('status','covered').
            // FR-6 (count-truncation discipline): both reads now paginate via fetchAllPaginated,
            // so every chain ends .order(...).order(...).range(from, to).
            const isDeltaQuery = cols?.includes('is_active');
            let data = isDeltaQuery ? coverageMatrixRows : coveredRows;
            const chain = {
              gt: () => { data = coverageMatrixRows; return chain; },
              eq: () => { data = coveredRows; return chain; },
              order: () => chain,
              range: (from, to) => Promise.resolve({ data: (data || []).slice(from, to + 1), error: null }),
            };
            return chain;
          },
        };
      }
      if (table === 'feedback') {
        return {
          insert: (row) => ({
            select: () => ({
              single: () => {
                const id = `fb-${insertedFeedback.length + 1}`;
                insertedFeedback.push({ id, row });
                return Promise.resolve({ data: { id }, error: null });
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('runRotation', () => {
  it('is a no-op when a rotation already ran this calendar month', async () => {
    const sb = fakeSupabase({ priorRunThisMonth: { id: 'r1', ran_at: new Date().toISOString() } });
    const result = await runRotation(sb);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('already_ran_this_period');
  });

  it('cold-starts (no prior rotation row) by treating the whole matrix as delta without throwing', async () => {
    const sb = fakeSupabase({
      priorRunThisMonth: null,
      lastRun: null,
      coverageMatrixRows: [{ surface_class: 'db_table', surface_key: 'new_table', status: 'unchecked', is_active: true, first_seen_at: '2026-01-01', updated_at: '2026-01-01' }],
      coveredRows: [{ surface_class: 'db_table', surface_key: 'covered_table' }],
    });
    const result = await runRotation(sb);
    expect(result.skipped).toBe(false);
    expect(result.delta.new_unchecked).toHaveLength(1);
    expect(result.sampleCandidates).toHaveLength(1);
    expect(sb.insertedRuns).toHaveLength(1);
  });

  it('emits a delta feedback item plus one per sample candidate', async () => {
    const sb = fakeSupabase({
      coverageMatrixRows: [{ surface_class: 'db_table', surface_key: 'new_table', status: 'unchecked', is_active: true, first_seen_at: '2026-01-01', updated_at: '2026-01-01' }],
      coveredRows: [{ surface_class: 'db_table', surface_key: 'covered_table' }],
    });
    const result = await runRotation(sb);
    expect(result.feedbackIds).toHaveLength(2); // 1 delta + 1 sample candidate
    expect(sb.insertedFeedback).toHaveLength(2);
  });

  it('emits zero feedback items when there is no delta and no covered rows to sample', async () => {
    const sb = fakeSupabase({ coverageMatrixRows: [], coveredRows: [] });
    const result = await runRotation(sb);
    expect(result.feedbackIds).toHaveLength(0);
  });
});
