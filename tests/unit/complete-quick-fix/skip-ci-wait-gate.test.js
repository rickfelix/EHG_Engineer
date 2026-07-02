// QF-20260702-515: --force-complete previously conflated bypassing self-verification
// WARNINGS with bypassing the wait-for-CI-green gate before merge — PR #5406 admin-merged
// while 8+ checks were still IN_PROGRESS. --force-complete now still auto-confirms the
// merge, but polls until no CI check is pending (and refuses to merge on a failed check).
// --skip-ci-wait is the separate, audited escape hatch that restores the old skip-the-wait
// behavior. Mirrors the mocking convention in sibling-parity-force-complete.test.js — mocks
// child_process.execSync so the tests never touch the real working tree or network.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const execSyncMock = vi.fn();
vi.mock('child_process', () => ({
  execSync: (...args) => execSyncMock(...args)
}));

const {
  mergeToMain,
  isCheckPending,
  isCheckFailed,
  summarizeCIStatus
} = await import('../../../scripts/modules/complete-quick-fix/git-operations.js');

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  execSyncMock.mockReset();
});

// ─── Pure decision functions — no IO, no mocking needed ───────────────────

describe('isCheckPending', () => {
  it('CheckRun shape: pending until status=COMPLETED', () => {
    expect(isCheckPending({ status: 'IN_PROGRESS' })).toBe(true);
    expect(isCheckPending({ status: 'QUEUED' })).toBe(true);
    expect(isCheckPending({ status: 'COMPLETED', conclusion: 'SUCCESS' })).toBe(false);
  });

  it('legacy StatusContext shape: pending only on PENDING/EXPECTED state', () => {
    expect(isCheckPending({ state: 'PENDING' })).toBe(true);
    expect(isCheckPending({ state: 'EXPECTED' })).toBe(true);
    expect(isCheckPending({ state: 'SUCCESS' })).toBe(false);
    expect(isCheckPending({ state: 'ERROR' })).toBe(false);
  });

  it('unknown shape defaults to not-pending (fail-open on shape, not on safety)', () => {
    expect(isCheckPending({})).toBe(false);
  });
});

describe('isCheckFailed', () => {
  it('CheckRun shape: FAILURE/TIMED_OUT/CANCELLED count as failed', () => {
    expect(isCheckFailed({ conclusion: 'FAILURE' })).toBe(true);
    expect(isCheckFailed({ conclusion: 'TIMED_OUT' })).toBe(true);
    expect(isCheckFailed({ conclusion: 'CANCELLED' })).toBe(true);
    expect(isCheckFailed({ conclusion: 'SUCCESS' })).toBe(false);
    expect(isCheckFailed({ conclusion: 'NEUTRAL' })).toBe(false);
  });

  it('legacy StatusContext shape: FAILURE/ERROR states count as failed', () => {
    expect(isCheckFailed({ state: 'FAILURE' })).toBe(true);
    expect(isCheckFailed({ state: 'ERROR' })).toBe(true);
    expect(isCheckFailed({ state: 'SUCCESS' })).toBe(false);
  });
});

describe('summarizeCIStatus', () => {
  it('empty/missing rollup summarizes as zero checks, not pending, not failed', () => {
    expect(summarizeCIStatus(undefined)).toEqual({ total: 0, pending: 0, failed: 0, isPending: false, hasFailed: false });
    expect(summarizeCIStatus([])).toEqual({ total: 0, pending: 0, failed: 0, isPending: false, hasFailed: false });
  });

  it('a mix of pending, passed, and failed checks is counted correctly', () => {
    const rollup = [
      { status: 'IN_PROGRESS' },
      { status: 'COMPLETED', conclusion: 'SUCCESS' },
      { status: 'COMPLETED', conclusion: 'FAILURE' },
      { state: 'SUCCESS' }
    ];
    const s = summarizeCIStatus(rollup);
    expect(s).toEqual({ total: 4, pending: 1, failed: 1, isPending: true, hasFailed: true });
  });

  it('all-passed rollup is neither pending nor failed', () => {
    const rollup = [{ status: 'COMPLETED', conclusion: 'SUCCESS' }, { state: 'SUCCESS' }];
    expect(summarizeCIStatus(rollup)).toEqual({ total: 2, pending: 0, failed: 0, isPending: false, hasFailed: false });
  });
});

