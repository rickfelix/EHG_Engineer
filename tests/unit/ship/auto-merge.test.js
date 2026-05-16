/**
 * lib/ship/auto-merge unit tests
 * SD-LEO-INFRA-SHIP-AUTO-MERGE-001
 *
 * Mocks the gh CLI runner to assert call sequences for each of the three
 * compounding failure modes plus the already-merged race recovery.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  attemptAutoMerge,
  detectDraftState,
  detectEnforceAdmins,
  buildMergeArgs,
  verifyMerged,
  verifyBranchDeleted,
} from '../../../lib/ship/auto-merge.mjs';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {} };

/**
 * Build a runner that responds to specific gh argv patterns with canned results.
 * Each call records the argv it received so tests can assert call order.
 */
function makeRunner(responses) {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    for (const { match, result } of responses) {
      if (match(args)) return { code: 0, stdout: '', stderr: '', ...result };
    }
    return { code: 1, stdout: '', stderr: 'unmatched gh call' };
  };
  return { runner, calls };
}

const argvMatchers = {
  prViewIsDraft: (args) =>
    args[0] === 'pr' && args[1] === 'view' && args.includes('isDraft'),
  prViewMergedAt: (args) =>
    args[0] === 'pr' && args[1] === 'view' && args.includes('mergedAt'),
  prViewState: (args) =>
    args[0] === 'pr' && args[1] === 'view' && args.includes('state'),
  prViewHeadRef: (args) =>
    args[0] === 'pr' && args[1] === 'view' && args.includes('headRefName'),
  prReady: (args) => args[0] === 'pr' && args[1] === 'ready',
  prMerge: (args) => args[0] === 'pr' && args[1] === 'merge',
  apiProtection: (args) =>
    args[0] === 'api' && args[1].includes('branches/main/protection'),
  apiRefHead: (args) =>
    args[0] === 'api' && /repos\/[^/]+\/[^/]+\/git\/refs\/heads\//.test(args[1]),
};

describe('buildMergeArgs', () => {
  it('omits --admin when admin=false', () => {
    expect(buildMergeArgs(123, { admin: false })).toEqual([
      'pr',
      'merge',
      '123',
      '--merge',
      '--delete-branch',
    ]);
  });

  it('appends --admin when admin=true', () => {
    expect(buildMergeArgs(123, { admin: true })).toEqual([
      'pr',
      'merge',
      '123',
      '--merge',
      '--delete-branch',
      '--admin',
    ]);
  });
});

describe('detectDraftState', () => {
  it('returns true when gh reports isDraft=true', () => {
    const { runner } = makeRunner([
      { match: argvMatchers.prViewIsDraft, result: { stdout: 'true\n' } },
    ]);
    expect(detectDraftState(7, runner)).toBe(true);
  });

  it('returns false when gh reports isDraft=false', () => {
    const { runner } = makeRunner([
      { match: argvMatchers.prViewIsDraft, result: { stdout: 'false\n' } },
    ]);
    expect(detectDraftState(7, runner)).toBe(false);
  });

  it('returns null on lookup failure', () => {
    const runner = () => ({ code: 1, stdout: '', stderr: 'auth required' });
    expect(detectDraftState(7, runner)).toBe(null);
  });
});

describe('detectEnforceAdmins', () => {
  it('returns true when branch protection enforce_admins=true', () => {
    const { runner } = makeRunner([
      { match: argvMatchers.apiProtection, result: { stdout: 'true\n' } },
    ]);
    expect(detectEnforceAdmins('o', 'r', runner)).toBe(true);
  });

  it('returns false when branch protection enforce_admins=false', () => {
    const { runner } = makeRunner([
      { match: argvMatchers.apiProtection, result: { stdout: 'false\n' } },
    ]);
    expect(detectEnforceAdmins('o', 'r', runner)).toBe(false);
  });

  it('defaults to false (safer fallback) on API lookup failure', () => {
    const runner = () => ({ code: 1, stdout: '', stderr: 'token scope' });
    expect(detectEnforceAdmins('o', 'r', runner)).toBe(false);
  });
});

