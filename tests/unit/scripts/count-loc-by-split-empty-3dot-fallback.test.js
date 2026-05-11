/**
 * QF-20260511-741: countLocBySplit empty 3-dot diff fallback.
 *
 * Closes feedback 2b792e59 (merge-commit PR: pr.mergeCommit.oid IS origin/main
 * → empty 3-dot diff → split={0,0,0} → caller falls back to GitHub-API total
 * as 100% source) and 661285bc (post-fetch fast-forward: origin/main has been
 * fast-forwarded to mergeCommit.oid before complete-quick-fix runs → same
 * empty 3-dot symptom).
 *
 * Fix: when `git diff --numstat baseRef...headRef` returns empty AND
 * headRef !== 'HEAD' (explicit commit SHA), retry with headRef^...headRef.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const execSyncMock = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ execSync: execSyncMock }));

const { countLocBySplit } = await import('../../../scripts/modules/complete-quick-fix/git-operations.js');

describe('QF-20260511-741 — countLocBySplit empty 3-dot fallback', () => {
  beforeEach(() => execSyncMock.mockReset());

  it('falls back to headRef^...headRef when 3-dot returns empty AND headRef is an explicit SHA', () => {
    // First call (3-dot): empty diff
    execSyncMock.mockReturnValueOnce('');
    // Second call (parent-diff fallback): real numstat
    execSyncMock.mockReturnValueOnce('27\t0\tlib/foo.js\n94\t0\ttests/foo.test.js');
    // Third call (--name-status --diff-filter=D on effectiveRange): empty
    execSyncMock.mockReturnValueOnce('');

    const r = countLocBySplit('/fake/repo', 'origin/main', 'abc123def');

    expect(r.source).toBe(27);
    expect(r.test).toBe(94);
    expect(r.total).toBe(121);

    // Verify the fallback range was used
    const calls = execSyncMock.mock.calls.map(c => c[0]);
    expect(calls[0]).toBe('git diff --numstat origin/main...abc123def');
    expect(calls[1]).toBe('git diff --numstat abc123def^...abc123def');
  });

  it('does NOT fall back when headRef is HEAD (legacy in-worktree path)', () => {
    execSyncMock.mockReturnValueOnce(''); // empty 3-dot
    // No second call expected — fallback should be skipped for HEAD.

    const r = countLocBySplit('/fake/repo', 'origin/main', 'HEAD');

    expect(r).toEqual({ source: 0, test: 0, total: 0, sourceDeletionLoc: 0 });
    expect(execSyncMock).toHaveBeenCalledTimes(1);
  });

  it('passes effectiveRange (fallback range) to --diff-filter=D call', () => {
    execSyncMock.mockReturnValueOnce(''); // empty 3-dot
    execSyncMock.mockReturnValueOnce('5\t10\tlib/deleted.js'); // fallback numstat
    execSyncMock.mockReturnValueOnce('D\tlib/deleted.js'); // diff-filter D

    const r = countLocBySplit('/fake/repo', 'origin/main', 'sha999');

    expect(r.sourceDeletionLoc).toBe(15);
    const calls = execSyncMock.mock.calls.map(c => c[0]);
    expect(calls[2]).toBe('git diff --name-status --diff-filter=D sha999^...sha999');
  });

  it('tolerates parent-diff failing (e.g. root/shallow commit) and returns empty result', () => {
    execSyncMock.mockReturnValueOnce(''); // empty 3-dot
    execSyncMock.mockImplementationOnce(() => { throw new Error('fatal: ambiguous argument'); }); // parent unreachable

    const r = countLocBySplit('/fake/repo', 'origin/main', 'sha000');

    expect(r).toEqual({ source: 0, test: 0, total: 0, sourceDeletionLoc: 0 });
  });

  it('uses 3-dot range when it returns non-empty (regression: no unnecessary fallback)', () => {
    execSyncMock.mockReturnValueOnce('20\t0\tlib/a.js'); // 3-dot has real data
    execSyncMock.mockReturnValueOnce(''); // diff-filter D — empty

    const r = countLocBySplit('/fake/repo', 'origin/main', 'sha-with-data');

    expect(r.source).toBe(20);
    const calls = execSyncMock.mock.calls.map(c => c[0]);
    expect(calls[0]).toBe('git diff --numstat origin/main...sha-with-data');
    // The 2nd call should be the diff-filter, NOT the parent-fallback diff
    expect(calls[1]).toBe('git diff --name-status --diff-filter=D origin/main...sha-with-data');
  });
});
