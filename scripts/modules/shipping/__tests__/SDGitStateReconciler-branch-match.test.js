/**
 * QF-20260819-014: SDGitStateReconciler.getGitState() had the identical unbounded
 * substring branch-pattern match QF-20260727-876 (PR #7298) fixed in
 * ShippingPreflightVerifier/MultiRepoCoordinator -- pattern `feat/SD-X-1` phantom-
 * matched branch `feat/SD-X-10-description` (an unrelated SD). Effect: an unrelated
 * SD's phantom-matched branch inflates gitState.branches.length above 0, silently
 * suppressing the "SD in progress but no branch exists" mismatch warning in
 * compareStates for a genuinely orphaned in-progress SD.
 *
 * execSync is mocked so this stays hermetic (no live `gh`/`git` calls); ONLY
 * EHG_Engineer is guaranteed present on REPO_PATHS in every environment (see
 * lib/repo-paths.js's unconditional EHG_Engineer fallback), so assertions key off
 * that repo. checkMergeEvidence()'s own execSync (--grep-based) calls are stubbed
 * to a benign empty result -- that code path is untouched by this QF (filed
 * separately) and irrelevant to the branch-matching assertion here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const execSyncMock = vi.fn();
vi.mock('child_process', () => ({ execSync: (...args) => execSyncMock(...args) }));

const { SDGitStateReconciler } = await import('../SDGitStateReconciler.js');
const { getRepoPaths } = await import('../../../../lib/repo-paths.js');

// This environment's real applications/registry.json carries several repos beyond
// EHG_Engineer, all present on REPO_PATHS and iterated by getGitState. Scope the
// mock to only the EHG_Engineer repo (identified by cwd) so this stays hermetic.
const ENGINEER_PATH = getRepoPaths().EHG_Engineer;

describe('QF-20260819-014 — SDGitStateReconciler.getGitState branch match', () => {
  beforeEach(() => {
    execSyncMock.mockReset();
  });

  it('does NOT phantom-match a longer SD id that literally contains this SD id as a prefix', async () => {
    const reconciler = new SDGitStateReconciler('SD-X-1');
    execSyncMock.mockImplementation((cmd, opts) => {
      if (cmd === 'git fetch --prune') return '';
      if (cmd === 'git branch -r') {
        // Only SD-X-10's branch exists -- a genuine (unrelated) SD, never SD-X-1's own.
        return opts?.cwd === ENGINEER_PATH ? '  origin/feat/SD-X-10-description\n' : '';
      }
      if (cmd.startsWith('git log')) return ''; // checkMergeEvidence -- not under test here
      return '';
    });

    const state = await reconciler.getGitState();

    expect(state.branches).toEqual([]);
  });

  it('still matches a genuine boundary-respecting branch for this SD', async () => {
    const reconciler = new SDGitStateReconciler('SD-X-1');
    execSyncMock.mockImplementation((cmd, opts) => {
      if (cmd === 'git fetch --prune') return '';
      if (cmd === 'git branch -r') {
        return opts?.cwd === ENGINEER_PATH ? '  origin/feat/SD-X-1-add-widget\n' : '';
      }
      if (cmd.startsWith('git rev-list')) return '2\n';
      if (cmd.startsWith('git log')) return '';
      return '';
    });

    const state = await reconciler.getGitState();

    expect(state.branches).toHaveLength(1);
    expect(state.branches[0].name).toBe('feat/SD-X-1-add-widget');
  });
});