describe('attemptAutoMerge — happy path (FR-1, FR-2)', () => {
  it('marks draft PR ready, then merges with --admin when enforce_admins=true', async () => {
    const { runner, calls } = makeRunner([
      { match: argvMatchers.prViewIsDraft, result: { stdout: 'true\n' } },
      { match: argvMatchers.prReady, result: { stdout: '' } },
      { match: argvMatchers.apiProtection, result: { stdout: 'true\n' } },
      { match: argvMatchers.prMerge, result: { stdout: '' } },
      { match: argvMatchers.prViewMergedAt, result: { stdout: '2026-05-04T22:23:28Z\n' } },
      { match: argvMatchers.prViewState, result: { stdout: 'MERGED\n' } },
    ]);

    const r = await attemptAutoMerge({
      prNumber: 42,
      repoOwner: 'rickfelix',
      repoName: 'EHG_Engineer',
      runner,
      logger: silentLogger,
    });

    expect(r).toEqual({ ok: true, action: 'merged', adminUsed: true });
    // QF-20260509-VERIFY-BRANCH-DELETED: after the mergedAt verify, the
    // happy path now also issues a pr-view for headRefName as part of the
    // branch-deletion verification (verifyBranchDeleted). The runner's
    // unmatched-call default returns code=1 → verifyBranchDeleted returns
    // null → "branch deletion not verified" advisory is logged. No
    // additional gh api call is made when the headRefName lookup fails.
    // QF-20260516-082: verifyMerged cross-checks state==='MERGED' after
    // mergedAt, adding one more pr-view call to the happy path.
    expect(calls.map((c) => c.slice(0, 2))).toEqual([
      ['pr', 'view'],
      ['pr', 'ready'],
      ['api', 'repos/rickfelix/EHG_Engineer/branches/main/protection'],
      ['pr', 'merge'],
      ['pr', 'view'],
      ['pr', 'view'],
      ['pr', 'view'],
    ]);
    const mergeCall = calls.find(argvMatchers.prMerge);
    expect(mergeCall).toContain('--admin');
  });

  it('skips gh pr ready when isDraft=false (TS-2)', async () => {
    const { runner, calls } = makeRunner([
      { match: argvMatchers.prViewIsDraft, result: { stdout: 'false\n' } },
      { match: argvMatchers.apiProtection, result: { stdout: 'true\n' } },
      { match: argvMatchers.prMerge, result: { stdout: '' } },
      { match: argvMatchers.prViewMergedAt, result: { stdout: '2026-05-04T22:23:28Z\n' } },
      { match: argvMatchers.prViewState, result: { stdout: 'MERGED\n' } },
    ]);

    const r = await attemptAutoMerge({
      prNumber: 42,
      repoOwner: 'o',
      repoName: 'r',
      runner,
      logger: silentLogger,
    });

    expect(r.ok).toBe(true);
    expect(calls.some(argvMatchers.prReady)).toBe(false);
  });

  it('omits --admin when enforce_admins=false (TS-3)', async () => {
    const { runner, calls } = makeRunner([
      { match: argvMatchers.prViewIsDraft, result: { stdout: 'false\n' } },
      { match: argvMatchers.apiProtection, result: { stdout: 'false\n' } },
      { match: argvMatchers.prMerge, result: { stdout: '' } },
      { match: argvMatchers.prViewMergedAt, result: { stdout: '2026-05-04T22:23:28Z\n' } },
      { match: argvMatchers.prViewState, result: { stdout: 'MERGED\n' } },
    ]);

    const r = await attemptAutoMerge({
      prNumber: 42,
      repoOwner: 'o',
      repoName: 'r',
      runner,
      logger: silentLogger,
    });

    expect(r).toEqual({ ok: true, action: 'merged', adminUsed: false });
    const mergeCall = calls.find(argvMatchers.prMerge);
    expect(mergeCall).not.toContain('--admin');
  });
});