// ─── mergeToMain behavioral gating ─────────────────────────────────────────

function mockGitAndGh({ statusCheckRollup }) {
  execSyncMock.mockImplementation((cmd) => {
    if (cmd.includes('rev-parse --abbrev-ref HEAD')) return 'qf/QF-TEST\n';
    if (cmd.includes('status --short')) return '';
    if (cmd.includes('--json statusCheckRollup')) {
      return JSON.stringify({ statusCheckRollup });
    }
    if (cmd.includes('--json mergeable,statusCheckRollup')) {
      return JSON.stringify({ mergeable: 'MERGEABLE', statusCheckRollup });
    }
    if (cmd.startsWith('gh pr merge')) return '';
    return '';
  });
}

describe('mergeToMain — CI-wait gate (QF-20260702-515)', () => {
  afterEach(() => vi.useRealTimers());

  it('force-complete with all-green CI merges immediately (no polling delay)', async () => {
    mockGitAndGh({ statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }] });
    const prompt = vi.fn();
    await mergeToMain('/fake', { id: 'QF-TEST' }, 'https://github.com/x/y/pull/42', prompt, {
      forceComplete: true, reason: 'audited'
    });
    expect(prompt).not.toHaveBeenCalled();
    expect(execSyncMock.mock.calls.some(([cmd]) => cmd.startsWith('gh pr merge'))).toBe(true);
  });

  it('force-complete refuses to merge when a required check has failed', async () => {
    mockGitAndGh({ statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'FAILURE' }] });
    let thrown = null;
    // mergeToMain catches its own internal errors and logs them (does not rethrow) —
    // assert via the absence of a merge call instead, matching its existing try/catch contract.
    await mergeToMain('/fake', { id: 'QF-TEST' }, 'https://github.com/x/y/pull/42', vi.fn(), {
      forceComplete: true, reason: 'audited'
    }).catch(e => { thrown = e; });
    expect(thrown).toBeNull(); // mergeToMain swallows and logs, per its existing contract
    expect(execSyncMock.mock.calls.some(([cmd]) => cmd.startsWith('gh pr merge'))).toBe(false);
  });

  it('force-complete + skip-ci-wait merges without checking CI status at all', async () => {
    mockGitAndGh({ statusCheckRollup: [{ status: 'IN_PROGRESS' }] }); // still pending — must not matter
    await mergeToMain('/fake', { id: 'QF-TEST' }, 'https://github.com/x/y/pull/42', vi.fn(), {
      forceComplete: true, skipCiWait: true, reason: 'audited-skip'
    });
    expect(execSyncMock.mock.calls.some(([cmd]) => cmd.startsWith('gh pr merge'))).toBe(true);
  });

  it('force-complete polls past a pending check and merges once it completes', async () => {
    vi.useFakeTimers();
    let call = 0;
    execSyncMock.mockImplementation((cmd) => {
      if (cmd.includes('rev-parse --abbrev-ref HEAD')) return 'qf/QF-TEST\n';
      if (cmd.includes('status --short')) return '';
      if (cmd.includes('--json statusCheckRollup')) {
        call += 1;
        const rollup = call === 1 ? [{ status: 'IN_PROGRESS' }] : [{ status: 'COMPLETED', conclusion: 'SUCCESS' }];
        return JSON.stringify({ statusCheckRollup: rollup });
      }
      if (cmd.includes('--json mergeable,statusCheckRollup')) {
        return JSON.stringify({ mergeable: 'MERGEABLE', statusCheckRollup: [] });
      }
      if (cmd.startsWith('gh pr merge')) return '';
      return '';
    });

    const mergePromise = mergeToMain('/fake', { id: 'QF-TEST' }, 'https://github.com/x/y/pull/42', vi.fn(), {
      forceComplete: true, reason: 'audited'
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await mergePromise;

    expect(call).toBeGreaterThanOrEqual(2);
    expect(execSyncMock.mock.calls.some(([cmd]) => cmd.startsWith('gh pr merge'))).toBe(true);
  });
});
