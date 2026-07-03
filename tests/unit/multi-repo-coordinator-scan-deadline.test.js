/**
 * QF-20260703-388: multi-repo scan must never block the ship path indefinitely.
 * Verifies the global scan deadline skips remaining repos/branches and marks
 * the result partial, and that git/gh calls go through execFileSync (no shell)
 * so a timeout's kill signal reaches the real process.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn()
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, existsSync: vi.fn(() => true) };
});

import { execFileSync } from 'child_process';
import { MultiRepoCoordinator } from '../../scripts/modules/shipping/MultiRepoCoordinator.js';

function makeRepos() {
  return {
    EHG_Engineer: { name: 'EHG_Engineer', path: '/repos/EHG_Engineer', github: 'org/EHG_Engineer', priority: 1 },
    ehg: { name: 'ehg', path: '/repos/ehg', github: 'org/ehg', priority: 2 }
  };
}

describe('MultiRepoCoordinator scan deadline (QF-20260703-388)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips remaining repos and marks partial once the scan deadline has passed', async () => {
    const coordinator = new MultiRepoCoordinator('SD-TEST-001');
    coordinator.repos = makeRepos();
    coordinator._deadlineAt = Date.now() - 1; // already expired
    coordinator.partial = false;

    await coordinator.findSDBranches();

    expect(coordinator.partial).toBe(true);
    expect(execFileSync).not.toHaveBeenCalled();
    expect(coordinator.branchStatus).toHaveLength(0);
  });

  it('scans normally via execFileSync (no shell) when the deadline has not passed', async () => {
    execFileSync.mockImplementation((file, args) => {
      if (args[0] === 'fetch') return '';
      if (args[0] === 'branch') return '  origin/fix/SD-TEST-001\n';
      if (args[0] === 'rev-list') return '2\n';
      if (args[0] === 'merge-base') return '';
      return '';
    });

    const coordinator = new MultiRepoCoordinator('SD-TEST-001');
    coordinator.repos = { EHG_Engineer: makeRepos().EHG_Engineer };
    coordinator._deadlineAt = Date.now() + 60000;
    coordinator.partial = false;

    await coordinator.findSDBranches();

    expect(coordinator.partial).toBe(false);
    expect(execFileSync).toHaveBeenCalledWith('git', ['fetch', '--prune'], expect.any(Object));
    expect(coordinator.branchStatus).toHaveLength(1);
    expect(coordinator.branchStatus[0].commitsAhead).toBe(2);
  });
});
