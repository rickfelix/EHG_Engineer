/**
 * SD-LEO-INFRA-SHIP-WITNESS-COVERAGE-001 FR-1, TS-4/TS-5/TS-6.
 */
import { describe, it, expect } from 'vitest';
import { reconcileUnwitnessedMerges, RECONCILE_LANE } from '../../../scripts/ship-witness-reconcile.mjs';

const silentLogger = { warn: () => {} };

/** In-memory fake matching the real supabase shape used by writeMergeWitnessTelemetry. */
function makeFakeTable() {
  const rows = [];
  let nextId = 1;
  return {
    rows,
    from: () => ({
      select: () => {
        const filters = {};
        const builder = {
          eq: (col, val) => { filters[col] = val; return builder; },
          limit: async () => ({
            data: rows.filter((r) => r.repo === filters.repo && r.pr_number === filters.pr_number && r.lane === filters.lane).map((r) => ({ id: r.id })),
            error: null,
          }),
        };
        return builder;
      },
      insert: async (row) => { rows.push({ id: nextId++, ...row }); return { error: null }; },
    }),
  };
}

const GAP = { repo: 'rickfelix/EHG_Engineer', prNumber: 5517, mergedAt: '2026-07-04T10:04:20Z' };

describe('reconcileUnwitnessedMerges (FR-1)', () => {
  it('TS-4: backfills a gap merge with a derivable work-key (from branch)', async () => {
    const supabase = makeFakeTable();
    const fetchShape = () => ({ branchName: 'qf/QF-20260703-999', title: 'fix(QF-20260703-999): sentinel dep' });

    const summary = await reconcileUnwitnessedMerges([GAP], { supabase, fetchShape, logger: silentLogger });

    expect(summary).toEqual({ attempted: 1, written: 1, skipped: 0, failed: 0 });
    expect(supabase.rows).toHaveLength(1);
    expect(supabase.rows[0]).toMatchObject({ repo: GAP.repo, pr_number: GAP.prNumber, lane: RECONCILE_LANE, work_key: 'QF-20260703-999' });
  });

  it('TS-5: backfills a gap merge with NO derivable work-key — writes work_key=null, never fabricated', async () => {
    const supabase = makeFakeTable();
    const fetchShape = () => ({ branchName: 'feat/unrelated-cleanup', title: 'Clean up unused imports' });

    const summary = await reconcileUnwitnessedMerges([GAP], { supabase, fetchShape, logger: silentLogger });

    expect(summary).toEqual({ attempted: 1, written: 1, skipped: 0, failed: 0 });
    expect(supabase.rows[0].work_key).toBeNull();
  });

  it('TS-6: running the sweep twice over the same gap does not duplicate — second call is a no-op', async () => {
    const supabase = makeFakeTable();
    const fetchShape = () => ({ branchName: 'qf/QF-20260703-999', title: null });

    const first = await reconcileUnwitnessedMerges([GAP], { supabase, fetchShape, logger: silentLogger });
    const second = await reconcileUnwitnessedMerges([GAP], { supabase, fetchShape, logger: silentLogger });

    expect(first).toEqual({ attempted: 1, written: 1, skipped: 0, failed: 0 });
    expect(second).toEqual({ attempted: 1, written: 0, skipped: 1, failed: 0 });
    expect(supabase.rows).toHaveLength(1);
  });

  it('a per-item failure (fetchShape throws) is isolated -- other items in the same batch still succeed', async () => {
    const supabase = makeFakeTable();
    const gap2 = { repo: 'rickfelix/EHG_Engineer', prNumber: 5518, mergedAt: '2026-07-04T10:15:10Z' };
    let calls = 0;
    const fetchShape = () => {
      calls++;
      if (calls === 1) throw new Error('gh pr view timeout');
      return { branchName: null, title: null };
    };

    const summary = await reconcileUnwitnessedMerges([GAP, gap2], { supabase, fetchShape, logger: silentLogger });

    expect(summary).toEqual({ attempted: 2, written: 1, skipped: 0, failed: 1 });
    expect(supabase.rows).toHaveLength(1);
    expect(supabase.rows[0].pr_number).toBe(gap2.prNumber);
  });

  it('handles an empty/undefined unwitnessed list defensively', async () => {
    const supabase = makeFakeTable();
    expect(await reconcileUnwitnessedMerges([], { supabase, logger: silentLogger })).toEqual({ attempted: 0, written: 0, skipped: 0, failed: 0 });
    expect(await reconcileUnwitnessedMerges(undefined, { supabase, logger: silentLogger })).toEqual({ attempted: 0, written: 0, skipped: 0, failed: 0 });
  });
});

describe('DETECT direction (TS-7): the gap detector itself is unmodified by the sweep\'s existence', () => {
  it('detectUnwitnessedMerges still reports a gap that has not yet been reconciled', async () => {
    const { detectUnwitnessedMerges } = await import('../../../lib/ship/witness-adoption.mjs');
    // Simulates the pre-sweep state this SD's Baseline Observation captured live: a real merge,
    // zero merge_witness_telemetry rows for it yet.
    const result = detectUnwitnessedMerges([{ repo: GAP.repo.toLowerCase(), prNumber: GAP.prNumber, mergedAt: GAP.mergedAt }], []);
    expect(result.count).toBe(1);
    expect(result.unwitnessed).toHaveLength(1);
  });
});
