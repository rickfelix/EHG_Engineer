/**
 * SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 — FR-6 / TS-2: PLATFORM REGRESSION INVARIANT.
 *
 * This is the regression NET that gates every other FR in this SD. It proves the
 * platform build flow is byte-identical regardless of the venture-build wiring:
 * for `target_application` IN (null, undefined, 'EHG_Engineer'), repoRoot resolution
 * stays on the EHG_Engineer root, `source` is never 'venture', and NO
 * `worktree.venture_repo_resolved` event is produced (the venture-path resolver is
 * never even consulted).
 *
 * It targets the pure `resolveVentureRepoRoot` helper (lib/venture-repo-root.js),
 * which `scripts/resolve-sd-workdir.js` delegates the decision to — so this asserts
 * the exact branch that decides platform-vs-venture without dragging in that file's
 * heavy import graph (worktree-manager / quota / supabase-client).
 *
 * TS-3 (venture happy path) and the not-found / no-resolver paths are included so
 * the extraction is proven behavior-preserving in both directions.
 */
import { describe, it, expect, vi } from 'vitest';
import path from 'path';
import { resolveVentureRepoRoot } from '../../../lib/venture-repo-root.js';
import { ENGINEER_ROOT } from '../../../lib/repo-paths.js';

const PLATFORM_TARGETS = [null, undefined, 'EHG_Engineer'];

describe('FR-6 / TS-2: platform repoRoot invariant', () => {
  for (const targetApp of PLATFORM_TARGETS) {
    it(`target_application=${JSON.stringify(targetApp)} → stays on ENGINEER_ROOT, source!=venture, zero venture logs`, () => {
      const getVenturePath = vi.fn(() => '/should/never/be/used');
      const existsSync = vi.fn(() => true);

      const result = resolveVentureRepoRoot(targetApp, ENGINEER_ROOT, { getVenturePath, existsSync });

      // repoRoot unchanged === ENGINEER_ROOT
      expect(result.repoRoot).toBe(ENGINEER_ROOT);
      // source is never 'venture' for a platform SD
      expect(result.source).not.toBe('venture');
      expect(result.source).toBe('platform');
      // zero venture_repo_resolved logs (in fact, zero logs at all)
      expect(result.logs).toEqual([]);
      expect(result.logs.some((l) => l.event === 'worktree.venture_repo_resolved')).toBe(false);
      // the venture-path resolver is NEVER consulted for a platform SD
      expect(getVenturePath).not.toHaveBeenCalled();
      expect(existsSync).not.toHaveBeenCalled();
    });
  }

  it('no venture_repo_resolved log is emitted across all platform targets', () => {
    const allLogs = PLATFORM_TARGETS.flatMap(
      (t) => resolveVentureRepoRoot(t, ENGINEER_ROOT, { getVenturePath: () => '/x', existsSync: () => true }).logs,
    );
    expect(allLogs).toHaveLength(0);
  });
});

describe('TS-3 + fallthrough: venture routing is preserved by the extraction', () => {
  it('a non-platform target with a real .git clone overrides repoRoot and logs venture_repo_resolved', () => {
    const venturePath = path.join(path.sep, 'repos', 'commitcraft-ai');
    const existsSync = vi.fn((p) => p === path.join(venturePath, '.git'));

    const result = resolveVentureRepoRoot('commitcraft-ai', ENGINEER_ROOT, {
      getVenturePath: () => venturePath,
      existsSync,
    });

    expect(result.repoRoot).toBe(venturePath);
    expect(result.source).toBe('venture');
    expect(result.logs).toEqual([
      { event: 'worktree.venture_repo_resolved', targetApp: 'commitcraft-ai', repoRoot: venturePath },
    ]);
  });

  it("'ehg' (a separate platform repo, NOT the EHG_Engineer self-target) still routes off ENGINEER_ROOT", () => {
    // Guards against over-broadening the platform check to all platform repos:
    // only null/EHG_Engineer is the protected invariant; 'ehg' is its own repo.
    const ehgPath = path.join(path.sep, 'repos', 'ehg');
    const result = resolveVentureRepoRoot('ehg', ENGINEER_ROOT, {
      getVenturePath: () => ehgPath,
      existsSync: () => true,
    });
    expect(result.repoRoot).toBe(ehgPath);
    expect(result.source).toBe('venture');
  });

  it('a venture with no on-disk .git clone falls through to the default root + logs venture_repo_not_found', () => {
    const venturePath = path.join(path.sep, 'repos', 'not-cloned');
    const result = resolveVentureRepoRoot('not-cloned', ENGINEER_ROOT, {
      getVenturePath: () => venturePath,
      existsSync: () => false,
    });
    expect(result.repoRoot).toBe(ENGINEER_ROOT);
    expect(result.source).toBe('venture_not_found');
    expect(result.logs).toEqual([
      { event: 'worktree.venture_repo_not_found', targetApp: 'not-cloned', resolvedPath: venturePath },
    ]);
  });

  it('a registry miss (getVenturePath → null) falls through to the default root', () => {
    const result = resolveVentureRepoRoot('ghost-venture', ENGINEER_ROOT, {
      getVenturePath: () => null,
      existsSync: () => true,
    });
    expect(result.repoRoot).toBe(ENGINEER_ROOT);
    expect(result.source).toBe('venture_not_found');
  });

  it('no resolver injected → falls through to the default root without throwing', () => {
    const result = resolveVentureRepoRoot('some-venture', ENGINEER_ROOT, {});
    expect(result.repoRoot).toBe(ENGINEER_ROOT);
    expect(result.source).toBe('venture_not_found');
    expect(result.logs).toEqual([]);
  });
});
