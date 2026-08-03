/**
 * SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001 FR-1 — spawn-source location resolution.
 *
 * Pins BOTH siting constraints, including the one whose intuitive form is wrong:
 *   1. not under `.worktrees/` (that path is exempt from the currency check, so a spawn source
 *      there would be silently unguarded — it would appear to work while asserting nothing);
 *   2. gitignored. The plausible-but-false version of this was "must be a SIBLING of the repo,
 *      or the worktree becomes untracked dirt". Measured: `.worktrees/` is gitignored and
 *      contributes zero porcelain entries, so an in-repo location adds no dirt provided it is
 *      ignored. The .gitignore entry is asserted here so the two cannot be separated later —
 *      dropping it would silently reintroduce the dirt this SD exists to tolerate.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  resolveSpawnSourceDir,
  SPAWN_SOURCE_DIRNAME,
  isWorktreeExemptPath,
} from '../../../lib/fleet/spawn-control.js';

describe('FR-1: resolveSpawnSourceDir', () => {
  it('defaults to <repoRoot>/.spawn-source', () => {
    expect(resolveSpawnSourceDir('/repo', {})).toBe(path.join('/repo', '.spawn-source'));
    expect(SPAWN_SOURCE_DIRNAME).toBe('.spawn-source');
  });

  it('the default location is NOT exempt from the currency check — the whole point', () => {
    expect(isWorktreeExemptPath(resolveSpawnSourceDir('/repo', {}))).toBe(false);
  });

  it('honours FLEET_SPAWN_SOURCE_DIR for differing layouts', () => {
    expect(resolveSpawnSourceDir('/repo', { FLEET_SPAWN_SOURCE_DIR: '/elsewhere/src' })).toBe('/elsewhere/src');
  });

  it('guards the OVERRIDE too — the hazard does not care who chose the path', () => {
    expect(() => resolveSpawnSourceDir('/repo', { FLEET_SPAWN_SOURCE_DIR: '/repo/.worktrees/src' }))
      .toThrow(/may not sit under \.worktrees\//);
  });

  it('ignores a blank/whitespace override rather than resolving to an empty path', () => {
    for (const v of ['', '   ']) {
      expect(resolveSpawnSourceDir('/repo', { FLEET_SPAWN_SOURCE_DIR: v })).toBe(path.join('/repo', '.spawn-source'));
    }
  });
});

describe('FR-1: the gitignore entry is part of the contract, not incidental', () => {
  it('.spawn-source/ is ignored, so the tree never becomes untracked dirt in the root', () => {
    const gitignore = readFileSync(new URL('../../../.gitignore', import.meta.url), 'utf8');
    const lines = gitignore.split(/\r?\n/).map((l) => l.trim());
    expect(
      lines.includes('.spawn-source/'),
      'the .spawn-source/ ignore entry was removed — an unignored in-repo worktree reintroduces ' +
      'the untracked dirt this SD exists to make spawns tolerate',
    ).toBe(true);
  });
});
