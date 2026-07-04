/**
 * SD-LEO-INFRA-SHIP-WITNESS-COVERAGE-001 FR-2, TS-8/TS-9.
 */
import { describe, it, expect } from 'vitest';
import { runRetroactiveBatch } from '../../../scripts/ship-witness-retroactive-batch.mjs';
import { writeMergeWitnessTelemetry } from '../../../lib/ship/merge-witness-telemetry.mjs';
import { computeAdoptionReadiness } from '../../../lib/ship/witness-adoption.mjs';

const silentLogger = { warn: () => {} };
const PR_LIST = [
  { repo: 'rickfelix/EHG_Engineer', pr: 4001 },
  { repo: 'rickfelix/EHG_Engineer', pr: 4002 },
];

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

/** A realistic fake `evaluate` that routes through the SAME idempotent writer as the real CLI. */
function makeFakeEvaluate(supabase) {
  return async ({ repo, pr, workKey }) => {
    const verdict = { overall: 'observe-only', prNumber: pr, workKey, tier: 'standard', rungs: [] };
    const written = await writeMergeWitnessTelemetry(supabase, verdict, { repo, lane: 'ship-witness-retroactive-cli', logger: silentLogger });
    return { prNumber: pr, repo, workKey, telemetryWritten: written.ok };
  };
}

describe('runRetroactiveBatch (FR-2)', () => {
  it('processes every PR in the list, deriving a work-key per item', async () => {
    const supabase = makeFakeTable();
    const fetchShape = (pr) => ({ branchName: pr === 4001 ? 'feat/SD-OLD-001-slug' : 'feat/no-key-here', title: null });

    const summary = await runRetroactiveBatch(PR_LIST, { supabase, fetchShape, evaluate: makeFakeEvaluate(supabase), logger: silentLogger });

    expect(summary).toMatchObject({ attempted: 2, succeeded: 2, failed: 0 });
    expect(summary.results[0].workKey).toBe('SD-OLD-001');
    expect(summary.results[1].workKey).toBeNull();
  });

  it('TS-8: re-running the batch over the SAME PR list writes zero additional rows', async () => {
    const supabase = makeFakeTable();
    const fetchShape = () => ({ branchName: 'feat/SD-OLD-001-slug', title: null });
    const evaluate = makeFakeEvaluate(supabase);

    await runRetroactiveBatch(PR_LIST, { supabase, fetchShape, evaluate, logger: silentLogger });
    const rowsAfterFirstRun = supabase.rows.length;
    await runRetroactiveBatch(PR_LIST, { supabase, fetchShape, evaluate, logger: silentLogger });

    expect(rowsAfterFirstRun).toBe(2);
    expect(supabase.rows).toHaveLength(2); // unchanged after the second run
  });

  it('a per-item failure is isolated -- other items in the same batch still succeed', async () => {
    const supabase = makeFakeTable();
    let calls = 0;
    const evaluate = async (args) => {
      calls++;
      if (calls === 1) throw new Error('gh api rate limited');
      return makeFakeEvaluate(supabase)(args);
    };
    const summary = await runRetroactiveBatch(PR_LIST, { supabase, fetchShape: () => ({ branchName: null, title: null }), evaluate, logger: silentLogger });

    expect(summary).toMatchObject({ attempted: 2, succeeded: 1, failed: 1 });
  });

  it('handles an empty/undefined PR list defensively', async () => {
    const supabase = makeFakeTable();
    expect(await runRetroactiveBatch([], { supabase, logger: silentLogger })).toMatchObject({ attempted: 0, succeeded: 0, failed: 0 });
    expect(await runRetroactiveBatch(undefined, { supabase, logger: silentLogger })).toMatchObject({ attempted: 0, succeeded: 0, failed: 0 });
  });
});

describe('TS-9: a backfilled pre-cutover PR never affects the readiness streak', () => {
  it('computeAdoptionReadiness is unchanged whether or not a pre-cutover PR carries a backfilled telemetry row', () => {
    // Mirrors reality: defaultFetchMergedPlatformPRs filters to mergedAt >= WITNESS_CUTOVER_ISO
    // BEFORE computeAdoptionReadiness ever sees the merges list -- a pre-cutover PR is simply
    // never present in `merges`, regardless of whether a retroactive telemetry row exists for it.
    const postCutoverMerges = [
      { repo: 'rickfelix/ehg_engineer', prNumber: 9001, mergedAt: '2026-07-04T01:00:00Z' },
    ];
    const withoutBackfill = computeAdoptionReadiness({ merges: postCutoverMerges, telemetryRows: [
      { repo: 'rickfelix/ehg_engineer', pr_number: 9001 },
    ], today: '2026-07-04' });

    const withPreCutoverBackfill = computeAdoptionReadiness({ merges: postCutoverMerges, telemetryRows: [
      { repo: 'rickfelix/ehg_engineer', pr_number: 9001 },
      { repo: 'rickfelix/ehg_engineer', pr_number: 1234 }, // a pre-cutover PR, now backfilled — NOT in `merges`
    ], today: '2026-07-04' });

    expect(withPreCutoverBackfill.consecutiveDays).toBe(withoutBackfill.consecutiveDays);
    expect(withPreCutoverBackfill.ready).toBe(withoutBackfill.ready);
    expect(withPreCutoverBackfill.dailyBreakdown).toEqual(withoutBackfill.dailyBreakdown);
  });
});
