/**
 * SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001 FR-1 — spawn-source worktree creation and reuse.
 *
 * Written with an injected exists-probe and git runner, matching the fleet suite's established
 * pattern (runnerFor in tree-currency.test.js, opts.currencyRunner in spawn-control), so the
 * decision logic is assertable without touching a real repo.
 *
 * The reuse case matters more than the create case: the fleet spawns constantly, so a
 * create-every-time implementation would work exactly once and then fail on every subsequent
 * spawn — a defect that would only surface under load.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  ensureSpawnSourceWorktree,
  buildSpawnSourceWorktreeArgs,
  resolveSpawnSourceDir,
} from '../../../lib/fleet/spawn-control.js';

describe('FR-1: buildSpawnSourceWorktreeArgs', () => {
  it('builds an argv array, never a shell string', () => {
    const args = buildSpawnSourceWorktreeArgs('/repo/.spawn-source', 'origin/main');
    expect(Array.isArray(args)).toBe(true);
    expect(args).toEqual(['worktree', 'add', '--detach', '/repo/.spawn-source', 'origin/main']);
  });

  it('uses --detach: the spawn source is a read-only snapshot, never a branch', () => {
    // A branch checkout here would collide with any other worktree holding it (git refuses) and
    // would invite commits into a tree whose entire value is being pristine.
    expect(buildSpawnSourceWorktreeArgs('/d', 'origin/main')).toContain('--detach');
  });
});

describe('FR-1: ensureSpawnSourceWorktree', () => {
  const deps = (existsResult) => ({
    repoRoot: '/repo',
    exists: vi.fn(() => existsResult),
    runner: vi.fn(),
    env: {},
  });

  it('creates the tree once when it is absent', () => {
    const d = deps(false);
    const out = ensureSpawnSourceWorktree(d);
    expect(out.created).toBe(true);
    expect(out.dir).toBe(resolveSpawnSourceDir('/repo', {}));
    expect(d.runner).toHaveBeenCalledTimes(1);
    expect(d.runner).toHaveBeenCalledWith(expect.arrayContaining(['worktree', 'add', '--detach']));
  });

  it('REUSES an existing tree and issues no git command — the load-bearing case', () => {
    const d = deps(true);
    const out = ensureSpawnSourceWorktree(d);
    expect(out.created).toBe(false);
    expect(d.runner).not.toHaveBeenCalled();
  });

  it('is idempotent across repeated calls once the tree exists', () => {
    const d = deps(true);
    for (let i = 0; i < 5; i++) expect(ensureSpawnSourceWorktree(d).created).toBe(false);
    expect(d.runner).not.toHaveBeenCalled();
  });

  it('honours an explicit baseRef', () => {
    const d = deps(false);
    ensureSpawnSourceWorktree({ ...d, baseRef: 'origin/release' });
    expect(d.runner).toHaveBeenCalledWith(expect.arrayContaining(['origin/release']));
  });

  it('REFUSES BEFORE CREATING when the location would be exempt from the currency check', () => {
    // The guard must run before any side effect — creating first and validating after would
    // leave a silently-unguarded tree on disk.
    const d = deps(false);
    expect(() => ensureSpawnSourceWorktree({ ...d, env: { FLEET_SPAWN_SOURCE_DIR: '/repo/.worktrees/src' } }))
      .toThrow(/may not sit under \.worktrees\//);
    expect(d.runner).not.toHaveBeenCalled();
    expect(d.exists).not.toHaveBeenCalled();
  });
});
