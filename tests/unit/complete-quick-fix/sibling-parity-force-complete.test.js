// QF-20260509-552: 3 sibling-parity fixes for --force-complete + branchName scope.
//
// Cluster:
//   (1) validateTests at verification.js:107 missed --force-complete short-circuit
//       — sibling of QF-407 fix (validateCompliance) and SD-FDBK FR-2
//       (validateLOC + validateSelfVerification).
//   (2) mergeToMain prompt at git-operations.js:494 wedges under --non-interactive
//       even with --force-complete. 7th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.
//       Sibling commit/push prompts in commitAndPushChanges fixed for completeness.
//   (3) commitAndPushChanges line 379 assigned to undeclared `branchName` — JSDoc
//       lists gitInfo.branchName but destructure on line 375 only pulled commitSha
//       → ReferenceError on `git status` check. Closes feedback 776a3dce.
//
// Note: git-operations functions invoke execSync which would mutate the real
// working tree if cwd were '.'. We mock child_process.execSync so the tests
// stay pure (witnessed: pre-mock version of this file caused a real commit +
// push to qf/QF-20260509-552 during the test run).

import { describe, it, expect, vi, beforeEach } from 'vitest';

// execSync({encoding:'utf-8'}) returns a string at runtime; mock matches.
vi.mock('child_process', () => ({
  execSync: vi.fn((cmd) => {
    if (cmd.includes('rev-parse --abbrev-ref HEAD')) return 'qf/QF-TEST\n';
    if (cmd.includes('status --short')) return ''; // no uncommitted changes = early return path
    return '';
  })
}));

const { validateTests } = await import(
  '../../../scripts/modules/complete-quick-fix/verification.js'
);
const { commitAndPushChanges, mergeToMain } = await import(
  '../../../scripts/modules/complete-quick-fix/git-operations.js'
);

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('QF-20260509-552 #1: validateTests honors {forceComplete}', () => {
  it('returns true when tests pass (baseline)', () => {
    const r = validateTests({ passed: true }, { passed: true }, true);
    expect(r).toBe(true);
  });

  it('returns false when tests fail and no flags (legacy gate behavior)', () => {
    const r = validateTests({ passed: false }, { passed: true }, false);
    expect(r).toBe(false);
  });

  it('returns false when tests fail and flags object empty (default {} arg)', () => {
    const r = validateTests({ passed: false }, { passed: false }, false, {});
    expect(r).toBe(false);
  });

  it('returns true when tests fail BUT flags.forceComplete is set', () => {
    const r = validateTests({ passed: false }, { passed: true }, false, {
      forceComplete: true,
      reason: 'PR already merged, retroactive completion'
    });
    expect(r).toBe(true);
  });

  it('logs the reason in audit trail when bypassing', () => {
    const logs = [];
    vi.spyOn(console, 'log').mockImplementation((m) => logs.push(m));
    validateTests({ passed: false }, { passed: false }, false, {
      forceComplete: true,
      reason: 'audit-test-reason'
    });
    expect(logs.some(l => typeof l === 'string' && l.includes('audit-test-reason'))).toBe(true);
    expect(logs.some(l => typeof l === 'string' && l.includes('--force-complete'))).toBe(true);
  });
});

describe('QF-20260509-552 #2: mergeToMain auto-confirms under --force-complete', () => {
  it('default flags ({}) prompts for merge confirmation', async () => {
    const prompt = vi.fn(async () => 'no');
    await mergeToMain('/fake', { id: 'QF-TEST' }, null, prompt);
    expect(prompt).toHaveBeenCalled();
  });

  it('flags.forceComplete=true SKIPS the merge confirmation prompt', async () => {
    const prompt = vi.fn(async () => { throw new Error('prompt should not be called when forceComplete is set'); });
    let promptThrew = false;
    try {
      await mergeToMain('/fake', { id: 'QF-TEST' }, null, prompt, {
        forceComplete: true,
        reason: 'force-merge-audit'
      });
    } catch (e) {
      if (/prompt should not be called/.test(e.message)) promptThrew = true;
    }
    expect(promptThrew).toBe(false);
    expect(prompt).not.toHaveBeenCalled();
  });
});

describe('QF-20260509-552 #3: commitAndPushChanges branchName scope fix', () => {
  it('does not throw ReferenceError on branchName when called', async () => {
    // Pre-fix: line 379 `branchName = currentBranch;` referenced an undeclared
    // identifier, causing ReferenceError. With the fix (`let { commitSha,
    // branchName } = gitInfo;` on line 375) the assignment is valid.
    const prompt = vi.fn(async () => 'no');
    let referenceErrorOnBranchName = false;
    try {
      await commitAndPushChanges('/fake', { id: 'QF-TEST', title: 'test', type: 'bug', severity: 'low' },
        { commitSha: 'abc1234', branchName: 'qf/QF-TEST' },
        10, ['file.js'], 'https://github.com/x/y/pull/1', true, prompt);
    } catch (e) {
      if (e instanceof ReferenceError && /branchName/.test(e.message)) {
        referenceErrorOnBranchName = true;
      }
    }
    expect(referenceErrorOnBranchName).toBe(false);
  });

  it('accepts the new flags arg without TypeError on signature', async () => {
    const prompt = vi.fn(async () => 'no');
    let typeErr = null;
    try {
      await commitAndPushChanges('/fake', { id: 'QF-TEST', title: 'test', type: 'bug', severity: 'low' },
        { commitSha: 'abc1234', branchName: 'qf/QF-TEST' },
        10, ['file.js'], 'https://github.com/x/y/pull/1', true, prompt,
        { forceComplete: true, reason: 'test-flags-arg' });
    } catch (e) {
      if (e instanceof TypeError) typeErr = e;
    }
    expect(typeErr).toBeNull();
  });
});