describe('verifyMerged (QF-20260504-195, QF-20260516-082)', () => {
  it('returns true when mergedAt is populated AND state===MERGED', () => {
    const { runner } = makeRunner([
      { match: argvMatchers.prViewMergedAt, result: { stdout: '2026-05-04T22:23:28Z\n' } },
      { match: argvMatchers.prViewState, result: { stdout: 'MERGED\n' } },
    ]);
    expect(verifyMerged(568, runner)).toBe(true);
  });

  it('returns false when gh emits the literal string "null" (PR not merged)', () => {
    const { runner } = makeRunner([
      { match: argvMatchers.prViewMergedAt, result: { stdout: 'null\n' } },
    ]);
    expect(verifyMerged(568, runner)).toBe(false);
  });

  it('returns false on lookup failure (safer fallback)', () => {
    const runner = () => ({ code: 1, stdout: '', stderr: 'auth required' });
    expect(verifyMerged(568, runner)).toBe(false);
  });

  it('returns false on empty stdout', () => {
    const { runner } = makeRunner([
      { match: argvMatchers.prViewMergedAt, result: { stdout: '' } },
    ]);
    expect(verifyMerged(568, runner)).toBe(false);
  });

  it('QF-20260516-082 (closes harness 72a3a5f1): returns false when mergedAt populated but state===OPEN (queued-but-not-merged race)', () => {
    // Empirical witness: PR rickfelix/ehg#600 returned mergedAt timestamp via
    // gh while pulls REST endpoint showed merged=false, mergeable_state=unstable.
    // state==='OPEN' is the authoritative tie-breaker that catches this race.
    const { runner } = makeRunner([
      { match: argvMatchers.prViewMergedAt, result: { stdout: '2026-05-13T23:25:00Z\n' } },
      { match: argvMatchers.prViewState, result: { stdout: 'OPEN\n' } },
    ]);
    expect(verifyMerged(600, runner)).toBe(false);
  });

  it('QF-20260516-082: returns false when state lookup itself fails', () => {
    const { runner } = makeRunner([
      { match: argvMatchers.prViewMergedAt, result: { stdout: '2026-05-04T22:23:28Z\n' } },
      // No prViewState matcher → runner returns code=1 → verifyMerged false.
    ]);
    expect(verifyMerged(568, runner)).toBe(false);
  });
});

describe('attemptAutoMerge — silent-success regression (QF-20260504-195)', () => {
  it('hard-fails when gh pr merge exits 0 but mergedAt is null and PR state is OPEN', async () => {
    const { runner } = makeRunner([
      { match: argvMatchers.prViewIsDraft, result: { stdout: 'false\n' } },
      { match: argvMatchers.apiProtection, result: { stdout: 'true\n' } },
      { match: argvMatchers.prMerge, result: { code: 0, stdout: '' } },
      { match: argvMatchers.prViewMergedAt, result: { stdout: 'null\n' } },
      { match: argvMatchers.prViewState, result: { stdout: 'OPEN\n' } },
    ]);

    const r = await attemptAutoMerge({
      prNumber: 568,
      repoOwner: 'rickfelix',
      repoName: 'ehg',
      runner,
      logger: silentLogger,
    });

    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1);
    expect(r.reason).toMatch(/silent-success/);
    expect(r.reason).toMatch(/state=OPEN/);
  });

  it('recovers as already-merged when exit-0-mergedAt-null but state is MERGED (race)', async () => {
    const { runner } = makeRunner([
      { match: argvMatchers.prViewIsDraft, result: { stdout: 'false\n' } },
      { match: argvMatchers.apiProtection, result: { stdout: 'true\n' } },
      { match: argvMatchers.prMerge, result: { code: 0, stdout: '' } },
      { match: argvMatchers.prViewMergedAt, result: { stdout: 'null\n' } },
      { match: argvMatchers.prViewState, result: { stdout: 'MERGED\n' } },
    ]);

    const r = await attemptAutoMerge({
      prNumber: 568,
      repoOwner: 'rickfelix',
      repoName: 'ehg',
      runner,
      logger: silentLogger,
    });

    expect(r).toEqual({ ok: true, action: 'already-merged', adminUsed: true });
  });
});

describe('attemptAutoMerge — hard-fail (FR-3, TS-4)', () => {
  it('returns ok=false with non-zero exitCode when merge fails and PR is still OPEN', async () => {
    const { runner } = makeRunner([
      { match: argvMatchers.prViewIsDraft, result: { stdout: 'false\n' } },
      { match: argvMatchers.apiProtection, result: { stdout: 'false\n' } },
      {
        match: argvMatchers.prMerge,
        result: { code: 1, stderr: 'this pull request is not mergeable' },
      },
      { match: argvMatchers.prViewState, result: { stdout: 'OPEN\n' } },
    ]);

    const r = await attemptAutoMerge({
      prNumber: 99,
      repoOwner: 'o',
      repoName: 'r',
      runner,
      logger: silentLogger,
    });

    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(1);
    expect(r.reason).toMatch(/not mergeable|state=OPEN/);
  });
});

