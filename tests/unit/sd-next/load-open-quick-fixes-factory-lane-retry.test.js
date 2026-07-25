/**
 * QF-20260724-598 — loadOpenQuickFixes selects quick_fixes.factory_lane, a
 * staged-not-yet-applied column (database/migrations/20260713_quick_fixes_factory_lane.sql).
 * A missing column fails the WHOLE multi-column select (Postgres 42703, data:null), not per-row,
 * so the loader hit its `if (error) return []` arm on every run — sd:next displayed ZERO open
 * QFs fleet-wide (Track C display AND the AUTO_PROCEED_ACTION:qf_start recommendation path both
 * went dark) while 50+ open rows sat in quick_fixes, leading idle workers to conclude the belt
 * was empty.
 *
 * This is the twin of QF-20260720-763, which fixed the identical outage in
 * scripts/worker-checkin.cjs selfClaimQuickFix(); data-loaders.js was never given the same
 * fallback. The fix retries the same query without factory_lane on exactly error.code==='42703'.
 */
import { describe, it, expect } from 'vitest';
import { loadOpenQuickFixes } from '../../../scripts/modules/sd-next/data-loaders.js';

const OPEN_QF = {
  id: 'QF-20260724-001',
  title: 'A real open quick fix',
  type: 'bug',
  severity: 'medium',
  status: 'open',
  estimated_loc: 10,
  description: 'plain open work',
  created_at: '2026-07-24T00:00:00Z',
  target_application: 'EHG_Engineer',
  claiming_session_id: null,
  pr_url: null,
  commit_sha: null,
  not_before: null,
  owner: null,
  release_condition: null,
};

/**
 * Fake supabase whose quick_fixes select fails with 42703 whenever factory_lane is requested,
 * mirroring the live PostgREST behavior against the unapplied column.
 */
function makeFakeSupabase({ onSelect, retryRows = [], failOnFactoryLane = true } = {}) {
  return {
    from(table) {
      let selectedCols = '';
      const builder = {
        select(cols) {
          selectedCols = cols || '';
          onSelect?.(selectedCols);
          return builder;
        },
        in() { return builder; },
        is() { return builder; },
        order() { return builder; },
        limit() {
          if (table !== 'quick_fixes') return Promise.resolve({ data: [], error: null });
          if (failOnFactoryLane && selectedCols.includes('factory_lane')) {
            return Promise.resolve({
              data: null,
              error: { code: '42703', message: 'column quick_fixes.factory_lane does not exist' },
            });
          }
          return Promise.resolve({ data: retryRows, error: null });
        },
      };
      return builder;
    },
  };
}

describe('loadOpenQuickFixes — retries without factory_lane on 42703', () => {
  it('retries without the missing column instead of reporting an empty queue', async () => {
    const selects = [];
    const supabase = makeFakeSupabase({
      onSelect: (cols) => selects.push(cols),
      retryRows: [OPEN_QF],
    });

    const result = await loadOpenQuickFixes(supabase);

    expect(selects.length).toBe(2);
    expect(selects[0]).toContain('factory_lane');
    expect(selects[1]).not.toContain('factory_lane');
    // The regression: pre-fix this was [] and sd:next showed no open QFs at all.
    expect(result.map((q) => q.id)).toEqual(['QF-20260724-001']);
  });

  it('does not issue a second query when the first attempt succeeds', async () => {
    const selects = [];
    const supabase = makeFakeSupabase({
      onSelect: (cols) => selects.push(cols),
      retryRows: [OPEN_QF],
      failOnFactoryLane: false,
    });

    await loadOpenQuickFixes(supabase);

    expect(selects.length).toBe(1);
    expect(selects[0]).toContain('factory_lane');
  });

  it('still returns [] for a non-42703 error rather than retrying', async () => {
    const selects = [];
    const supabase = {
      from() {
        const builder = {
          select(cols) { selects.push(cols); return builder; },
          in() { return builder; },
          is() { return builder; },
          order() { return builder; },
          limit() {
            return Promise.resolve({
              data: null,
              error: { code: '42P01', message: 'relation "quick_fixes" does not exist' },
            });
          },
        };
        return builder;
      },
    };

    const result = await loadOpenQuickFixes(supabase);

    expect(selects.length).toBe(1);
    expect(result).toEqual([]);
  });

  it('keeps the chairman-gated / fixture exclusions applied to the retried rows', async () => {
    const supabase = makeFakeSupabase({
      retryRows: [
        OPEN_QF,
        { ...OPEN_QF, id: 'QF-CHAIRMAN', owner: 'chairman', release_condition: 'chairman approves the DDL' },
      ],
    });

    const result = await loadOpenQuickFixes(supabase);

    // The retry must not become a back door around the exclusion predicates.
    expect(result.map((q) => q.id)).toEqual(['QF-20260724-001']);
  });
});
