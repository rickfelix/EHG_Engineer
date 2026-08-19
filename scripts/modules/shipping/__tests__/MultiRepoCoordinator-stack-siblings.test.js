/**
 * QF-20260727-876: MultiRepoCoordinator.markStackSiblings() demotes still-open-PR
 * branches from blocking (needsAction=true) to context (isStackSibling=true,
 * needsAction=false) when this SD has multiple concurrent open PRs all
 * independently based on main. A lone open PR stays blocking -- that's
 * indistinguishable from one genuinely forgotten branch.
 *
 * markStackSiblings() is a pure state-transform over an already-populated
 * this.branchStatus (no shelling out), so it's exercised directly here without
 * mocking child_process or the repo-discovery filesystem calls the constructor's
 * sibling methods (findSDBranches/checkPRStatus) would otherwise need.
 */
import { describe, it, expect } from 'vitest';
import { MultiRepoCoordinator } from '../MultiRepoCoordinator.js';

function branch(overrides) {
  return {
    repo: 'EHG_Engineer',
    repoInfo: { priority: 1, path: '/x', github: 'rickfelix/EHG_Engineer' },
    branch: 'feat/SD-X-part-1',
    commitsAhead: 3,
    isMerged: false,
    prNumber: null,
    prStatus: null,
    prBaseRefName: null,
    needsAction: true,
    ...overrides,
  };
}

describe('QF-20260727-876 — MultiRepoCoordinator.markStackSiblings', () => {
  it('demotes 3 sibling open PRs (all based on main) from blocking to stack context', () => {
    const coordinator = new MultiRepoCoordinator('SD-X');
    coordinator.branchStatus = [
      branch({ branch: 'feat/SD-X-part-1', prNumber: 1, prStatus: 'OPEN', prBaseRefName: 'main' }),
      branch({ branch: 'feat/SD-X-part-2', prNumber: 2, prStatus: 'OPEN', prBaseRefName: 'main' }),
      branch({ branch: 'feat/SD-X-part-3', prNumber: 3, prStatus: 'OPEN', prBaseRefName: 'main' }),
    ];

    coordinator.markStackSiblings();

    for (const b of coordinator.branchStatus) {
      expect(b.isStackSibling).toBe(true);
      expect(b.needsAction).toBe(false);
    }
  });

  it('leaves a single open PR blocking — not a stack', () => {
    const coordinator = new MultiRepoCoordinator('SD-X');
    coordinator.branchStatus = [
      branch({ branch: 'feat/SD-X-part-1', prNumber: 1, prStatus: 'OPEN', prBaseRefName: 'main' }),
    ];

    coordinator.markStackSiblings();

    expect(coordinator.branchStatus[0].isStackSibling).toBeUndefined();
    expect(coordinator.branchStatus[0].needsAction).toBe(true);
  });

  it('leaves branches blocking when one PR is based on a sibling branch, not main (real dependency chain)', () => {
    const coordinator = new MultiRepoCoordinator('SD-X');
    coordinator.branchStatus = [
      branch({ branch: 'feat/SD-X-part-1', prNumber: 1, prStatus: 'OPEN', prBaseRefName: 'main' }),
      branch({ branch: 'feat/SD-X-part-2', prNumber: 2, prStatus: 'OPEN', prBaseRefName: 'feat/SD-X-part-1' }),
    ];

    coordinator.markStackSiblings();

    for (const b of coordinator.branchStatus) {
      expect(b.isStackSibling).toBeUndefined();
      expect(b.needsAction).toBe(true);
    }
  });

  it('leaves branches with no PR yet (needsAction, but not OPEN-PR-tracked) unaffected', () => {
    const coordinator = new MultiRepoCoordinator('SD-X');
    coordinator.branchStatus = [
      branch({ branch: 'feat/SD-X-part-1', prNumber: 1, prStatus: 'OPEN', prBaseRefName: 'main' }),
      branch({ branch: 'feat/SD-X-part-2', prNumber: null, prStatus: null, prBaseRefName: null }),
    ];

    coordinator.markStackSiblings();

    // Only 1 open-PR branch present -> not a stack (N>1 required) -> both stay blocking.
    expect(coordinator.branchStatus[0].needsAction).toBe(true);
    expect(coordinator.branchStatus[1].needsAction).toBe(true);
  });

  it('is a no-op on an empty branchStatus', () => {
    const coordinator = new MultiRepoCoordinator('SD-X');
    coordinator.branchStatus = [];
    expect(() => coordinator.markStackSiblings()).not.toThrow();
    expect(coordinator.branchStatus).toEqual([]);
  });
});
