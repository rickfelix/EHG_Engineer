/**
 * SD-FDBK-FIX-WITNESS-LOOKUP-MATCHES-001 (FR-3): bounded retroactive audit.
 */
import { describe, it, expect, vi } from 'vitest';

const H = vi.hoisted(() => ({ execFileSyncMock: vi.fn() }));
vi.mock('node:child_process', () => ({ execFileSync: H.execFileSyncMock }));

const { runAudit } = await import('../../../scripts/audit-borrowed-witness-rows.mjs');

function makeSupabase({ applications, findings }) {
  return {
    from: (table) => {
      if (table === 'applications') {
        return { select: () => ({ eq: () => ({ not: () => Promise.resolve({ data: applications, error: null }) }) }) };
      }
      if (table === 'ship_review_findings') {
        // FR-6 batch 9 (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001): the read now paginates via
        // fetchAllPaginated, which calls .order() (chainable) then .range() (terminal) instead of
        // awaiting .select() directly — extend the chain, same resolved { data, error } shape.
        const chain = { order: () => chain, range: () => Promise.resolve({ data: findings, error: null }) };
        return { select: () => chain };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe('runAudit', () => {
  it('finds zero candidates when every merged PR has its own branch-matching row', async () => {
    H.execFileSyncMock.mockReturnValue(JSON.stringify([{ number: 9, headRefName: 'feat/apex-D1' }]));
    const supabase = makeSupabase({
      applications: [{ github_repo: 'rickfelix/apexniche-ai' }],
      findings: [{ pr_number: 9, branch: 'feat/apex-D1', verdict: 'pass', sd_key: 'SD-A', created_at: '2026-07-01' }],
    });
    const report = await runAudit({ supabase });
    expect(report.borrowedRowCandidates).toEqual([]);
    expect(report.checkedPRs).toBe(1);
  });

  it('flags a borrowed-row candidate: merged PR has no own-branch row but pr_number matches another branch pass row', async () => {
    H.execFileSyncMock.mockImplementation((cmd, args) => {
      const repo = args[args.indexOf('-R') + 1];
      if (repo === 'rickfelix/apexniche-ai') return JSON.stringify([{ number: 9, headRefName: 'feat/apex-D1' }]);
      return JSON.stringify([]);
    });
    const supabase = makeSupabase({
      applications: [{ github_repo: 'rickfelix/apexniche-ai' }, { github_repo: 'rickfelix/marketlens' }],
      findings: [{ pr_number: 9, branch: 'feat/ml-I1', verdict: 'pass', sd_key: 'SD-MARKETLENS-I1', created_at: '2026-07-03' }],
    });
    const report = await runAudit({ supabase });
    expect(report.borrowedRowCandidates).toHaveLength(1);
    expect(report.borrowedRowCandidates[0]).toMatchObject({
      repo: 'rickfelix/apexniche-ai', prNumber: 9, ownBranch: 'feat/apex-D1', hasOwnRow: false,
      donorBranch: 'feat/ml-I1', donorSdKey: 'SD-MARKETLENS-I1',
    });
  });

  it('does NOT flag a merged PR with no own row when no donor (pass) row exists either', async () => {
    H.execFileSyncMock.mockReturnValue(JSON.stringify([{ number: 42, headRefName: 'feat/unreviewed' }]));
    const supabase = makeSupabase({ applications: [{ github_repo: 'rickfelix/apexniche-ai' }], findings: [] });
    const report = await runAudit({ supabase });
    expect(report.borrowedRowCandidates).toEqual([]);
  });

  it('skips (not crashes) a repo whose gh pr list call fails', async () => {
    H.execFileSyncMock.mockImplementation(() => { throw new Error('gh auth error'); });
    const supabase = makeSupabase({ applications: [{ github_repo: 'rickfelix/apexniche-ai' }], findings: [] });
    const report = await runAudit({ supabase });
    expect(report.skippedRepos).toEqual(['rickfelix/apexniche-ai']);
    expect(report.checkedPRs).toBe(0);
  });

  it('flags a borrowed-row candidate EVEN WHEN the PR has its own row, if a NEWER cross-branch pass row exists (replicates pre-fix most-recent-wins query)', async () => {
    H.execFileSyncMock.mockReturnValue(JSON.stringify([{ number: 9, headRefName: 'feat/apex-D1' }]));
    const supabase = makeSupabase({
      applications: [{ github_repo: 'rickfelix/apexniche-ai' }],
      findings: [
        { pr_number: 9, branch: 'feat/apex-D1', verdict: 'block', sd_key: 'SD-APEX-D1', created_at: '2026-07-01T00:00:00Z' },
        { pr_number: 9, branch: 'feat/ml-I1', verdict: 'pass', sd_key: 'SD-MARKETLENS-I1', created_at: '2026-07-03T00:00:00Z' },
      ],
    });
    const report = await runAudit({ supabase });
    expect(report.borrowedRowCandidates).toHaveLength(1);
    expect(report.borrowedRowCandidates[0]).toMatchObject({
      prNumber: 9, ownBranch: 'feat/apex-D1', hasOwnRow: true, ownVerdict: 'block',
      donorBranch: 'feat/ml-I1', donorSdKey: 'SD-MARKETLENS-I1',
    });
  });

  it('does NOT flag when the own-branch row IS the most recent row, even if older cross-branch pass rows exist', async () => {
    H.execFileSyncMock.mockReturnValue(JSON.stringify([{ number: 9, headRefName: 'feat/apex-D1' }]));
    const supabase = makeSupabase({
      applications: [{ github_repo: 'rickfelix/apexniche-ai' }],
      findings: [
        { pr_number: 9, branch: 'feat/ml-I1', verdict: 'pass', sd_key: 'SD-MARKETLENS-I1', created_at: '2026-07-01T00:00:00Z' },
        { pr_number: 9, branch: 'feat/apex-D1', verdict: 'pass', sd_key: 'SD-APEX-D1', created_at: '2026-07-03T00:00:00Z' },
      ],
    });
    const report = await runAudit({ supabase });
    expect(report.borrowedRowCandidates).toEqual([]);
  });

  it('QF-20260713-691: reports a chronologically-impossible donor (created AFTER the PR merged) as a filtered false alarm, not a live candidate', async () => {
    // A donor row cannot have been returned by the (real or hypothetical) pre-fix query at the
    // moment of merge if it did not exist yet -- this was the dominant false-alarm class found
    // when manually investigating "real-world impact" (14 of 17 raw candidates in one pass).
    H.execFileSyncMock.mockReturnValue(JSON.stringify([{ number: 9, headRefName: 'feat/apex-D1', mergedAt: '2026-07-03T00:00:00Z' }]));
    const supabase = makeSupabase({
      applications: [{ github_repo: 'rickfelix/apexniche-ai' }],
      findings: [{ pr_number: 9, branch: 'feat/ml-I1', verdict: 'pass', sd_key: 'SD-MARKETLENS-I1', created_at: '2026-07-10T00:00:00Z' }],
    });
    const report = await runAudit({ supabase });
    expect(report.borrowedRowCandidates).toEqual([]);
    expect(report.chronologicallyImpossible).toHaveLength(1);
    expect(report.chronologicallyImpossible[0]).toMatchObject({ prNumber: 9, donorSdKey: 'SD-MARKETLENS-I1' });
  });

  it('still flags a live candidate when the donor row predates the merge (mergedAt present)', async () => {
    H.execFileSyncMock.mockReturnValue(JSON.stringify([{ number: 9, headRefName: 'feat/apex-D1', mergedAt: '2026-07-10T00:00:00Z' }]));
    const supabase = makeSupabase({
      applications: [{ github_repo: 'rickfelix/apexniche-ai' }],
      findings: [{ pr_number: 9, branch: 'feat/ml-I1', verdict: 'pass', sd_key: 'SD-MARKETLENS-I1', created_at: '2026-07-03T00:00:00Z' }],
    });
    const report = await runAudit({ supabase });
    expect(report.chronologicallyImpossible).toEqual([]);
    expect(report.borrowedRowCandidates).toHaveLength(1);
  });

  it('SECURITY (adversarial PR review): an older, genuinely-pre-merge donor is NOT hidden behind a newer, chronologically-impossible one for the same pr_number', async () => {
    // Two cross-branch pass rows exist for the same pr_number: an OLDER one (SD-REAL-EXPOSURE,
    // created before the merge -- a real historical exposure the pre-fix query could have returned
    // at merge time) and a NEWER one (SD-IRRELEVANT, created after the merge -- chronologically
    // impossible, added later by an unrelated SD). Naively sorting all rows and checking only the
    // globally-newest one's timestamp would pick the newer row, see it postdates the merge, and
    // wrongly report "not a real exposure" -- silently hiding the real one. The fix must scope the
    // candidate search to rows that existed AT OR BEFORE mergedAt before taking the most recent.
    H.execFileSyncMock.mockReturnValue(JSON.stringify([{ number: 9, headRefName: 'feat/apex-D1', mergedAt: '2026-07-05T00:00:00Z' }]));
    const supabase = makeSupabase({
      applications: [{ github_repo: 'rickfelix/apexniche-ai' }],
      findings: [
        { pr_number: 9, branch: 'feat/ml-old', verdict: 'pass', sd_key: 'SD-REAL-EXPOSURE', created_at: '2026-07-01T00:00:00Z' },
        { pr_number: 9, branch: 'feat/ml-new', verdict: 'pass', sd_key: 'SD-IRRELEVANT', created_at: '2026-07-10T00:00:00Z' },
      ],
    });
    const report = await runAudit({ supabase });
    expect(report.borrowedRowCandidates).toHaveLength(1);
    expect(report.borrowedRowCandidates[0]).toMatchObject({ prNumber: 9, donorSdKey: 'SD-REAL-EXPOSURE' });
    expect(report.chronologicallyImpossible).toEqual([]);
  });
});
