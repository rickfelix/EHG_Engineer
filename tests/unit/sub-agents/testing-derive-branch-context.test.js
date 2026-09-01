/**
 * QF-20260831-960: repoPath resolution must not be discarded when only branch-NAME
 * discovery fails.
 *
 * Root cause: lib/sub-agents/testing/index.js's resolveFeatureBranch() returned null on
 * ANY resolveBranch() failure, even though resolveBranch() computes repoPath from
 * sd.target_application before it ever tries to discover a branch name -- so a benign
 * "couldn't name the branch" condition (e.g. the branch-resolver domain being called with a
 * UUID instead of an sd_key) turned into a total loss of repoPath, and runFullE2ESuite
 * fail-loud-refused to run the E2E suite entirely.
 */
import { describe, it, expect } from 'vitest';
import { deriveBranchContext } from '../../../lib/sub-agents/testing/index.js';

describe('deriveBranchContext', () => {
  it('success: returns branch + repoPath as-is', () => {
    const result = deriveBranchContext({
      success: true, branch: 'feat/SD-X', repoPath: 'C:/repo', source: 'discovered', validated: true,
    });
    expect(result).toEqual({ branch: 'feat/SD-X', repoPath: 'C:/repo', source: 'discovered', validated: true });
  });

  it('branch-discovery miss WITH a resolved repoPath: repoPath survives, branch is null', () => {
    const result = deriveBranchContext({
      success: false, repoPath: 'C:/repo', source: 'target_application', error: 'No branches found matching SD ID: <uuid>',
    });
    expect(result).toEqual({ branch: null, repoPath: 'C:/repo', source: 'target_application', validated: false });
  });

  it('genuine total resolution failure (no repoPath at all): returns null', () => {
    const result = deriveBranchContext({ success: false, repoPath: null, error: 'SD not found' });
    expect(result).toBeNull();
  });

  it('genuine total resolution failure (repoPath key absent): returns null', () => {
    const result = deriveBranchContext({ success: false, error: 'SD not found' });
    expect(result).toBeNull();
  });
});