describe('attemptAutoMerge — race recovery (FR-4, TS-5)', () => {
  it('recovers when merge exits non-zero but PR state is already MERGED', async () => {
    const { runner } = makeRunner([
      { match: argvMatchers.prViewIsDraft, result: { stdout: 'false\n' } },
      { match: argvMatchers.apiProtection, result: { stdout: 'true\n' } },
      {
        match: argvMatchers.prMerge,
        result: { code: 1, stderr: 'pull request not found in mergeable state' },
      },
      // Non-zero exit short-circuits past verifyMerged into the race-recovery
      // state check; no prViewMergedAt entry needed in this path.
      { match: argvMatchers.prViewState, result: { stdout: 'MERGED\n' } },
    ]);

    const r = await attemptAutoMerge({
      prNumber: 99,
      repoOwner: 'o',
      repoName: 'r',
      runner,
      logger: silentLogger,
    });

    expect(r).toEqual({ ok: true, action: 'already-merged', adminUsed: true });
  });
});

describe('attemptAutoMerge — input validation', () => {
  it('rejects missing prNumber', async () => {
    const r = await attemptAutoMerge({
      prNumber: undefined,
      repoOwner: 'o',
      repoName: 'r',
      runner: vi.fn(),
      logger: silentLogger,
    });
    expect(r.ok).toBe(false);
    expect(r.exitCode).toBe(2);
  });
});

describe('verifyBranchDeleted (QF-20260509-VERIFY-BRANCH-DELETED — closes 4e273e05)', () => {
  it('returns true when GET refs/heads/<branch> 404s with stderr "Not Found"', () => {
    const { runner } = makeRunner([
      { match: argvMatchers.prViewHeadRef, result: { stdout: 'feat/SD-foo\n' } },
      { match: argvMatchers.apiRefHead, result: { code: 1, stderr: 'gh: Not Found (HTTP 404)' } },
    ]);
    expect(verifyBranchDeleted(123, 'rickfelix', 'EHG_Engineer', runner)).toBe(true);
  });

  it('returns true when stderr contains the literal "404" without "Not Found"', () => {
    const { runner } = makeRunner([
      { match: argvMatchers.prViewHeadRef, result: { stdout: 'feat/SD-bar\n' } },
      { match: argvMatchers.apiRefHead, result: { code: 1, stderr: 'HTTP 404 from api' } },
    ]);
    expect(verifyBranchDeleted(123, 'rickfelix', 'EHG_Engineer', runner)).toBe(true);
  });

  it('returns false when GET refs/heads/<branch> succeeds (branch still exists)', () => {
    const { runner } = makeRunner([
      { match: argvMatchers.prViewHeadRef, result: { stdout: 'feat/SD-baz\n' } },
      { match: argvMatchers.apiRefHead, result: { code: 0, stdout: '{"ref":"refs/heads/feat/SD-baz"}' } },
    ]);
    expect(verifyBranchDeleted(123, 'rickfelix', 'EHG_Engineer', runner)).toBe(false);
  });

  it('returns null (inconclusive) when headRefName lookup fails', () => {
    const runner = (args) => {
      if (args[0] === 'pr' && args[1] === 'view') {
        return { code: 1, stdout: '', stderr: 'auth required' };
      }
      throw new Error('should not reach api call when headRefName lookup fails');
    };
    expect(verifyBranchDeleted(123, 'rickfelix', 'EHG_Engineer', runner)).toBeNull();
  });

  it('returns null (inconclusive) when headRefName is empty', () => {
    const { runner } = makeRunner([
      { match: argvMatchers.prViewHeadRef, result: { stdout: '' } },
    ]);
    expect(verifyBranchDeleted(123, 'rickfelix', 'EHG_Engineer', runner)).toBeNull();
  });

  it('returns null when API call fails for non-404 reason (e.g. timeout, auth)', () => {
    const { runner } = makeRunner([
      { match: argvMatchers.prViewHeadRef, result: { stdout: 'feat/SD-quux\n' } },
      { match: argvMatchers.apiRefHead, result: { code: 1, stderr: 'token expired' } },
    ]);
    expect(verifyBranchDeleted(123, 'rickfelix', 'EHG_Engineer', runner)).toBeNull();
  });

  it('returns null when repoOwner or repoName is missing', () => {
    const noopRunner = () => { throw new Error('should not run'); };
    expect(verifyBranchDeleted(123, '', 'EHG_Engineer', noopRunner)).toBeNull();
    expect(verifyBranchDeleted(123, 'rickfelix', '', noopRunner)).toBeNull();
    expect(verifyBranchDeleted(123, null, null, noopRunner)).toBeNull();
  });
});

