import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * SD-LEO-INFRA-HANDOFF-MERGE-MAIN-001 (original) + SD-LEO-INFRA-RESUME-FINAL-READ-001 (FR-5).
 *
 * WHY THIS FILE WAS QUARANTINED, WHICH IS THE POINT OF THE SD THAT UN-QUARANTINED IT.
 * Written 2026-04-26, it drove the gate with a SUFFIXED branch
 * (origin/feat/SD-MAN-ORCH-TEST-001-thing against key SD-MAN-ORCH-TEST-001) and asserted the gate
 * BLOCKS. A month later QF-20260509-PRMERGE-EXACT anchored the branch matcher to
 * `^(feat|fix|docs|test)/<key>$`, which made that branch invisible — so the gate returned
 * passed:true and these tests necessarily went red. On 2026-06-11 the file was quarantined with
 * reason_class "assertion-drift": a label asserting the TEST was stale. It was not. The CODE had
 * regressed, and the test caught it on schedule.
 *
 * Two months later the same blind spot let an SD complete with an OPEN PR unmerged. The regression
 * was never undetected — it was detected and shelved.
 *
 * The matcher is now ownership resolution against the SD key set (lib/git/branch-owner.js), which
 * is why these assertions are correct again. A bounded regex widen cannot work: for key K and child
 * key K-x the string <type>/K-x is simultaneously a suffixed branch of K and the canonical branch
 * of K-x, so no function of the branch NAME is two-sided.
 *
 * Un-quarantining was ONE change — deleting the tests/quarantine-manifest.json entry. The vitest
 * exclude list is DERIVED from that manifest (vitest.config.js loadQuarantineExclude), so there is
 * no second list; an earlier draft of this SD's PRD claimed there was and required editing an
 * artifact that does not exist.
 */

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));
vi.mock('../../../../sd-type-checker.js', () => ({ getTierForSD: vi.fn(() => 3) }));
vi.mock('../../../retro-filters.js', () => ({ getFilteredRetrospective: vi.fn() }));
vi.mock('../../../../../lib/repo-paths.js', () => ({
  resolveRepoPath: vi.fn((name) => `/fake/${name}`),
  resolveGitHubRepo: vi.fn(() => null),
  ENGINEER_ROOT: '/fake/EHG_Engineer',
}));

import { execSync } from 'child_process';
import { createPRMergeVerificationGate } from '../gates.js';

const SD = 'SD-MAN-ORCH-TEST-001';
const makeCtx = (sdKey = SD) => ({
  sd: { id: 'test-uuid', sd_key: sdKey, sd_type: 'infrastructure' },
  sdId: 'test-uuid',
});

// Injected key-set loader. Keeps every case in the unit tier — a DB-backed loader would file this
// suite under the vitest `db` project, which runs zero files when no non-production target is
// designated, i.e. a test that cannot fire, in the SD about tests that cannot fire.
const keys = (...k) => async () => ({ ok: true, keys: new Set(k), reason: 'resolved', error: null });
const keysUnavailable = (error = 'simulated outage') => async () => ({
  ok: false, keys: new Set(), reason: 'key_set_unavailable', error,
});
const gateWith = (loadKeySet) => createPRMergeVerificationGate(null, { loadKeySet });

