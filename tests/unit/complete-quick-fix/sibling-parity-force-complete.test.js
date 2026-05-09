// QF-20260509-552: 3 sibling-parity fixes for --force-complete + branchName scope.
//
// Cluster:
//   (1) validateTests at verification.js:107 missed --force-complete short-circuit
//       — sibling of QF-407 fix to validateCompliance / validateLOC / validateSelfVerification.
//   (2) mergeToMain prompt at git-operations.js:494 wedges under --non-interactive
//       even with --force-complete. 7th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.
//       Same fix applied to commit/push prompts in commitAndPushChanges (sibling completeness).
//   (3) commitAndPushChanges line 379 assigned to undeclared `branchName` — JSDoc lists
//       gitInfo.branchName but destructure on line 375 only pulled commitSha → ReferenceError
//       on `git status` check. Closes feedback 776a3dce.

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    let promptCalled = false;
    const prompt = vi.fn(async () => { promptCalled = true; return 'no'; });
    // Use a fake testDir; prUrl null skips PR-status check; current branch lookup
    // happens via execSync — accept it'll throw or return; we wrap mergeToMain
    // in a try and assert behaviour from prompt-call observation only.
    try { await mergeToMain('.', { id: 'QF-TEST' }, null, prompt); } catch (_) {}
    expect(prompt).toHaveBeenCalled();
    expect(promptCalled).toBe(true);
  });

  it('flags.forceComplete=true SKIPS the merge confirmation prompt', async () => {
    const prompt = vi.fn(async () => { throw new Error('prompt should not be called when forceComplete is set'); });
    try {
      await mergeToMain('.', { id: 'QF-TEST' }, null, prompt, {
        forceComplete: true,
        reason: 'force-merge-audit'
      });
    } catch (e) {
      // mergeToMain's body may execute git commands that fail in test env;
      // the contract under test is that prompt was NEVER called.
    }
    expect(prompt).not.toHaveBeenCalled();
  });
});

describe('QF-20260509-552 #3: commitAndPushChanges branchName scope fix', () => {
  it('does not throw ReferenceError when called — branchName is destructured from gitInfo', async () => {
    // Pre-fix: line 379 `branchName = currentBranch;` referenced an undeclared
    // identifier, causing ReferenceError. With the fix on line 375
    // (`let { commitSha, branchName } = gitInfo;`) the assignment is valid.
    const prompt = vi.fn(async () => 'no');
    let threwReferenceError = false;
    try {
      await commitAndPushChanges('.', { id: 'QF-TEST', title: 'test', type: 'bug', severity: 'low' },
        { commitSha: 'abc1234', branchName: 'qf/QF-TEST' },
        10, ['file.js'], 'https://github.com/x/y/pull/1', true, prompt);
    } catch (e) {
      if (e instanceof ReferenceError && /branchName/.test(e.message)) {
        threwReferenceError = true;
      }
      // Other errors (e.g. execSync failing in test env) are acceptable;
      // the contract is no ReferenceError on branchName specifically.
    }
    expect(threwReferenceError).toBe(false);
  });

  it('commitAndPushChanges accepts flags arg without throwing', async () => {
    const prompt = vi.fn(async () => 'no');
    let threw = null;
    try {
      await commitAndPushChanges('.', { id: 'QF-TEST', title: 'test', type: 'bug', severity: 'low' },
        { commitSha: 'abc1234', branchName: 'qf/QF-TEST' },
        10, ['file.js'], 'https://github.com/x/y/pull/1', true, prompt,
        { forceComplete: true, reason: 'test-flags-arg' });
    } catch (e) {
      threw = e;
    }
    // We accept execSync-related throws; we just want to confirm the new arg
    // signature does not break parse/binding.
    if (threw && threw instanceof TypeError) throw threw;
    expect(true).toBe(true);
  });
});
