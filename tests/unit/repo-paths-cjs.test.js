/**
 * SD-LEO-INFRA-REPO-HYGIENE-PATH-001 -- the ESM version (tests/unit/repo-paths.test.js) has
 * load-bearing coverage proving resolveLocalPath's default base parameter is getRepoRoot(), not
 * ENGINEER_ROOT (a TESTING sub-agent mutation-testing finding: every test that passes an
 * explicit base never exercises the default expression, so a regression back to ENGINEER_ROOT
 * silently survived the original suite). lib/repo-paths.cjs is a hand-duplicated mirror with the
 * exact same default-parameter shape and no coverage of its own at all -- this file closes that
 * gap for the CJS surface specifically (RCA preventive P4).
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import path from 'path';
import repoPathsCjs from '../../lib/repo-paths.cjs';

const { resolveLocalPath, resolveRepoPath, getRepoRoot, stripWorktreeSuffix, ENGINEER_ROOT, clearCache } = repoPathsCjs;

describe('lib/repo-paths.cjs (CJS mirror)', () => {
  it('getRepoRoot() equals stripWorktreeSuffix(ENGINEER_ROOT)', () => {
    expect(getRepoRoot()).toBe(stripWorktreeSuffix(ENGINEER_ROOT));
  });

  it('LOAD-BEARING: resolveLocalPath with NO base argument uses getRepoRoot(), not ENGINEER_ROOT', () => {
    const resolved = resolveLocalPath('../ehg');
    expect(resolved).toBe(path.resolve(getRepoRoot(), '..', 'ehg'));
    expect(resolved.replace(/\\/g, '/')).not.toContain('/.worktrees/');
  });

  it('LOAD-BEARING: resolveRepoPath(\'ehg\') from THIS actual runtime location resolves to a real, existing directory', () => {
    clearCache();
    const resolved = resolveRepoPath('ehg');
    expect(resolved).toBeTruthy();
    // See the ESM twin (tests/unit/repo-paths.test.js) for why the existsSync check below is
    // conditional on the sibling repo actually being checked out: CI has no sibling `ehg`
    // directory, so it cannot be asserted unconditionally (CI failure caught 2026-08-24). The
    // /.worktrees/ shape check runs unconditionally and is what actually catches the regression.
    expect(resolved.replace(/\\/g, '/')).not.toContain('/.worktrees/');
    const siblingCheckedOut = existsSync(path.resolve(getRepoRoot(), '..', 'ehg'));
    if (siblingCheckedOut) {
      expect(existsSync(resolved)).toBe(true);
    }
  });

  it('an already-absolute value is returned unchanged regardless of base', () => {
    // Platform-correct absolute literal -- see the ESM twin for why 'C:/abs/path' is not a valid
    // cross-platform absolute-path literal (CI failure caught 2026-08-24).
    const absoluteInput = process.platform === 'win32' ? 'C:\\abs\\path' : '/abs/path';
    expect(resolveLocalPath(absoluteInput, '/some/base')).toBe(path.resolve(absoluteInput));
  });

  it('ESM and CJS agree on resolveRepoPath(\'ehg\') from this same runtime location', async () => {
    clearCache();
    const esm = await import('../../lib/repo-paths.js');
    expect(resolveRepoPath('ehg')).toBe(esm.resolveRepoPath('ehg'));
  });
});
