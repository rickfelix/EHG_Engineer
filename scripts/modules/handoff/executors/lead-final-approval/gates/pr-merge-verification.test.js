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
  // SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 (SECURITY EXEC finding SEC-1): the local-branch
  // diagnostic's `git ls-remote` call uses execFileSync (argv array, never a shell) instead of
  // execSync, closing a confirmed command-injection sink.
  execFileSync: vi.fn(),
}));
vi.mock('../../../../sd-type-checker.js', () => ({ getTierForSD: vi.fn(() => 3) }));
vi.mock('../../../retro-filters.js', () => ({ getFilteredRetrospective: vi.fn() }));
vi.mock('../../../../../lib/repo-paths.js', () => ({
  resolveRepoPath: vi.fn((name) => `/fake/${name}`),
  resolveGitHubRepo: vi.fn(() => null),
  ENGINEER_ROOT: '/fake/EHG_Engineer',
}));

import { execSync, execFileSync } from 'child_process';
import { createPRMergeVerificationGate } from '../gates.js';

const SD = 'SD-MAN-ORCH-TEST-001';
// SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 (TR-7): sdType parameterized (default preserves every
// existing call site) so TS-2's documentation-type fixture is writable.
const makeCtx = (sdKey = SD, sdType = 'infrastructure') => ({
  sd: { id: 'test-uuid', sd_key: sdKey, sd_type: sdType },
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

/**
 * SD-LEO-FIX-LEAD-FINAL-APPROVAL-001 (FR-1a): the gate now issues some calls via execFileSync
 * (argv array, never a shell) instead of execSync (shell string) for the fixed injection sinks
 * (git rev-list --count at :887, gh pr list --head at :898, gh pr list --repo Scan A/C at
 * :601/:761/:1048). This helper reconstructs an equivalent command STRING from an
 * execFileSync(file, args) call so every test's existing string-matching dispatch function keeps
 * working for BOTH mock shapes -- wiring both mocks to the SAME dispatch closure so a test cannot
 * silently stop covering a scenario it used to cover, which is the exact "mock goes quietly dead
 * on a converted call site" bug class this SD exists to prevent (verified: without this, 8 of 14
 * tests in this file broke silently-green on the earlier all-execSync mock alone).
 */
function mockBothExecs(dispatch) {
  execSync.mockImplementation(dispatch);
  execFileSync.mockImplementation((file, args) => dispatch([file, ...(args || [])].join(' ')));
}

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
    mockBothExecs(() => '');
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
    mockBothExecs((cmd) => {
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
    mockBothExecs((cmd) => {
      if (cmd.startsWith('gh pr list') && cmd.includes('--state open')) return '[]';
      if (cmd.startsWith('git fetch')) return '';
      if (cmd === 'git branch -r') return `  origin/feat/${OTHER}-work\n  origin/main\n  origin/HEAD -> origin/main`;
      if (cmd.includes('rev-list --count')) return '9';
      if (cmd.includes('gh pr list --head')) return '[]';
      // SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 (FR-1/FR-3): this SD has genuinely shipped code
      // (a merged PR) — that positive evidence, not merely "no open PR / no unmerged branch", is
      // why the verdict below is correctly PASS rather than never-pushed. Without this stub the
      // new Scan C would find nothing and the third state would flip this to FAIL.
      if (cmd.startsWith('gh pr list --repo') && cmd.includes('--state merged')) {
        return JSON.stringify([{ number: 55, headRefName: `feat/${SD}`, url: 'u', mergedAt: '2026-01-01' }]);
      }
      return '';
    });
    const result = await gateWith(keys(SD, OTHER)).validator(makeCtx());
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  it('detects unmerged branches with commits ahead of main — including SUFFIXED branches', async () => {
    // The assertion the quarantine buried. Under the anchored matcher this returned passed:true.
    mockBothExecs((cmd) => {
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
    mockBothExecs((cmd) => {
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
    mockBothExecs((cmd) => {
      if (cmd.startsWith('gh pr list') && cmd.includes('--state open')) return '[]';
      if (cmd.startsWith('git fetch')) return '';
      if (cmd === 'git branch -r') return `  origin/feat/${CHILD}\n  origin/main`;
      if (cmd.includes('rev-list --count')) return '7';
      if (cmd.includes('gh pr list --head')) return '[]';
      // SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 (FR-1/FR-3): the PARENT's own merged-PR
      // evidence. The assertion below expects PASS because the parent has genuinely shipped, not
      // merely because the child's open branch doesn't block it. The CHILD assertion never reaches
      // this Scan C stub — its own branch is unmerged and blocks earlier in the gate.
      if (cmd.startsWith('gh pr list --repo') && cmd.includes('--state merged')) {
        return JSON.stringify([{ number: 77, headRefName: `feat/${SD}`, url: 'u', mergedAt: '2026-01-01' }]);
      }
      return '';
    });
    expect((await gateWith(keys(SD, CHILD)).validator(makeCtx(SD))).passed).toBe(true);
    // Negative control: same branch, child under test, opposite verdict.
    expect((await gateWith(keys(SD, CHILD)).validator(makeCtx(CHILD))).passed).toBe(false);
  });

  // SD-LEO-INFRA-MERGE-VERIFICATION-NEVER-001 (FR-1, TS-1). Asserts a structured discriminator, not
  // merely passed===false — both test files fully mock sd-type-checker.js, so an unrelated crash in
  // the outer catch (gates.js) would ALSO read as passed:false with zero never-pushed logic present.
  it('TS-1: infrastructure-type SD with zero evidence anywhere FAILS with a structured reason', async () => {
    mockBothExecs((cmd) => {
      if (cmd.startsWith('gh pr list') && cmd.includes('--state open')) return '[]';
      if (cmd.startsWith('git fetch')) return '';
      if (cmd === 'git branch -r') return '  origin/main\n';
      if (cmd.startsWith('gh pr list --repo') && cmd.includes('--state merged')) return '[]';
      if (cmd.includes('git for-each-ref')) return '';
      return '';
    });
    const result = await gateWith(keys(SD)).validator(makeCtx(SD, 'infrastructure'));
    expect(result.passed).toBe(false);
    expect(result.details?.reason).toBe('never_pushed');
    expect(result.issues.join('\n')).toMatch(/no branch was ever pushed/i);
    expect(result.issues.join('\n')).toContain(SD);
  });

  // TS-2: the corrected, narrow exemption (FR-2) still exempts genuinely no-code SD types — a
  // documentation-type SD with the SAME zero-evidence fixture as TS-1 must PASS, not FAIL.
  it('TS-2: documentation-type SD with zero evidence anywhere still PASSES (exemption)', async () => {
    mockBothExecs((cmd) => {
      if (cmd.startsWith('gh pr list') && cmd.includes('--state open')) return '[]';
      if (cmd.startsWith('git fetch')) return '';
      if (cmd === 'git branch -r') return '  origin/main\n';
      if (cmd.startsWith('gh pr list --repo') && cmd.includes('--state merged')) return '[]';
      return '';
    });
    const result = await gateWith(keys(SD)).validator(makeCtx(SD, 'documentation'));
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  // TS-5: the blocking false-positive control. Does NOT exist prior to this SD — the original FR-1
  // design ("both remote scans zero => FAIL") was measured (TESTING PLAN-phase probe) to be
  // byte-identical between this fixture and TS-1's never-pushed fixture. Scan C (merged-PR
  // evidence) is what tells them apart.
  it('TS-5: merged-and-branch-deleted SD (normal /ship --delete-branch outcome) PASSES', async () => {
    mockBothExecs((cmd) => {
      if (cmd.startsWith('gh pr list') && cmd.includes('--state open')) return '[]';
      if (cmd.startsWith('git fetch')) return '';
      if (cmd === 'git branch -r') return '  origin/main\n'; // branch deleted post-merge
      if (cmd.startsWith('gh pr list --repo') && cmd.includes('--state merged')) {
        return JSON.stringify([{ number: 88, headRefName: `feat/${SD}`, url: 'u', mergedAt: '2026-01-01' }]);
      }
      return '';
    });
    const result = await gateWith(keys(SD)).validator(makeCtx(SD, 'infrastructure'));
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  // TESTING EXEC-phase finding (row d0b12eb8): Scan C without --search only sees the 100
  // most-recently-merged PRs repo-wide and false-positives an aged-out SD as never_pushed. Locks
  // in the fix by asserting the actual command carries --search "<sdId>" — a regression here would
  // silently reintroduce the exact false-positive class TS-5 exists to prevent.
  it('Scan C is search-scoped to the SD key, not an unbounded repo-wide list', async () => {
    let scanCCommand = null;
    mockBothExecs((cmd) => {
      if (cmd.startsWith('gh pr list') && cmd.includes('--state open')) return '[]';
      if (cmd.startsWith('git fetch')) return '';
      if (cmd === 'git branch -r') return '  origin/main\n';
      if (cmd.startsWith('gh pr list --repo') && cmd.includes('--state merged')) {
        scanCCommand = cmd;
        return JSON.stringify([{ number: 99, headRefName: `feat/${SD}`, url: 'u', mergedAt: '2026-01-01' }]);
      }
      return '';
    });
    const result = await gateWith(keys(SD)).validator(makeCtx(SD, 'infrastructure'));
    expect(result.passed).toBe(true);
    // SD-LEO-FIX-LEAD-FINAL-APPROVAL-001 (FR-1, FR-1a): Scan C is now execFileSync-array, so the
    // sdId arrives as its own argv element with no surrounding shell-quoting — asserted via the
    // reconstructed command string (unquoted, unlike the old shell form) AND directly via the
    // mock's actual call arguments, which is the platform-independent, cannot-false-green proof.
    expect(scanCCommand).toContain(`--search ${SD}`);
    expect(execFileSync).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['--search', SD]),
      expect.any(Object),
    );
  });

  // TESTING EXEC-phase coverage gap (medium): the localCandidate-populated branch of the
  // diagnostic-only local-branch enumeration was previously only ever exercised in its EMPTY form.
  it('names a local, never-pushed branch in the message when git for-each-ref finds one', async () => {
    mockBothExecs((cmd) => {
      if (cmd.startsWith('gh pr list') && cmd.includes('--state open')) return '[]';
      if (cmd.startsWith('git fetch')) return '';
      if (cmd === 'git branch -r') return '  origin/main\n';
      if (cmd.startsWith('gh pr list --repo') && cmd.includes('--state merged')) return '[]';
      if (cmd.includes('git for-each-ref')) return `feat/${SD}\nmain\n`;
      return '';
    });
    // execFileSync('git', ['ls-remote', '--heads', 'origin', '--', branch], opts) — argv form, not
    // a string command (SEC-1 fix). mockBothExecs' dispatch falls through to `return ''` for this
    // reconstructed command (no explicit handler above matches 'ls-remote'), matching the old
    // "empty output = branch not found on remote" behavior without a separate override that would
    // otherwise clobber the Scan A/C dispatch wiring this test also needs.
    const result = await gateWith(keys(SD)).validator(makeCtx(SD, 'infrastructure'));
    expect(result.passed).toBe(false);
    expect(result.details?.localCandidate).toBe(`feat/${SD}`);
    expect(result.issues.join('\n')).toContain(`Local branch found but never pushed to remote: feat/${SD}`);
    expect(execFileSync).toHaveBeenCalledWith('git', ['ls-remote', '--heads', 'origin', '--', `feat/${SD}`], expect.any(Object));
  });

  // TESTING EXEC-phase finding (medium): a transient gh failure during Scan C must fail closed,
  // not silently read as "no merge evidence" (which would mislabel an outage as never_pushed).
  it('Scan C failure fails closed rather than reporting never_pushed', async () => {
    mockBothExecs((cmd) => {
      if (cmd.startsWith('gh pr list') && cmd.includes('--state open')) return '[]';
      if (cmd.startsWith('git fetch')) return '';
      if (cmd === 'git branch -r') return '  origin/main\n';
      if (cmd.startsWith('gh pr list --repo') && cmd.includes('--state merged')) {
        throw new Error('gh: rate limit exceeded');
      }
      return '';
    });
    const result = await gateWith(keys(SD)).validator(makeCtx(SD, 'infrastructure'));
    expect(result.passed).toBe(false);
    expect(result.details?.reason).toBe('scan_c_unreadable');
    expect(result.details?.reason).not.toBe('never_pushed');
  });

  // SECURITY EXEC-phase finding SEC-9 (medium, self-referential): --search matches the SD key
  // anywhere in a PR title/body/comments, not only the owning branch; --limit caps the RAW result
  // set BEFORE branchBelongsToSd filtering. A saturated (100-item) raw set that filters to zero
  // owned matches must be reported as "cannot conclude", not "never_pushed".
  it('a saturated Scan C search window (100 raw hits, zero owned matches) fails closed as inconclusive, not never_pushed', async () => {
    const saturatedResults = Array.from({ length: 100 }, (_, i) => ({
      number: i, headRefName: `feat/SD-SOME-OTHER-KEY-${i}`, url: 'u', mergedAt: '2026-01-01',
    }));
    mockBothExecs((cmd) => {
      if (cmd.startsWith('gh pr list') && cmd.includes('--state open')) return '[]';
      if (cmd.startsWith('git fetch')) return '';
      if (cmd === 'git branch -r') return '  origin/main\n';
      if (cmd.startsWith('gh pr list --repo') && cmd.includes('--state merged')) {
        return JSON.stringify(saturatedResults);
      }
      return '';
    });
    const result = await gateWith(keys(SD)).validator(makeCtx(SD, 'infrastructure'));
    expect(result.passed).toBe(false);
    expect(result.details?.reason).toBe('scan_c_saturated');
    expect(result.details?.reason).not.toBe('never_pushed');
  });

  // TESTING EXEC-phase finding (high): the live gate must actually CALL isNeverPushedSpecimen
  // (not merely claim to share it) — a ship_review_findings row is one more chance for an SD Scan
  // A/B/C's live git/gh state missed to avoid a false never_pushed verdict.
  it('a ship_review_findings row (pr_number) saves an SD from a false never_pushed verdict', async () => {
    mockBothExecs((cmd) => {
      if (cmd.startsWith('gh pr list') && cmd.includes('--state open')) return '[]';
      if (cmd.startsWith('git fetch')) return '';
      if (cmd === 'git branch -r') return '  origin/main\n';
      if (cmd.startsWith('gh pr list --repo') && cmd.includes('--state merged')) return '[]';
      return '';
    });
    const fakeSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: async () => ({ data: [{ id: 'row-1', pr_number: 4242, sd_key: SD }] }),
          }),
        }),
      }),
    };
    const gate = createPRMergeVerificationGate(fakeSupabase, { loadKeySet: keys(SD) });
    const result = await gate.validator(makeCtx(SD, 'infrastructure'));
    expect(result.passed).toBe(true);
  });

  // SD-LEO-FIX-LEAD-FINAL-APPROVAL-001 (FR-1a, TESTING recommendation): platform-and-payload
  // -independent regression guard. tests/unit/lead-final-approval-injection-fix.test.js proves
  // execFileSync-with-these-argv-shapes is immune to injection as a GENERAL fact, but does not
  // import gates.js, so it cannot detect a future regression back to execSync there. THIS
  // assertion is the one that actually binds to the real gate: it fails immediately and loudly
  // if the branch-name/repo/sdId sinks this SD fixed are ever changed back to a shell string,
  // regardless of payload choice or host platform.
  it('the branch-name, repo, and sdId sinks never call execSync (only execFileSync)', async () => {
    mockBothExecs((cmd) => {
      if (cmd.startsWith('gh pr list') && cmd.includes('--state open')) return '[]';
      if (cmd.startsWith('git fetch')) return '';
      if (cmd === 'git branch -r') return `  origin/feat/${SD}-thing\n  origin/main`;
      if (cmd.includes('rev-list --count')) return '3';
      if (cmd.includes('gh pr list --head')) return JSON.stringify([{ number: 42 }]);
      if (cmd.startsWith('gh pr list --repo') && cmd.includes('--state merged')) return '[]';
      return '';
    });
    await gateWith(keys(SD)).validator(makeCtx(SD, 'infrastructure'));
    // execSync IS still legitimately called for git fetch / git branch -r (untouched, literal
    // strings, no interpolation) -- the assertion is on the SPECIFIC converted call shapes, not
    // a blanket "execSync never called".
    const shellCalls = execSync.mock.calls.map(([cmd]) => cmd);
    expect(shellCalls.some((c) => c.includes('rev-list --count')), 'rev-list --count must never reach execSync').toBe(false);
    expect(shellCalls.some((c) => c.includes('gh pr list --head')), 'gh pr list --head must never reach execSync').toBe(false);
    expect(shellCalls.some((c) => c.startsWith('gh pr list --repo')), 'gh pr list --repo (Scan A/C) must never reach execSync').toBe(false);
    // And the converse: execFileSync WAS actually called for each (not simply unreached).
    expect(execFileSync).toHaveBeenCalledWith('git', expect.arrayContaining(['rev-list', '--count']), expect.any(Object));
    expect(execFileSync).toHaveBeenCalledWith('gh', expect.arrayContaining(['--head']), expect.any(Object));
  });
});
