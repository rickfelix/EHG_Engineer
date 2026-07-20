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
  detectBranchProtectionEnabled,
  buildMergeArgs,
  verifyMerged,
  verifyBranchDeleted,
  isPlatformRepo,
  createRegistryNarrowedTrustGate,
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
  // QF-20260703-197: verifyMerged now issues ONE repo-scoped call requesting
  // 'mergedAt,mergeCommit,state' together (not a bare 'mergedAt' element) —
  // substring match keeps this matcher hitting both the pre-fix shape (any
  // legacy callers) and the new combined-JSON call.
  prViewMergedAt: (args) =>
    args[0] === 'pr' && args[1] === 'view' && args.some((a) => typeof a === 'string' && a.includes('mergedAt')),
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

/** QF-20260703-197: verifyMerged's authoritative combined JSON payload. */
const mergedJson = (mergedAt, { mergeCommitOid = 'deadbeef', state = 'MERGED' } = {}) =>
  JSON.stringify({ mergedAt, mergeCommit: mergeCommitOid ? { oid: mergeCommitOid } : null, state });

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

  // QF-20260705-938 (critical, live near-miss ehg PR #734): without -R, gh resolves
  // the PR NUMBER against the ambient cwd repo — a cross-repo caller from EHG_Engineer
  // cwd merging an ehg PR silently no-ops (or, on an open-number collision, merges the
  // WRONG repo's PR with --admin). Cross-repo merge args MUST carry -R.
  it('carries -R owner/repo when repoOwner/repoName are supplied (cross-repo, QF-20260705-938)', () => {
    expect(buildMergeArgs(734, { admin: true, repoOwner: 'rickfelix', repoName: 'ehg' })).toEqual([
      'pr',
      'merge',
      '734',
      '-R',
      'rickfelix/ehg',
      '--merge',
      '--delete-branch',
      '--admin',
    ]);
  });

  it('omits -R when the target repo is unknown (legacy ambient behavior preserved)', () => {
    expect(buildMergeArgs(5, {})).toEqual(['pr', 'merge', '5', '--merge', '--delete-branch']);
    expect(buildMergeArgs(5, { repoOwner: 'rickfelix' })).toEqual(['pr', 'merge', '5', '--merge', '--delete-branch']);
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

  // QF-20260705-938: the draft probe is repo-scoped for cross-repo callers, and the
  // legacy 2-arg (prNumber, runner) form keeps working via the back-compat shim.
  it('scopes the pr view with -R when repoOwner/repoName are supplied', () => {
    const seen = [];
    const runner = (argv) => { seen.push(argv); return { code: 0, stdout: 'true\n', stderr: '' }; };
    expect(detectDraftState(734, 'rickfelix', 'ehg', runner)).toBe(true);
    expect(seen[0]).toEqual(['pr', 'view', '734', '-R', 'rickfelix/ehg', '--json', 'isDraft', '--jq', '.isDraft']);
  });

  it('legacy 2-arg form (prNumber, runner) still resolves unscoped', () => {
    const seen = [];
    const runner = (argv) => { seen.push(argv); return { code: 0, stdout: 'false\n', stderr: '' }; };
    expect(detectDraftState(7, runner)).toBe(false);
    expect(seen[0]).toEqual(['pr', 'view', '7', '--json', 'isDraft', '--jq', '.isDraft']);
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

// QF-20260703-744: the retro witness evaluator's P4 rung needs a check that never
// collapses a read failure into "disabled" — the false-negative that under-reported
// coverage on rickfelix/marketlens (protection live, P4 wrongly reported NOT-ENABLED).
describe('detectBranchProtectionEnabled', () => {
  it('returns true (enabled) — marketlens-shaped fixture with protection live', () => {
    const runner = () => ({ code: 0, stdout: '{"required_status_checks":{}}', stderr: '' });
    expect(detectBranchProtectionEnabled('rickfelix', 'marketlens', 'main', runner)).toBe(true);
  });

  it('returns false (confirmed disabled) on a genuine 404 "Branch not protected"', () => {
    const runner = () => ({ code: 1, stdout: '', stderr: 'GraphQL: Branch not protected (branch)' });
    expect(detectBranchProtectionEnabled('o', 'r', 'main', runner)).toBe(false);
  });

  it('returns null (not_evaluable) on 403/scope failure — never folded into disabled', () => {
    const runner = () => ({ code: 1, stdout: '', stderr: 'HTTP 403: Resource not accessible by integration' });
    expect(detectBranchProtectionEnabled('o', 'r', 'main', runner)).toBeNull();
  });

  it('returns null (not_evaluable) on a network/unknown failure', () => {
    const runner = () => ({ code: 1, stdout: '', stderr: 'connection reset' });
    expect(detectBranchProtectionEnabled('o', 'r', 'main', runner)).toBeNull();
  });
});

describe('attemptAutoMerge — happy path (FR-1, FR-2)', () => {
  it('marks draft PR ready, then merges with --admin when enforce_admins=true', async () => {
    const { runner, calls } = makeRunner([
      { match: argvMatchers.prViewIsDraft, result: { stdout: 'true\n' } },
      { match: argvMatchers.prReady, result: { stdout: '' } },
      { match: argvMatchers.apiProtection, result: { stdout: 'true\n' } },
      { match: argvMatchers.prMerge, result: { stdout: '' } },
      { match: argvMatchers.prViewMergedAt, result: { stdout: mergedJson('2026-05-04T22:23:28Z') } },
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
    // QF-20260703-197: verifyMerged is now ONE consolidated repo-scoped call
    // (mergedAt+mergeCommit+state together), not two separate pr-view calls.
    // SD-LEO-INFRA-SHIP-WITNESS-MERGEWORK-001 FR-4: the mergeWork() P1-P5
    // ladder observes every merge attempt in shadow mode, adding one final
    // read-only pr-view (statusCheckRollup, for the P3 rung) after the merge
    // succeeds. It never affects `r` above — only appends to the call log.
    // QF-20260703-363: the ladder's P4 rung now also probes live branch
    // protection (same endpoint detectEnforceAdmins already reads above),
    // appending one more `api .../protection` call at the end.
    expect(calls.map((c) => c.slice(0, 2))).toEqual([
      ['pr', 'view'],
      ['pr', 'ready'],
      ['api', 'repos/rickfelix/EHG_Engineer/branches/main/protection'],
      ['pr', 'merge'],
      ['pr', 'view'],
      ['pr', 'view'],
      ['pr', 'view'],
      ['api', 'repos/rickfelix/EHG_Engineer/branches/main/protection'],
    ]);
    const mergeCall = calls.find(argvMatchers.prMerge);
    expect(mergeCall).toContain('--admin');
  });

  it('skips gh pr ready when isDraft=false (TS-2)', async () => {
    const { runner, calls } = makeRunner([
      { match: argvMatchers.prViewIsDraft, result: { stdout: 'false\n' } },
      { match: argvMatchers.apiProtection, result: { stdout: 'true\n' } },
      { match: argvMatchers.prMerge, result: { stdout: '' } },
      { match: argvMatchers.prViewMergedAt, result: { stdout: mergedJson('2026-05-04T22:23:28Z') } },
      { match: argvMatchers.prViewState, result: { stdout: 'MERGED\n' } },
    ]);

    const r = await attemptAutoMerge({
      prNumber: 42,
      repoOwner: 'o',
      repoName: 'r',
      allowExternalMerge: true, // mechanic test — not exercising the C2 trust gate
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
      { match: argvMatchers.prViewMergedAt, result: { stdout: mergedJson('2026-05-04T22:23:28Z') } },
      { match: argvMatchers.prViewState, result: { stdout: 'MERGED\n' } },
    ]);

    const r = await attemptAutoMerge({
      prNumber: 42,
      repoOwner: 'o',
      repoName: 'r',
      allowExternalMerge: true, // mechanic test — not exercising the C2 trust gate
      runner,
      logger: silentLogger,
    });

    expect(r).toEqual({ ok: true, action: 'merged', adminUsed: false });
    const mergeCall = calls.find(argvMatchers.prMerge);
    expect(mergeCall).not.toContain('--admin');
  });
});

describe('attemptAutoMerge — mergeWork() P4 rung shares the live probe (QF-20260703-363)', () => {
  it('reports P4 pass via the SAME detectBranchProtectionEnabled probe the retro CLI uses, not the not_applicable stub', async () => {
    const { runner } = makeRunner([
      { match: argvMatchers.prViewIsDraft, result: { stdout: 'false\n' } },
      { match: argvMatchers.apiProtection, result: { stdout: 'true\n' } },
      { match: argvMatchers.prMerge, result: { stdout: '' } },
      { match: argvMatchers.prViewMergedAt, result: { stdout: mergedJson('2026-07-03T18:29:39Z') } },
      { match: argvMatchers.prViewState, result: { stdout: 'MERGED\n' } },
    ]);
    let capturedRungs = null;
    const witnessSupabase = {
      from: () => ({
        insert: (row) => {
          capturedRungs = row.rungs;
          return Promise.resolve({ error: null });
        },
      }),
    };

    await attemptAutoMerge({
      prNumber: 9,
      repoOwner: 'rickfelix',
      repoName: 'marketlens',
      allowExternalMerge: true, // mechanic test — not exercising the C2 trust gate
      runner,
      logger: silentLogger,
      witnessSupabase,
      lane: 'ship-auto-merge',
    });

    const p4 = capturedRungs.find((r) => r.id === 'P4');
    expect(p4.status).toBe('pass');
    expect(p4.reason).toContain('rickfelix/marketlens');
  });
});

describe('verifyMerged (QF-20260504-195, QF-20260516-082, QF-20260703-197)', () => {
  it('returns true when mergedAt AND mergeCommit are populated AND state===MERGED, for the exact repo requested', () => {
    const { runner, calls } = makeRunner([
      { match: argvMatchers.prViewMergedAt, result: { stdout: mergedJson('2026-05-04T22:23:28Z') } },
    ]);
    expect(verifyMerged(568, 'rickfelix', 'ehg', runner)).toBe(true);
    expect(calls[0]).toEqual(
      expect.arrayContaining(['pr', 'view', '568', '-R', 'rickfelix/ehg', '--json', 'mergedAt,mergeCommit,state']),
    );
  });

  // QF-20260703-197: the actual root cause. An unscoped `gh pr view <N>` resolves
  // against the process's ambient CWD repo, not (repoOwner, repoName) — which
  // produced a false PASS against an unrelated, already-merged PR of the same
  // number in the wrong repo on the witness's first live venture-repo exercise
  // (rickfelix/marketlens PR #2). Never a false pass without an authoritative target.
  it('returns false (never a false pass) when repoOwner or repoName is missing — no ambient-repo fallback', () => {
    const noopRunner = () => { throw new Error('must never shell out without an explicit repo target'); };
    expect(verifyMerged(2, '', 'marketlens', noopRunner)).toBe(false);
    expect(verifyMerged(2, 'rickfelix', '', noopRunner)).toBe(false);
    expect(verifyMerged(2, null, null, noopRunner)).toBe(false);
  });

  it('returns false when mergeCommit is null even though mergedAt+state say MERGED (no derived/expected state ever satisfies P5)', () => {
    const { runner } = makeRunner([
      {
        match: argvMatchers.prViewMergedAt,
        result: { stdout: mergedJson('2026-05-04T22:23:28Z', { mergeCommitOid: null }) },
      },
    ]);
    expect(verifyMerged(568, 'rickfelix', 'ehg', runner)).toBe(false);
  });

  it('returns false when gh reports mergedAt=null (PR not merged) — regression for the venture-repo open-PR case (marketlens #2)', () => {
    const { runner } = makeRunner([
      {
        match: argvMatchers.prViewMergedAt,
        result: { stdout: mergedJson(null, { mergeCommitOid: null, state: 'OPEN' }) },
      },
    ]);
    expect(verifyMerged(2, 'rickfelix', 'marketlens', runner)).toBe(false);
  });

  it('returns false on lookup failure (safer fallback)', () => {
    const runner = () => ({ code: 1, stdout: '', stderr: 'auth required' });
    expect(verifyMerged(568, 'rickfelix', 'ehg', runner)).toBe(false);
  });

  it('returns false on unparseable stdout', () => {
    const { runner } = makeRunner([
      { match: argvMatchers.prViewMergedAt, result: { stdout: '' } },
    ]);
    expect(verifyMerged(568, 'rickfelix', 'ehg', runner)).toBe(false);
  });

  it('QF-20260516-082 (closes harness 72a3a5f1): returns false when mergedAt populated but state===OPEN (queued-but-not-merged race)', () => {
    // Empirical witness: PR rickfelix/ehg#600 returned mergedAt timestamp via
    // gh while pulls REST endpoint showed merged=false, mergeable_state=unstable.
    // state==='OPEN' is the authoritative tie-breaker that catches this race.
    const { runner } = makeRunner([
      { match: argvMatchers.prViewMergedAt, result: { stdout: mergedJson('2026-05-13T23:25:00Z', { state: 'OPEN' }) } },
    ]);
    expect(verifyMerged(600, 'rickfelix', 'ehg', runner)).toBe(false);
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

  // QF-20260703-197: verifyMerged is now ONE consolidated repo-scoped call reused
  // identically by both step 3 (post-merge check) and step 4 (race-recovery) — so
  // the "second look confirms merged" race is simulated with a stateful mock
  // (not two independently-mockable calls) to prove the retry genuinely re-checks
  // authoritative evidence rather than trusting a stale/derived state.
  it('recovers as already-merged when not-yet-visible on the first check but confirmed merged on retry (race)', async () => {
    let mergedAtCalls = 0;
    const runner = (args) => {
      if (argvMatchers.prViewIsDraft(args)) return { code: 0, stdout: 'false\n', stderr: '' };
      if (argvMatchers.apiProtection(args)) return { code: 0, stdout: 'true\n', stderr: '' };
      if (argvMatchers.prMerge(args)) return { code: 0, stdout: '', stderr: '' };
      if (argvMatchers.prViewMergedAt(args)) {
        mergedAtCalls += 1;
        const stdout = mergedAtCalls === 1
          ? mergedJson(null, { mergeCommitOid: null, state: 'OPEN' })
          : mergedJson('2026-05-04T22:23:28Z');
        return { code: 0, stdout, stderr: '' };
      }
      if (argvMatchers.prViewState(args)) return { code: 0, stdout: 'MERGED\n', stderr: '' };
      return { code: 1, stdout: '', stderr: 'unmatched gh call' };
    };

    const r = await attemptAutoMerge({
      prNumber: 568,
      repoOwner: 'rickfelix',
      repoName: 'ehg',
      runner,
      logger: silentLogger,
    });

    expect(r).toEqual({ ok: true, action: 'already-merged', adminUsed: true });
    expect(mergedAtCalls).toBe(2);
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
      allowExternalMerge: true, // mechanic test — not exercising the C2 trust gate
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
      // Non-zero merge exit short-circuits past step 3 into race-recovery, which
      // now re-runs the SAME consolidated verifyMerged() check (QF-20260703-197)
      // — so the combined mergedAt+mergeCommit+state payload must be mocked here.
      { match: argvMatchers.prViewState, result: { stdout: 'MERGED\n' } },
      { match: argvMatchers.prViewMergedAt, result: { stdout: mergedJson('2026-05-04T22:23:28Z') } },
    ]);

    const r = await attemptAutoMerge({
      prNumber: 99,
      repoOwner: 'o',
      repoName: 'r',
      allowExternalMerge: true, // mechanic test — not exercising the C2 trust gate
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
      allowExternalMerge: true, // mechanic test — not exercising the C2 trust gate
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
      { match: argvMatchers.prViewMergedAt, result: { stdout: mergedJson('2026-05-06T10:00:00Z') } },
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
      { match: argvMatchers.prViewMergedAt, result: { stdout: mergedJson('2026-05-06T10:00:00Z') } },
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
      { match: argvMatchers.prViewMergedAt, result: { stdout: mergedJson('2026-05-06T10:00:00Z') } },
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

// SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 C2 / AT-SEC-2: external-repo human merge-gate.
describe('isPlatformRepo (C2 trust allowlist)', () => {
  it('is true only for the two platform repos (case-insensitive)', () => {
    expect(isPlatformRepo('rickfelix', 'ehg')).toBe(true);
    expect(isPlatformRepo('rickfelix', 'EHG_Engineer')).toBe(true);
    expect(isPlatformRepo('RickFelix', 'EHG')).toBe(true);
  });
  it('is false for venture/external/unknown repos and missing args', () => {
    expect(isPlatformRepo('rickfelix', 'commitcraft-ai')).toBe(false);
    expect(isPlatformRepo('someorg', 'someventure')).toBe(false);
    expect(isPlatformRepo(null, 'ehg')).toBe(false);
    expect(isPlatformRepo('rickfelix', undefined)).toBe(false);
  });
});

// SD-LEO-INFRA-CANONICAL-REPO-APP-001 FR-3 (TS-3, TS-4): AND-composed registry
// narrowing gate. Must NEVER widen past the isPlatformRepo floor, even under a
// mis-tagged registry row — this is not hypothetical: the LIVE applications
// table tags MarketLens (an external venture repo) trust_tier='trusted', which
// is exactly the shape of row that must never grant auto-merge eligibility.
describe('createRegistryNarrowedTrustGate (FR-3: AND-composed, never-widen trust gate)', () => {
  function makeSupabase(rows) {
    return {
      from: () => ({
        // FR-6 batch 8: the registry-narrowed trust gate paginates the applications
        // scan via fetchAllPaginated (.not().order().range()); extend the chain to match.
        select: () => ({
          not: () => ({
            order: () => ({
              range: () => Promise.resolve({ data: rows, error: null }),
            }),
          }),
        }),
      }),
    };
  }

  it('TS-3: a mis-tagged venture repo (trust_tier=platform/trusted) STILL fails closed — floor is non-negotiable', async () => {
    const supabase = makeSupabase([
      { github_repo: 'rickfelix/marketlens', trust_tier: 'trusted' },
      { github_repo: 'rickfelix/commitcraft-ai', trust_tier: 'platform' }, // hypothetical mis-tag
    ]);
    const gate = createRegistryNarrowedTrustGate(supabase);
    expect(await gate('rickfelix', 'marketlens')).toBe(false);
    expect(await gate('rickfelix', 'commitcraft-ai')).toBe(false);
  });

  it('TS-4: rickfelix/ehg and rickfelix/EHG_Engineer remain eligible when registry confirms trust_tier=platform (no regression)', async () => {
    const supabase = makeSupabase([
      { github_repo: 'rickfelix/ehg.git', trust_tier: 'platform' },
      { github_repo: 'rickfelix/EHG_Engineer.git', trust_tier: 'platform' },
    ]);
    const gate = createRegistryNarrowedTrustGate(supabase);
    expect(await gate('rickfelix', 'ehg')).toBe(true);
    expect(await gate('rickfelix', 'EHG_Engineer')).toBe(true);
  });

  it('narrows a floor-eligible repo whose registry trust_tier has been revoked away from platform', async () => {
    const supabase = makeSupabase([
      { github_repo: 'rickfelix/ehg.git', trust_tier: 'suspended' },
    ]);
    const gate = createRegistryNarrowedTrustGate(supabase);
    expect(await gate('rickfelix', 'ehg')).toBe(false);
  });

  it('falls back to the floor alone when no registry row matches, on DB error, or when no supabase client is supplied', async () => {
    const noMatch = createRegistryNarrowedTrustGate(makeSupabase([{ github_repo: 'rickfelix/marketlens', trust_tier: 'trusted' }]));
    expect(await noMatch('rickfelix', 'ehg')).toBe(true); // floor-eligible, no matching row — floor stands

    const dbError = createRegistryNarrowedTrustGate({ from: () => ({ select: () => ({ not: () => ({ order: () => ({ range: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) }) }) });
    expect(await dbError('rickfelix', 'ehg')).toBe(true);

    const noSupabase = createRegistryNarrowedTrustGate(null);
    expect(await noSupabase('rickfelix', 'ehg')).toBe(true);
    expect(await noSupabase('rickfelix', 'marketlens')).toBe(false); // floor still applies with no registry at all
  });
});

describe('attemptAutoMerge — C2 external-repo merge-gate (SECURITY VB-2)', () => {
  it('REFUSES a non-platform (venture) repo by default and never calls gh', async () => {
    const { runner, calls } = makeRunner([]); // any gh call would be "unmatched"
    const r = await attemptAutoMerge({
      prNumber: 7,
      repoOwner: 'rickfelix',
      repoName: 'commitcraft-ai', // a venture repo, not platform
      runner,
      logger: silentLogger,
    });
    expect(r.ok).toBe(false);
    expect(r.requiresHumanMerge).toBe(true);
    expect(r.reason).toMatch(/requires human merge/);
    expect(r.exitCode).toBe(0); // gated, not an error
    expect(calls).toHaveLength(0); // fail-closed BEFORE any gh invocation
  });

  it('REFUSES an unknown/unresolvable repo (fail-closed)', async () => {
    const { runner, calls } = makeRunner([]);
    const r = await attemptAutoMerge({ prNumber: 7, repoOwner: undefined, repoName: undefined, runner, logger: silentLogger });
    expect(r.ok).toBe(false);
    expect(r.requiresHumanMerge).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('ALLOWS a platform repo (proceeds to merge)', async () => {
    const { runner } = makeRunner([
      { match: argvMatchers.prViewIsDraft, result: { stdout: 'false\n' } },
      { match: argvMatchers.apiProtection, result: { stdout: 'false\n' } },
      { match: argvMatchers.prMerge, result: { stdout: '' } },
      { match: argvMatchers.prViewMergedAt, result: { stdout: mergedJson('2026-05-25T00:00:00Z') } },
      { match: argvMatchers.prViewState, result: { stdout: 'MERGED\n' } },
      { match: argvMatchers.prViewHeadRef, result: { stdout: 'feat/x\n' } },
      { match: argvMatchers.apiRefHead, result: { code: 1, stderr: 'Not Found (404)' } },
    ]);
    const r = await attemptAutoMerge({ prNumber: 7, repoOwner: 'rickfelix', repoName: 'ehg', runner, logger: silentLogger });
    expect(r.ok).toBe(true);
    expect(r.requiresHumanMerge).toBeUndefined();
  });

  it('allowExternalMerge:true overrides the gate for a non-platform repo', async () => {
    const { runner } = makeRunner([
      { match: argvMatchers.prViewIsDraft, result: { stdout: 'false\n' } },
      { match: argvMatchers.apiProtection, result: { stdout: 'false\n' } },
      { match: argvMatchers.prMerge, result: { stdout: '' } },
      { match: argvMatchers.prViewMergedAt, result: { stdout: mergedJson('2026-05-25T00:00:00Z') } },
      { match: argvMatchers.prViewState, result: { stdout: 'MERGED\n' } },
      { match: argvMatchers.prViewHeadRef, result: { stdout: 'feat/x\n' } },
      { match: argvMatchers.apiRefHead, result: { code: 1, stderr: 'Not Found (404)' } },
    ]);
    const r = await attemptAutoMerge({ prNumber: 7, repoOwner: 'someorg', repoName: 'someventure', runner, logger: silentLogger, allowExternalMerge: true });
    expect(r.ok).toBe(true);
  });

  it('honors an injected isTrustedRepo predicate', async () => {
    const { runner } = makeRunner([
      { match: argvMatchers.prViewIsDraft, result: { stdout: 'false\n' } },
      { match: argvMatchers.apiProtection, result: { stdout: 'false\n' } },
      { match: argvMatchers.prMerge, result: { stdout: '' } },
      { match: argvMatchers.prViewMergedAt, result: { stdout: mergedJson('2026-05-25T00:00:00Z') } },
      { match: argvMatchers.prViewState, result: { stdout: 'MERGED\n' } },
      { match: argvMatchers.prViewHeadRef, result: { stdout: 'feat/x\n' } },
      { match: argvMatchers.apiRefHead, result: { code: 1, stderr: 'Not Found (404)' } },
    ]);
    const r = await attemptAutoMerge({
      prNumber: 7, repoOwner: 'trusted', repoName: 'venture', runner, logger: silentLogger,
      isTrustedRepo: (o, n) => o === 'trusted' && n === 'venture',
    });
    expect(r.ok).toBe(true);
  });

  // SD-LEO-INFRA-SHIP-WITNESS-APPLICATIONS-001 (FR-2, FR-4): isTrustedRepo must
  // receive prNumber + {workKey, tier} so a per-PR witness predicate can be
  // evaluated, not just a repo-level allowlist check.
  it('invokes a custom isTrustedRepo predicate with (repoOwner, repoName, prNumber, {workKey, tier})', async () => {
    const { runner } = makeRunner([
      { match: argvMatchers.prViewIsDraft, result: { stdout: 'false\n' } },
      { match: argvMatchers.apiProtection, result: { stdout: 'false\n' } },
      { match: argvMatchers.prMerge, result: { stdout: '' } },
      { match: argvMatchers.prViewMergedAt, result: { stdout: mergedJson('2026-07-03T00:00:00Z') } },
      { match: argvMatchers.prViewState, result: { stdout: 'MERGED\n' } },
      { match: argvMatchers.prViewHeadRef, result: { stdout: 'feat/x\n' } },
      { match: argvMatchers.apiRefHead, result: { code: 1, stderr: 'Not Found (404)' } },
    ]);
    const calls = [];
    const isTrustedRepo = (...args) => { calls.push(args); return true; };
    const r = await attemptAutoMerge({
      prNumber: 42, repoOwner: 'rickfelix', repoName: 'marketlens', runner, logger: silentLogger,
      isTrustedRepo, workKey: 'SD-XXX-001', tier: 'standard',
    });
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('rickfelix');
    expect(calls[0][1]).toBe('marketlens');
    expect(calls[0][2]).toBe(42);
    expect(calls[0][3]).toEqual({ workKey: 'SD-XXX-001', tier: 'standard' });
  });

  // SD-LEO-INFRA-SHIP-WITNESS-ENFORCE-001 (FR-3, FR-4): the optional enforcementDecision hook
  // must be a true no-op when omitted (regression guard) and must refuse the merge BEFORE any
  // gh pr merge call when a caller-supplied decision returns action='block'.
  describe('enforcementDecision (Ship-witness D, optional pre-merge gate)', () => {
    it('omitting enforcementDecision behaves byte-identical to before this SD (no extra gh calls, merge proceeds)', async () => {
      const { runner, calls } = makeRunner([
        { match: argvMatchers.prViewIsDraft, result: { stdout: 'false\n' } },
        { match: argvMatchers.apiProtection, result: { stdout: 'false\n' } },
        { match: argvMatchers.prMerge, result: { stdout: '' } },
        { match: argvMatchers.prViewMergedAt, result: { stdout: mergedJson('2026-07-03T00:00:00Z') } },
        { match: argvMatchers.prViewState, result: { stdout: 'MERGED\n' } },
        { match: argvMatchers.prViewHeadRef, result: { stdout: 'feat/x\n' } },
        { match: argvMatchers.apiRefHead, result: { code: 1, stderr: 'Not Found (404)' } },
      ]);
      const r = await attemptAutoMerge({ prNumber: 55, repoOwner: 'rickfelix', repoName: 'ehg', runner, logger: silentLogger });
      expect(r.ok).toBe(true);
      // Sibling A's post-merge shadow-mode observe still fetches statusCheckRollup once
      // (pre-existing, unrelated to this SD) — the D pre-merge gate must NOT add a second
      // fetch when enforcementDecision is omitted.
      const rollupCalls = calls.filter((c) => c[0] === 'pr' && c.includes('statusCheckRollup'));
      expect(rollupCalls).toHaveLength(1);
    });

    it('refuses the merge BEFORE calling gh pr merge when enforcementDecision returns action=block', async () => {
      const { runner, calls } = makeRunner([
        { match: argvMatchers.prViewIsDraft, result: { stdout: 'false\n' } },
        { match: (a) => a[0] === 'pr' && a.includes('statusCheckRollup'), result: { stdout: '[]\n' } },
      ]);
      const enforcementDecision = async () => ({ action: 'block', reason: 'fixture block' });
      const r = await attemptAutoMerge({
        prNumber: 56, repoOwner: 'rickfelix', repoName: 'ehg', runner, logger: silentLogger, enforcementDecision,
      });
      expect(r.ok).toBe(false);
      expect(r.requiresHumanMerge).toBe(true);
      expect(r.reason).toMatch(/fixture block/);
      expect(calls.some((c) => c[0] === 'pr' && c[1] === 'merge')).toBe(false);
    });

    it('proceeds to merge when enforcementDecision returns action=observe or action=allow', async () => {
      const { runner } = makeRunner([
        { match: argvMatchers.prViewIsDraft, result: { stdout: 'false\n' } },
        { match: (a) => a[0] === 'pr' && a.includes('statusCheckRollup'), result: { stdout: '[]\n' } },
        { match: argvMatchers.apiProtection, result: { stdout: 'false\n' } },
        { match: argvMatchers.prMerge, result: { stdout: '' } },
        { match: argvMatchers.prViewMergedAt, result: { stdout: mergedJson('2026-07-03T00:00:00Z') } },
        { match: argvMatchers.prViewState, result: { stdout: 'MERGED\n' } },
        { match: argvMatchers.prViewHeadRef, result: { stdout: 'feat/x\n' } },
        { match: argvMatchers.apiRefHead, result: { code: 1, stderr: 'Not Found (404)' } },
      ]);
      const enforcementDecision = async () => ({ action: 'observe' });
      const r = await attemptAutoMerge({
        prNumber: 57, repoOwner: 'rickfelix', repoName: 'ehg', runner, logger: silentLogger, enforcementDecision,
      });
      expect(r.ok).toBe(true);
    });
  });
});
