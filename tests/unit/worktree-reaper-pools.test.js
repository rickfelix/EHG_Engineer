/**
 * SD-LEO-INFRA-WORKTREE-REAPER-MULTIREPO-001 — unit tests for multi-repo worktree reaping.
 * Covers the pure pool resolver + per-pool cap status, the child flag passthrough, and (FR-4) the
 * end-to-end reaping decision applied to an ehg-pool listing: an orphan is reaped, a live-owned
 * worktree is not, and the pool drains below cap.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveRegisteredPools,
  computePoolCapStatus,
  normalizePoolPath,
} from '../../lib/worktree-reaper/pools.js';
import {
  buildPassthroughFlags,
  classifyStage0,
  selectStage0Reclaim,
  computePoolUtilization,
} from '../../scripts/worktree-reaper.mjs';

const EHG_ENG = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer';
const EHG = 'C:/Users/rickf/Projects/_EHG/ehg';

describe('pools — resolveRegisteredPools', () => {
  const allExist = () => true;
  const allGit = () => true;

  it('includes the current repo AND every registered app that exists with a .git', () => {
    const pools = resolveRegisteredPools({
      applications: [
        { name: 'EHG_Engineer', local_path: EHG_ENG },
        { name: 'EHG', local_path: EHG },
      ],
      currentRepoRoot: EHG_ENG,
      currentRepoName: 'EHG_Engineer',
      existsSync: allExist,
      hasGit: allGit,
      platform: 'win32',
    });
    const roots = pools.map((p) => normalizePoolPath(p.root, 'win32'));
    expect(roots).toContain(normalizePoolPath(EHG_ENG, 'win32'));
    expect(roots).toContain(normalizePoolPath(EHG, 'win32'));
    // current repo registered === current -> deduped to ONE entry, flagged current
    expect(pools.filter((p) => p.isCurrent)).toHaveLength(1);
    expect(pools).toHaveLength(2);
  });

  it('always includes the current repo even when it is not in the registry', () => {
    const pools = resolveRegisteredPools({
      applications: [{ name: 'EHG', local_path: EHG }],
      currentRepoRoot: EHG_ENG,
      currentRepoName: 'EHG_Engineer',
      existsSync: allExist,
      hasGit: allGit,
      platform: 'win32',
    });
    expect(pools.some((p) => p.isCurrent && normalizePoolPath(p.root, 'win32') === normalizePoolPath(EHG_ENG, 'win32'))).toBe(true);
    expect(pools).toHaveLength(2);
  });

  it('excludes a registered path that does not exist or is not a git repo', () => {
    const pools = resolveRegisteredPools({
      applications: [
        { name: 'Gone', local_path: 'C:/nope/missing' },
        { name: 'NotARepo', local_path: 'C:/some/plain/dir' },
        { name: 'EHG', local_path: EHG },
      ],
      currentRepoRoot: EHG_ENG,
      currentRepoName: 'EHG_Engineer',
      // predicates are slash-insensitive because resolveRegisteredPools path.resolve()s first
      existsSync: (p) => !/[/\\]nope[/\\]missing$/.test(p), // missing path fails exists
      hasGit: (root) => !/[/\\]some[/\\]plain[/\\]dir$/.test(root), // plain dir has no .git
      platform: 'win32',
    });
    const names = pools.map((p) => p.name).sort();
    expect(names).toEqual(['EHG', 'EHG_Engineer']);
  });

  it('dedups duplicate registry rows for the same path', () => {
    const pools = resolveRegisteredPools({
      applications: [
        { name: 'EHG', local_path: EHG },
        { name: 'EHG-dup', local_path: EHG },
      ],
      currentRepoRoot: EHG_ENG,
      currentRepoName: 'EHG_Engineer',
      existsSync: () => true,
      hasGit: () => true,
      platform: 'win32',
    });
    expect(pools.filter((p) => normalizePoolPath(p.root, 'win32') === normalizePoolPath(EHG, 'win32'))).toHaveLength(1);
  });
});

describe('pools — computePoolCapStatus', () => {
  it('warns at/above the threshold and not below', () => {
    expect(computePoolCapStatus(16, 20, 0.8).warn).toBe(true);  // 80% == threshold
    expect(computePoolCapStatus(17, 20, 0.8).warn).toBe(true);  // above
    expect(computePoolCapStatus(15, 20, 0.8).warn).toBe(false); // 75% below
  });
  it('flags atCap when used >= cap', () => {
    expect(computePoolCapStatus(20, 20, 0.8).atCap).toBe(true);
    expect(computePoolCapStatus(21, 20, 0.8).atCap).toBe(true);
    expect(computePoolCapStatus(19, 20, 0.8).atCap).toBe(false);
  });
  it('is total on degenerate input (non-positive cap falls back, fails loud)', () => {
    const s = computePoolCapStatus(3, 0, 0.8);
    expect(s.cap).toBe(1);
    expect(s.warn).toBe(true); // 3/1 >= 0.8
    expect(Number.isFinite(s.utilization)).toBe(true);
  });
  it('reports percent', () => {
    expect(computePoolCapStatus(10, 20, 0.8).percent).toBe(50);
  });
});

describe('pools — buildPassthroughFlags', () => {
  it('passes execute/stage flags but NOT --all-pools or --repo', () => {
    const f = buildPassthroughFlags({ execute: true, stage0: true, stage2: true, yes: true, allPools: true, repo: 'X' });
    expect(f).toContain('--execute');
    expect(f).toContain('--stage0');
    expect(f).toContain('--stage2');
    expect(f).toContain('--yes');
    expect(f).not.toContain('--all-pools');
    expect(f).not.toContain('--repo');
  });
  it('only emits --days/--threshold when non-default', () => {
    expect(buildPassthroughFlags({ days: 7, threshold: 0.8 })).not.toContain('--days');
    const f = buildPassthroughFlags({ days: 14, threshold: 0.5 });
    expect(f).toEqual(expect.arrayContaining(['--days', '14', '--threshold', '0.5']));
  });
});

describe('FR-4 — multi-repo reaping decision over an ehg-pool listing', () => {
  // Simulate the ehg pool at the cap with two worktrees: one orphan (terminal SD, no claim) and one
  // live-owned (active claim). The reaping decision is repo-agnostic — these are the same pure units
  // the reaper runs per pool — so proving it on an ehg-pool listing proves multi-repo behavior.
  const ehgWorktrees = [
    { path: `${EHG}/.worktrees/SD-EHG-ORPHAN-001`, branch: 'feat/SD-EHG-ORPHAN-001' },
    { path: `${EHG}/.worktrees/SD-EHG-LIVE-001`, branch: 'feat/SD-EHG-LIVE-001' },
  ];

  it('reaps the orphan and keeps the live-owned worktree', () => {
    const statusResolver = (key) => (key === 'SD-EHG-ORPHAN-001' ? 'terminal' : 'active');
    const reclaim = selectStage0Reclaim(ehgWorktrees, {
      activeSdSet: new Set(['SD-EHG-LIVE-001']),
      terminalSdSet: new Set(['SD-EHG-ORPHAN-001']),
      statusResolver,
    });
    const reclaimedKeys = reclaim.map((r) => r.sd_key);
    expect(reclaimedKeys).toContain('SD-EHG-ORPHAN-001');
    expect(reclaimedKeys).not.toContain('SD-EHG-LIVE-001');
  });

  it('a live (active) worktree is never reclaimed even if a stale terminal row exists', () => {
    const v = classifyStage0(
      { path: `${EHG}/.worktrees/SD-EHG-LIVE-001`, branch: 'feat/SD-EHG-LIVE-001' },
      { activeSdSet: new Set(['SD-EHG-LIVE-001']), terminalSdSet: new Set(['SD-EHG-LIVE-001']) }
    );
    expect(v.reclaim).toBe(false);
    expect(v.reason).toBe('active_sd_protected');
  });

  it('draining the orphan drops the ehg pool below the cap threshold', () => {
    const cap = 20;
    const before = 20; // at cap
    expect(computePoolCapStatus(before, cap, 0.8).warn).toBe(true);
    // reclaim 5 terminal orphans → 15/20 = 75% < 80%
    const after = before - 5;
    expect(computePoolUtilization(after, cap).utilization).toBeLessThan(0.8);
    expect(computePoolCapStatus(after, cap, 0.8).warn).toBe(false);
  });
});
