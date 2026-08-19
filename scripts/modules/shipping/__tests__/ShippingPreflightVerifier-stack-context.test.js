/**
 * QF-20260727-876: ShippingPreflightVerifier.checkOpenPRs() previously routed EVERY
 * PR matching this SD's own branch patterns into results.openPRs (blocking),
 * including sibling PRs that are part of the SAME SD's deliberate multi-part
 * landing. This exercises the fixed routing (stackContext vs openPRs) and the
 * companion checkUnmergedBranches() dedupe fix -- a branch already tracked as a
 * stack-context PR must not ALSO get flagged as an "unmerged branch, no PR"
 * (results.stackContext is a distinct array from results.openPRs; the pre-fix
 * hasOpenPR guard only consulted openPRs).
 *
 * execSync is mocked so this stays hermetic (no live `gh`/`git` calls); ONLY
 * EHG_Engineer is guaranteed present on REPO_PATHS in every environment (see
 * lib/repo-paths.js's unconditional EHG_Engineer fallback), so assertions key off
 * that repo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const execSyncMock = vi.fn();
vi.mock('child_process', () => ({ execSync: (...args) => execSyncMock(...args) }));

const { ShippingPreflightVerifier } = await import('../ShippingPreflightVerifier.js');
// Resolved, not hardcoded (lint-repo-resolution-drift flags a literal platform-repo
// string outside lib/repo-paths.js and tests/**; this file lives under
// scripts/modules/shipping/__tests__/, not the top-level tests/ allowlist prefix).
const { resolveGitHubRepo } = await import('../../../../lib/repo-paths.js');

const TARGET_REPO = resolveGitHubRepo('EHG_Engineer');

// This environment's real applications/registry.json carries several repos
// beyond EHG_Engineer (ehg, test-venture, marketlens, ...), all present on
// REPO_PATHS and iterated by checkOpenPRs/checkUnmergedBranches. Only return
// the seeded PRs for TARGET_REPO; every other repo gets an empty result so
// this test's assertions aren't polluted by unrelated real repos on this box.
function ghPrListResponse(cmd, prs) {
  if (cmd.startsWith('gh pr list')) {
    return cmd.includes(`--repo ${TARGET_REPO} `) ? JSON.stringify(prs) : '[]';
  }
  return '';
}

describe('QF-20260727-876 — ShippingPreflightVerifier stack context', () => {
  beforeEach(() => {
    execSyncMock.mockReset();
  });

  it('routes 3 sibling PRs (all based on main) to stackContext, not openPRs', async () => {
    const verifier = new ShippingPreflightVerifier('SD-X');
    execSyncMock.mockImplementation((cmd) => ghPrListResponse(cmd, [
      { number: 1, title: 'part 1', headRefName: 'feat/SD-X-part-1', url: 'u1', baseRefName: 'main' },
      { number: 2, title: 'part 2', headRefName: 'feat/SD-X-part-2', url: 'u2', baseRefName: 'main' },
      { number: 3, title: 'part 3', headRefName: 'feat/SD-X-part-3', url: 'u3', baseRefName: 'main' },
    ]));

    await verifier.checkOpenPRs();

    expect(verifier.results.openPRs).toEqual([]);
    expect(verifier.results.stackContext).toHaveLength(3);
  });

  it('keeps a lone matching PR blocking (openPRs), not stackContext', async () => {
    const verifier = new ShippingPreflightVerifier('SD-X');
    execSyncMock.mockImplementation((cmd) => ghPrListResponse(cmd, [
      { number: 1, title: 'part 1', headRefName: 'feat/SD-X-part-1', url: 'u1', baseRefName: 'main' },
    ]));

    await verifier.checkOpenPRs();

    expect(verifier.results.stackContext).toEqual([]);
    expect(verifier.results.openPRs).toHaveLength(1);
  });

  it('checkUnmergedBranches does not double-flag a branch already tracked in stackContext', async () => {
    const { getRepoPaths } = await import('../../../../lib/repo-paths.js');
    const engineerPath = getRepoPaths().EHG_Engineer;

    const verifier = new ShippingPreflightVerifier('SD-X');
    // Seed stackContext directly (as checkOpenPRs would have) for the EHG_Engineer repo.
    verifier.results.stackContext.push({
      repo: TARGET_REPO, repoPath: engineerPath, number: 1, title: 'part 1',
      branch: 'feat/SD-X-part-1', url: 'u1',
    });
    // Only the EHG_Engineer repo (identified by cwd) reports the matching branch;
    // every other real repo on this box reports none, so this stays hermetic.
    execSyncMock.mockImplementation((cmd, opts) => {
      if (cmd === 'git branch -r') {
        return opts?.cwd === engineerPath ? '  origin/feat/SD-X-part-1\n' : '';
      }
      if (cmd.startsWith('git rev-list')) return '3\n';
      return '';
    });

    await verifier.checkUnmergedBranches();

    expect(verifier.results.unmergedBranches).toEqual([]);
  });
});
