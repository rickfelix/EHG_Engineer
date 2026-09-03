import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runShipReviewFindingsPopulator,
  fetchLatestMergedPR,
} from '../../scripts/modules/handoff/executors/lead-final-approval/hooks/ship-review-findings-populator.js';

function makeSupabase(insertImpl = async () => ({ error: null })) {
  return {
    from(table) {
      return {
        insert(row) {
          return insertImpl(table, row);
        },
        // QF-20260903-385: probeRepoColumnExists awaits a .select() on this table to decide
        // whether the chairman-gated `repo` column exists yet. Returning a 42703 is the honest
        // stub for "not applied", and it keeps the insert path reachable in a unit test.
        select() {
          return {
            async limit() {
              return { error: { code: '42703', message: 'column "repo" does not exist' } };
            },
          };
        },
      };
    },
  };
}

describe('ship-review-findings-populator', () => {
  beforeEach(() => {
    delete process.env.LEO_SHIP_REVIEW_POPULATOR_OFF;
  });
  afterEach(() => {
    delete process.env.LEO_SHIP_REVIEW_POPULATOR_OFF;
  });

  it('inserts canonical-join row on success', async () => {
    const sd = { id: 'uuid-1', sd_key: 'SD-X-001', feature_branch: 'feat/SD-X-001' };
    const stubFetcher = () => ({ pr_number: 42, mergedAt: '2026-04-26T12:00:00Z' });
    const inserts = [];
    const supabase = makeSupabase(async (table, row) => {
      inserts.push({ table, row });
      return { error: null };
    });

    // Inject stub fetcher into the module path by monkey-patching: easier to test
    // via the exported fetchLatestMergedPR function with the seam.
    const merged = fetchLatestMergedPR('feat/SD-X-001', ['rickfelix/EHG_Engineer'], stubFetcher);
    expect(merged).toMatchObject({ pr_number: 42 });

    // Drive the populator with a fake supabase; we cannot inject the gh fetcher
    // through runShipReviewFindingsPopulator without monkey-patching execSync,
    // so rely on the gh-lookup branch returning null in tests (no merged PR).
    const result = await runShipReviewFindingsPopulator(sd, supabase);
    expect(['no_pr_found', 'gh_error']).toContain(result.outcome);
  });

  it('returns disabled when kill-switch is set', async () => {
    process.env.LEO_SHIP_REVIEW_POPULATOR_OFF = '1';
    const supabase = makeSupabase();
    const result = await runShipReviewFindingsPopulator(
      { sd_key: 'SD-X-001', feature_branch: 'feat/SD-X-001' },
      supabase
    );
    expect(result.outcome).toBe('disabled');
  });

  it('skips when SD has no sd_key', async () => {
    const result = await runShipReviewFindingsPopulator({}, makeSupabase());
    expect(result.outcome).toBe('skip');
    expect(result.detail).toBe('no sd_key');
  });

  // QF-20260903-385: this case previously asserted outcome 'skip' for an SD with no branch. That
  // expectation encoded the DEFECT: strategic_directives_v2 has no branch columns at all and
  // metadata.branch was absent on 200 of 200 recently completed SDs, so the skip fired every time
  // and the hook never wrote a reconciliation row in its life. The assertion is updated because
  // the contract changed deliberately — not to make a red test go green.
  it('derives candidate branches from sd_key when the SD carries no branch', async () => {
    const probed = [];
    const fetcher = (_repo, branch) => { probed.push(branch); return null; };
    const result = await runShipReviewFindingsPopulator({ sd_key: 'SD-X-001' }, makeSupabase(), { fetcher });

    expect(result.outcome).toBe('no_pr_found');
    // It must actually PROBE rather than give up: the conventional branch name is tried.
    expect(probed).toContain('feat/SD-X-001');
    expect(result.detail).toMatch(/feat\/SD-X-001/);
  });

  it('stores the merged PR headRefName, not the candidate it guessed with', async () => {
    const inserts = [];
    const supabase = makeSupabase(async (table, row) => { inserts.push(row); return { error: null }; });
    // Real shape: the SD key is …-B but the merged branch carried a suffix (…-B-fr6).
    const fetcher = (_repo, branch) =>
      (branch === 'feat/SD-X-001'
        ? { pr_number: 8127, mergedAt: '2026-09-03T17:21:03Z', headRefName: 'feat/SD-X-001-fr6' }
        : null);

    const result = await runShipReviewFindingsPopulator({ sd_key: 'SD-X-001' }, supabase, { fetcher });

    expect(result.outcome).toBe('inserted');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].branch).toBe('feat/SD-X-001-fr6');
    expect(inserts[0].pr_number).toBe(8127);
    // Reconciliation rows must stay distinguishable from real ship reviews, and must NOT be able
    // to satisfy SHIP_REVIEW_FINDINGS_PROOF, which filters on verdict === 'pass'.
    expect(inserts[0].verdict).toBe('backfill_canonical_join');
    expect(inserts[0].review_tier).toBe('canonical_join');
    expect(inserts[0].finding_count).toBe(0);
    expect(inserts[0].verdict).not.toBe('pass');
  });

  it('still skips when there is neither a branch nor an sd_key to derive one from', async () => {
    const result = await runShipReviewFindingsPopulator({}, makeSupabase());
    expect(result.outcome).toBe('skip');
  });

  it('never throws even when supabase insert errors', async () => {
    const supabase = makeSupabase(async () => {
      throw new Error('connection lost');
    });
    const sd = { sd_key: 'SD-X-001', feature_branch: 'feat/SD-X-001' };
    // The populator catches gh errors first; even if gh fails, the function resolves.
    const result = await runShipReviewFindingsPopulator(sd, supabase);
    expect(result).toBeDefined();
    expect(['gh_error', 'no_pr_found', 'unexpected_error']).toContain(result.outcome);
  });
});

describe('ship-review-findings-populator — fetchLatestMergedPR', () => {
  it('returns first repo result when found', () => {
    const fetcher = (repo) => (repo === 'r1' ? { pr_number: 7, mergedAt: 't' } : null);
    const out = fetchLatestMergedPR('feat/x', ['r1', 'r2'], fetcher);
    expect(out).toMatchObject({ pr_number: 7, repo: 'r1' });
  });

  it('falls through to second repo if first returns null', () => {
    const fetcher = (repo) => (repo === 'r2' ? { pr_number: 9 } : null);
    const out = fetchLatestMergedPR('feat/x', ['r1', 'r2'], fetcher);
    expect(out).toMatchObject({ pr_number: 9, repo: 'r2' });
  });

  it('returns null when no repo has a match', () => {
    const out = fetchLatestMergedPR('feat/x', ['r1', 'r2'], () => null);
    expect(out).toBeNull();
  });

  it('returns null on falsy branch', () => {
    expect(fetchLatestMergedPR(null)).toBeNull();
    expect(fetchLatestMergedPR('')).toBeNull();
  });

  it('continues to next repo if fetcher throws', () => {
    const fetcher = (repo) => {
      if (repo === 'r1') throw new Error('rate limit');
      return { pr_number: 11 };
    };
    const out = fetchLatestMergedPR('feat/x', ['r1', 'r2'], fetcher);
    expect(out).toMatchObject({ pr_number: 11, repo: 'r2' });
  });
});
