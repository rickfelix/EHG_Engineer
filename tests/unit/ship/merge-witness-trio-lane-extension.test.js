/**
 * SD-LEO-INFRA-SHIP-WITNESS-TRIO-001 FR-1
 * TS-1/TS-2: quick-fix's mergeToMain() and worktree-merge.js's observation
 * wrappers call the shared observeMergeWorkLadder() with the right lane, and
 * a failure inside it never throws out of the wrapper (non-blocking).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const observeMergeWorkLadderMock = vi.fn();
vi.mock('../../../lib/ship/auto-merge.mjs', () => ({
  observeMergeWorkLadder: (...args) => observeMergeWorkLadderMock(...args),
}));

const createSupabaseServiceClientMock = vi.fn(() => ({ from: () => ({}) }));
vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: (...args) => createSupabaseServiceClientMock(...args),
}));

beforeEach(() => {
  observeMergeWorkLadderMock.mockReset();
  createSupabaseServiceClientMock.mockReset().mockReturnValue({ from: () => ({}) });
});

describe('observeQuickFixMerge (quick-fix mergeToMain lane)', () => {
  it('calls observeMergeWorkLadder with lane=quick-fix-mergeToMain and the qf id as workKey', async () => {
    const { observeQuickFixMerge } = await import('../../../scripts/modules/complete-quick-fix/git-operations.js');
    observeMergeWorkLadderMock.mockResolvedValue(undefined);

    await observeQuickFixMerge({ prNumber: '42', repoOwner: 'rickfelix', repoName: 'ehg', qfId: 'QF-20260710-001' });

    expect(observeMergeWorkLadderMock).toHaveBeenCalledTimes(1);
    const call = observeMergeWorkLadderMock.mock.calls[0][0];
    expect(call.lane).toBe('quick-fix-mergeToMain');
    expect(call.workKey).toBe('QF-20260710-001');
    expect(call.prNumber).toBe('42');
    expect(call.merged).toBe(true);
  });

  it('never throws when observeMergeWorkLadder rejects (TR-1: observation must not block a merge)', async () => {
    const { observeQuickFixMerge } = await import('../../../scripts/modules/complete-quick-fix/git-operations.js');
    observeMergeWorkLadderMock.mockRejectedValue(new Error('telemetry write failed'));

    await expect(observeQuickFixMerge({ prNumber: '42', repoOwner: 'rickfelix', repoName: 'ehg', qfId: 'QF-1' }))
      .resolves.toBeUndefined();
  });

  it('never throws when the supabase client itself cannot be created', async () => {
    const { observeQuickFixMerge } = await import('../../../scripts/modules/complete-quick-fix/git-operations.js');
    createSupabaseServiceClientMock.mockImplementation(() => { throw new Error('missing env'); });

    await expect(observeQuickFixMerge({ prNumber: '42', repoOwner: 'rickfelix', repoName: 'ehg', qfId: 'QF-1' }))
      .resolves.toBeUndefined();
  });
});

describe('observeWorktreeMerge (worktree-merge.js lane)', () => {
  it('calls observeMergeWorkLadder with lane=worktree-merge', async () => {
    vi.doMock('child_process', () => ({
      execSync: vi.fn(() => 'rickfelix\tehg_engineer\n'),
    }));
    const { observeWorktreeMerge } = await import('../../../scripts/modules/shipping/worktree-merge.js');
    observeMergeWorkLadderMock.mockResolvedValue(undefined);

    await observeWorktreeMerge('99');

    expect(observeMergeWorkLadderMock).toHaveBeenCalledTimes(1);
    const call = observeMergeWorkLadderMock.mock.calls[0][0];
    expect(call.lane).toBe('worktree-merge');
    expect(call.prNumber).toBe('99');
    expect(call.merged).toBe(true);
    vi.doUnmock('child_process');
  });

  it('never throws when observeMergeWorkLadder rejects', async () => {
    vi.doMock('child_process', () => ({
      execSync: vi.fn(() => 'rickfelix\tehg_engineer\n'),
    }));
    const { observeWorktreeMerge } = await import('../../../scripts/modules/shipping/worktree-merge.js');
    observeMergeWorkLadderMock.mockRejectedValue(new Error('telemetry write failed'));

    await expect(observeWorktreeMerge('99')).resolves.toBeUndefined();
    vi.doUnmock('child_process');
  });
});