describe('attemptAutoMerge — branch-deletion verification (QF-20260509-VERIFY-BRANCH-DELETED)', () => {
  it('logs a warning when merge succeeds but branch deletion silently failed', async () => {
    const warnings = [];
    const captureLogger = {
      info: () => {},
      warn: (msg) => warnings.push(msg),
      error: () => {},
    };
    const { runner } = makeRunner([
      { match: argvMatchers.prViewIsDraft, result: { stdout: 'false\n' } },
      { match: argvMatchers.apiProtection, result: { stdout: 'false\n' } },
      { match: argvMatchers.prMerge, result: { stdout: '' } },
      { match: argvMatchers.prViewMergedAt, result: { stdout: '2026-05-06T10:00:00Z\n' } },
      { match: argvMatchers.prViewState, result: { stdout: 'MERGED\n' } },
      { match: argvMatchers.prViewHeadRef, result: { stdout: 'qf/QF-foo\n' } },
      { match: argvMatchers.apiRefHead, result: { code: 0, stdout: '{"ref":"refs/heads/qf/QF-foo"}' } },
    ]);

    const r = await attemptAutoMerge({
      prNumber: 200,
      repoOwner: 'rickfelix',
      repoName: 'EHG_Engineer',
      runner,
      logger: captureLogger,
    });

    // The merge result itself remains successful — branch-deletion failure
    // is advisory, not a hard-fail.
    expect(r).toEqual({ ok: true, action: 'merged', adminUsed: false });
    // But the warning must have been logged with actionable manual-cleanup hint.
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/branch deletion silently failed/);
    expect(warnings[0]).toMatch(/manual cleanup needed/);
    expect(warnings[0]).toMatch(/repos\/rickfelix\/EHG_Engineer\/git\/refs\/heads/);
  });

  it('logs success when merge succeeds and branch was actually deleted (404)', async () => {
    const infos = [];
    const captureLogger = {
      info: (msg) => infos.push(msg),
      warn: () => { throw new Error('should not warn on clean branch deletion'); },
      error: () => {},
    };
    const { runner } = makeRunner([
      { match: argvMatchers.prViewIsDraft, result: { stdout: 'false\n' } },
      { match: argvMatchers.apiProtection, result: { stdout: 'false\n' } },
      { match: argvMatchers.prMerge, result: { stdout: '' } },
      { match: argvMatchers.prViewMergedAt, result: { stdout: '2026-05-06T10:00:00Z\n' } },
      { match: argvMatchers.prViewState, result: { stdout: 'MERGED\n' } },
      { match: argvMatchers.prViewHeadRef, result: { stdout: 'qf/QF-bar\n' } },
      { match: argvMatchers.apiRefHead, result: { code: 1, stderr: 'gh: Not Found (HTTP 404)' } },
    ]);

    const r = await attemptAutoMerge({
      prNumber: 201,
      repoOwner: 'rickfelix',
      repoName: 'EHG_Engineer',
      runner,
      logger: captureLogger,
    });

    expect(r.ok).toBe(true);
    expect(infos.some((m) => /merged and branch deleted/.test(m))).toBe(true);
  });

  it('logs neutral message when branch deletion is inconclusive (lookup failed)', async () => {
    const infos = [];
    const captureLogger = {
      info: (msg) => infos.push(msg),
      warn: () => { throw new Error('should not warn when verification is inconclusive'); },
      error: () => {},
    };
    const { runner } = makeRunner([
      { match: argvMatchers.prViewIsDraft, result: { stdout: 'false\n' } },
      { match: argvMatchers.apiProtection, result: { stdout: 'false\n' } },
      { match: argvMatchers.prMerge, result: { stdout: '' } },
      { match: argvMatchers.prViewMergedAt, result: { stdout: '2026-05-06T10:00:00Z\n' } },
      { match: argvMatchers.prViewState, result: { stdout: 'MERGED\n' } },
      // headRefName lookup fails → verifyBranchDeleted returns null →
      // attemptAutoMerge logs the "not verified" advisory.
    ]);

    const r = await attemptAutoMerge({
      prNumber: 202,
      repoOwner: 'rickfelix',
      repoName: 'EHG_Engineer',
      runner,
      logger: captureLogger,
    });

    expect(r.ok).toBe(true);
    expect(infos.some((m) => /not verified/.test(m))).toBe(true);
  });
});