describe('createPRMergeVerificationGate fail-closed behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  // REPLACES the it.skip that stood here. That test was skipped for a sound reason: the outer catch
  // wraps `await import('child_process')` plus orchestration, every inner call site has its own
  // try, so the outer catch was unreachable in vitest and the assertion could never run. The
  // key-set load introduced a REACHABLE pre-try failure with the same fail-closed obligation, so
  // the thing the skip wanted to cover now exists and is tested rather than deferred.
  it('key-set unavailable fails closed, attributably to the resolver', async () => {
    execSync.mockImplementation(() => '');
    const result = await gateWith(keysUnavailable('db unreachable')).validator(makeCtx());
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    // details.resolver, not just passed===false: the outer catch ALSO fails closed, so a bare
    // passed===false assertion would pass with no resolver logic at all. This is the discriminator.
    expect(result.details?.resolver).toBe(true);
    expect(result.details?.reason).toBe('key_set_unavailable');
    expect(result.issues.join('\n')).toMatch(/db unreachable/);
  });

  it('inner branch-comparison error marks branch unverified and blocks completion', async () => {
    execSync.mockImplementation((cmd) => {
      if (cmd.startsWith('gh pr list') && cmd.includes('--state open')) return '[]';
      if (cmd.startsWith('git fetch')) return '';
      if (cmd === 'git branch -r') return `  origin/feat/${SD}-thing\n  origin/main`;
      if (cmd.includes('rev-list --count')) throw new Error('fatal: bad revision');
      if (cmd.includes('gh pr list --head')) return '[]';
      return '';
    });
    const result = await gateWith(keys(SD)).validator(makeCtx());
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details?.unverifiedCount).toBeGreaterThanOrEqual(1);
    expect(result.issues.join('\n')).toMatch(/UNVERIFIED/);
  });

  // WAS INERT. The old version listed only origin/main + origin/HEAD, so it passed under ANY
  // matcher — including a broken one — and could never indicate which world it was in. It now
  // includes a branch belonging to a DIFFERENT key, so passing means the resolver correctly
  // EXCLUDED it rather than merely finding nothing.
  it('happy path: passes when the only branches belong to other SDs', async () => {
    const OTHER = 'SD-MAN-ORCH-OTHER-002';
    execSync.mockImplementation((cmd) => {
      if (cmd.startsWith('gh pr list') && cmd.includes('--state open')) return '[]';
      if (cmd.startsWith('git fetch')) return '';
      if (cmd === 'git branch -r') return `  origin/feat/${OTHER}-work\n  origin/main\n  origin/HEAD -> origin/main`;
      if (cmd.includes('rev-list --count')) return '9';
      if (cmd.includes('gh pr list --head')) return '[]';
      return '';
    });
    const result = await gateWith(keys(SD, OTHER)).validator(makeCtx());
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  it('detects unmerged branches with commits ahead of main — including SUFFIXED branches', async () => {
    // The assertion the quarantine buried. Under the anchored matcher this returned passed:true.
    execSync.mockImplementation((cmd) => {
      if (cmd.startsWith('gh pr list') && cmd.includes('--state open')) return '[]';
      if (cmd.startsWith('git fetch')) return '';
      if (cmd === 'git branch -r') return `  origin/feat/${SD}-thing\n  origin/main`;
      if (cmd.includes('rev-list --count')) return '5';
      if (cmd.includes('gh pr list --head')) return '[]';
      return '';
    });
    const result = await gateWith(keys(SD)).validator(makeCtx());
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues.join('\n')).toMatch(/5 commits/);
  });

  // WAS VACUOUS, and only becomes meaningful now. It passed under the anchored matcher because the
  // branch was filtered out BEFORE the merged-PR whitelist ran — green for the wrong reason, and
  // identical before and after the fix. With the branch now visible, the whitelist path actually
  // executes, so this is the first version of this test that exercises what it claims to.
  it('squash-merge artifact (branch + merged PR) passes — whitelist actually runs now', async () => {
    let headQueried = false;
    execSync.mockImplementation((cmd) => {
      if (cmd.startsWith('gh pr list') && cmd.includes('--state open')) return '[]';
      if (cmd.startsWith('git fetch')) return '';
      if (cmd === 'git branch -r') return `  origin/feat/${SD}-thing\n  origin/main`;
      if (cmd.includes('rev-list --count')) return '3';
      if (cmd.includes('gh pr list --head')) { headQueried = true; return JSON.stringify([{ number: 42 }]); }
      return '';
    });
    const result = await gateWith(keys(SD)).validator(makeCtx());
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    // Without this the test would still pass if the branch were filtered out before the whitelist,
    // which is exactly how it passed for the two months it was quarantined.
    expect(headQueried).toBe(true);
  });

  it('a CHILD key branch does not block the parent', async () => {
    const CHILD = `${SD}-A`;
    execSync.mockImplementation((cmd) => {
      if (cmd.startsWith('gh pr list') && cmd.includes('--state open')) return '[]';
      if (cmd.startsWith('git fetch')) return '';
      if (cmd === 'git branch -r') return `  origin/feat/${CHILD}\n  origin/main`;
      if (cmd.includes('rev-list --count')) return '7';
      if (cmd.includes('gh pr list --head')) return '[]';
      return '';
    });
    expect((await gateWith(keys(SD, CHILD)).validator(makeCtx(SD))).passed).toBe(true);
    // Negative control: same branch, child under test, opposite verdict.
    expect((await gateWith(keys(SD, CHILD)).validator(makeCtx(CHILD))).passed).toBe(false);
  });
});
