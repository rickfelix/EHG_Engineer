/**
 * Tests for sd-next quick_fixes loaders.
 *
 * - loadOpenQuickFixes (QF-20260423-380): pre-merge race filter (pr_url IS null)
 * - loadReadyToMergeQuickFixes (SD-LEO-INFRA-LIFECYCLE-RECONCILIATION-ORPHAN-001 FR2):
 *   cross-check PR state, surface ready_to_merge, cache deduplication
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadOpenQuickFixes,
  loadReadyToMergeQuickFixes,
  __resetPrStateCacheForTests,
} from '../../../scripts/modules/sd-next/data-loaders.js';

function makeSupabase(queryResult) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(queryResult),
  };
  return { from: vi.fn().mockReturnValue(builder), _builder: builder };
}

describe('loadOpenQuickFixes — merge race safety', () => {
  it('applies .is(pr_url, null) and .is(commit_sha, null) filters', async () => {
    const supabase = makeSupabase({ data: [], error: null });
    await loadOpenQuickFixes(supabase);
    expect(supabase._builder.is).toHaveBeenCalledWith('pr_url', null);
    expect(supabase._builder.is).toHaveBeenCalledWith('commit_sha', null);
  });

  it('still filters status IN (open, in_progress)', async () => {
    const supabase = makeSupabase({ data: [], error: null });
    await loadOpenQuickFixes(supabase);
    expect(supabase._builder.in).toHaveBeenCalledWith('status', ['open', 'in_progress']);
  });

  it('returns rows when loader gets data', async () => {
    const rows = [{ id: 'QF-TEST-001', status: 'open', pr_url: null, commit_sha: null }];
    const supabase = makeSupabase({ data: rows, error: null });
    const result = await loadOpenQuickFixes(supabase);
    expect(result).toEqual(rows);
  });

  it('returns [] on query error without throwing', async () => {
    const supabase = makeSupabase({ data: null, error: { message: 'db down' } });
    const result = await loadOpenQuickFixes(supabase);
    expect(result).toEqual([]);
  });

  it('returns [] when supabase.from throws', async () => {
    const supabase = { from: vi.fn(() => { throw new Error('boom'); }) };
    const result = await loadOpenQuickFixes(supabase);
    expect(result).toEqual([]);
  });
});

describe('loadReadyToMergeQuickFixes — PR-state cross-check', () => {
  beforeEach(() => __resetPrStateCacheForTests());

  const rowOpenGreen = {
    id: 'QF-READY-001', status: 'open',
    pr_url: 'https://github.com/rickfelix/EHG_Engineer/pull/9001',
    commit_sha: null, title: 't1', type: 'bug', severity: 'medium',
    estimated_loc: 10, description: 'd', created_at: '', target_application: 'EHG_Engineer',
    claiming_session_id: null,
  };
  const rowMerged = { ...rowOpenGreen, id: 'QF-MERGED-001', pr_url: 'https://github.com/rickfelix/EHG_Engineer/pull/9002' };
  const rowOpenFailing = { ...rowOpenGreen, id: 'QF-FAIL-001', pr_url: 'https://github.com/rickfelix/EHG_Engineer/pull/9003' };

  function makeExec(responses) {
    return vi.fn((cmd) => {
      const match = cmd.match(/gh pr view (\d+)/);
      if (!match) throw new Error('unexpected cmd: ' + cmd);
      const pr = Number(match[1]);
      if (!(pr in responses)) throw new Error('no response for PR #' + pr);
      if (responses[pr] === 'THROW') throw new Error('gh boom');
      return JSON.stringify(responses[pr]);
    });
  }

  it('includes OPEN+green PRs tagged ready_to_merge, omits MERGED and failing', async () => {
    const supabase = makeSupabase({ data: [rowOpenGreen, rowMerged, rowOpenFailing], error: null });
    const exec = makeExec({
      9001: { state: 'OPEN', statusCheckRollup: [{ conclusion: 'SUCCESS' }], mergeCommit: null },
      9002: { state: 'MERGED', statusCheckRollup: [], mergeCommit: { oid: 'abc123' } },
      9003: { state: 'OPEN', statusCheckRollup: [{ conclusion: 'FAILURE' }], mergeCommit: null },
    });
    const result = await loadReadyToMergeQuickFixes(supabase, { execSync: exec });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('QF-READY-001');
    expect(result[0].ready_to_merge).toBe(true);
    expect(result[0].pr_number).toBe(9001);
  });

  it('queries with .not(pr_url, is, null) — the inverse of loadOpenQuickFixes', async () => {
    const supabase = makeSupabase({ data: [], error: null });
    await loadReadyToMergeQuickFixes(supabase, { execSync: vi.fn() });
    expect(supabase._builder.not).toHaveBeenCalledWith('pr_url', 'is', null);
  });

  it('deduplicates gh calls within a single invocation via in-memory cache', async () => {
    // Two rows share the same pr_url → only 1 gh call expected
    const dupRow = { ...rowOpenGreen, id: 'QF-READY-002' };
    const supabase = makeSupabase({ data: [rowOpenGreen, dupRow], error: null });
    const exec = makeExec({
      9001: { state: 'OPEN', statusCheckRollup: [{ conclusion: 'SUCCESS' }], mergeCommit: null },
    });
    const result = await loadReadyToMergeQuickFixes(supabase, { execSync: exec });
    expect(exec).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(2);
  });

  it('skips rows where gh CLI throws (degraded mode)', async () => {
    const supabase = makeSupabase({ data: [rowOpenGreen], error: null });
    const exec = makeExec({ 9001: 'THROW' });
    const result = await loadReadyToMergeQuickFixes(supabase, { execSync: exec });
    expect(result).toEqual([]);
  });

  it('returns [] on query error', async () => {
    const supabase = makeSupabase({ data: null, error: { message: 'db down' } });
    const result = await loadReadyToMergeQuickFixes(supabase, { execSync: vi.fn() });
    expect(result).toEqual([]);
  });

  it('returns [] when data is empty (no gh calls)', async () => {
    const supabase = makeSupabase({ data: [], error: null });
    const exec = vi.fn();
    const result = await loadReadyToMergeQuickFixes(supabase, { execSync: exec });
    expect(result).toEqual([]);
    expect(exec).not.toHaveBeenCalled();
  });

  it('skips rows with malformed pr_url (cannot parse number)', async () => {
    const badRow = { ...rowOpenGreen, pr_url: 'not-a-pr-url' };
    const supabase = makeSupabase({ data: [badRow], error: null });
    const exec = vi.fn();
    const result = await loadReadyToMergeQuickFixes(supabase, { execSync: exec });
    expect(result).toEqual([]);
    expect(exec).not.toHaveBeenCalled();
  });
});
