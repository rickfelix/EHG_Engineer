/**
 * SD-LEO-INFRA-SHIP-WITNESS-MERGEWORK-001 FR-4
 * TS-4: a telemetry write failure never alters attemptAutoMerge()'s outcome.
 * Also proves the happy path DOES persist a telemetry row when a supabase
 * client is supplied, with the expected shape.
 */
import { describe, it, expect, vi } from 'vitest';
import { attemptAutoMerge } from '../../../lib/ship/auto-merge.mjs';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

function makeRunner(responses) {
  const runner = (args) => {
    for (const { match, result } of responses) {
      if (match(args)) return { code: 0, stdout: '', stderr: '', ...result };
    }
    return { code: 1, stdout: '', stderr: 'unmatched gh call' };
  };
  return runner;
}

const argvMatchers = {
  prViewIsDraft: (args) => args[0] === 'pr' && args[1] === 'view' && args.includes('isDraft'),
  prViewMergedAt: (args) => args[0] === 'pr' && args[1] === 'view' && args.includes('mergedAt'),
  prViewState: (args) => args[0] === 'pr' && args[1] === 'view' && args.includes('state'),
  apiProtection: (args) => args[0] === 'api' && args[1]?.includes('/protection'),
  prMerge: (args) => args[0] === 'pr' && args[1] === 'merge',
};

function makeHappyPathRunner() {
  return makeRunner([
    { match: argvMatchers.prViewIsDraft, result: { stdout: 'false\n' } },
    { match: argvMatchers.apiProtection, result: { stdout: 'false\n' } },
    { match: argvMatchers.prMerge, result: { stdout: '' } },
    { match: argvMatchers.prViewMergedAt, result: { stdout: '2026-07-03T00:00:00Z\n' } },
    { match: argvMatchers.prViewState, result: { stdout: 'MERGED\n' } },
  ]);
}

function makeThrowingSupabase() {
  return {
    from: () => ({
      insert: async () => { throw new Error('connection reset'); },
    }),
  };
}

function makeRecordingSupabase() {
  const inserts = [];
  return {
    inserts,
    from: (table) => ({
      insert: async (row) => { inserts.push({ table, row }); return { error: null }; },
    }),
  };
}

describe('attemptAutoMerge — mergeWork() ladder shadow-mode integration (FR-4)', () => {
  it('TS-4: a telemetry write that throws does not alter the merge result', async () => {
    const runner = makeHappyPathRunner();
    const r = await attemptAutoMerge({
      prNumber: 99,
      repoOwner: 'rickfelix',
      repoName: 'EHG_Engineer',
      runner,
      logger: silentLogger,
      witnessSupabase: makeThrowingSupabase(),
    });
    expect(r).toEqual({ ok: true, action: 'merged', adminUsed: false });
  });

  it('happy path persists exactly one telemetry row with the expected shape', async () => {
    const runner = makeHappyPathRunner();
    const supabase = makeRecordingSupabase();
    const r = await attemptAutoMerge({
      prNumber: 100,
      repoOwner: 'rickfelix',
      repoName: 'EHG_Engineer',
      runner,
      logger: silentLogger,
      workKey: 'SD-TEST-001',
      tier: 'standard',
      witnessSupabase: supabase,
    });

    expect(r.ok).toBe(true);
    expect(supabase.inserts).toHaveLength(1);
    expect(supabase.inserts[0].table).toBe('merge_witness_telemetry');
    const row = supabase.inserts[0].row;
    expect(row.pr_number).toBe(100);
    expect(row.repo).toBe('rickfelix/EHG_Engineer');
    expect(row.work_key).toBe('SD-TEST-001');
    expect(row.lane).toBe('ship-auto-merge');
    expect(row.via_mergework).toBe(true);
    expect(row.overall).toBe('observe-only');
    expect(row.rungs).toHaveLength(5);
  });

  it('a telemetry insert() DB error (not a throw) also does not alter the merge result', async () => {
    const runner = makeHappyPathRunner();
    const erroringSupabase = {
      from: () => ({ insert: async () => ({ error: { message: 'unique violation' } }) }),
    };
    const r = await attemptAutoMerge({
      prNumber: 101,
      repoOwner: 'rickfelix',
      repoName: 'EHG_Engineer',
      runner,
      logger: silentLogger,
      witnessSupabase: erroringSupabase,
    });
    expect(r).toEqual({ ok: true, action: 'merged', adminUsed: false });
  });
});
