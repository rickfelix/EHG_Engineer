/**
 * SD-LEO-INFRA-REPO-HYGIENE-PATH-001, FR-1 -- unit tests for
 * scripts/lint/no-literal-home-path-lint.mjs's pure exports. Unlike the sibling
 * require-main-guard-in-one-off-lint.mjs (which calls main() unconditionally at module scope and
 * must be tested via subprocess), this driver guards its main() with isMainModule(), so the
 * exported evaluateFiles/loadAllowlist/isAllowlistedDir functions can be imported and tested
 * directly with in-memory fixtures -- no tmpdir, no subprocess, no --root plumbing needed.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  HOME_PATH_RE,
  isAllowlistedDir,
  evaluateFiles,
  loadAllowlist,
} from '../../../scripts/lint/no-literal-home-path-lint.mjs';

describe('HOME_PATH_RE', () => {
  it('matches a Windows-style literal home path with forward slashes', () => {
    expect(HOME_PATH_RE.test("const p = 'C:/Users/rickf/Projects/_EHG/ehg';")).toBe(true);
  });

  it('matches a Windows-style literal home path with backslashes', () => {
    expect(HOME_PATH_RE.test('const p = "C:\\\\Users\\\\rickf\\\\Projects";')).toBe(true);
  });

  it('matches case-insensitively (drive letter and "users" casing)', () => {
    expect(HOME_PATH_RE.test('c:/users/rickf/foo')).toBe(true);
  });

  it('matches a POSIX-style literal home path', () => {
    expect(HOME_PATH_RE.test("const p = '/home/rickf/Projects/ehg';")).toBe(true);
  });

  it('does not match resolveRepoPath usage or an unrelated path', () => {
    expect(HOME_PATH_RE.test("resolveRepoPath('ehg')")).toBe(false);
    expect(HOME_PATH_RE.test('/home/otheruser/Projects/ehg')).toBe(false);
    expect(HOME_PATH_RE.test('C:/Users/someoneelse/Projects/ehg')).toBe(false);
  });
});

describe('isAllowlistedDir', () => {
  it('exempts scripts/one-off/ and scripts/archive/ (historical, disposable)', () => {
    expect(isAllowlistedDir('scripts/one-off/backfill-thing.mjs')).toBe(true);
    expect(isAllowlistedDir('scripts/archive/old-thing.mjs')).toBe(true);
  });

  it('exempts tests/ and session-scratch directories', () => {
    expect(isAllowlistedDir('tests/unit/whatever.test.js')).toBe(true);
    expect(isAllowlistedDir('.claude/statusline.cjs')).toBe(true);
    expect(isAllowlistedDir('.artifacts/whatever.mjs')).toBe(true);
  });

  it('does not exempt live code directories', () => {
    expect(isAllowlistedDir('lib/gates/cross-repo-build-check.js')).toBe(false);
    expect(isAllowlistedDir('scripts/modules/handoff/executors/exec-to-plan/gates/ui-interactivity-check.js')).toBe(false);
  });
});

describe('evaluateFiles', () => {
  it('flags a live-code file with a literal home path', () => {
    const { violations, ok } = evaluateFiles([
      { path: 'lib/gates/example.js', content: "const p = 'C:/Users/rickf/Projects/_EHG/ehg';" },
    ]);
    expect(ok).toBe(false);
    expect(violations).toEqual([{ file: 'lib/gates/example.js', line: 1 }]);
  });

  it('does not flag a file using resolveRepoPath instead of a literal', () => {
    const { violations, ok } = evaluateFiles([
      { path: 'lib/gates/example.js', content: "const p = resolveRepoPath('ehg');" },
    ]);
    expect(ok).toBe(true);
    expect(violations).toEqual([]);
  });

  it('exempts an allowlisted directory even with a literal home path', () => {
    const { violations, ok } = evaluateFiles([
      { path: 'scripts/one-off/legacy.mjs', content: "const p = 'C:/Users/rickf/Projects/_EHG/ehg';" },
    ]);
    expect(ok).toBe(true);
    expect(violations).toEqual([]);
  });

  it('a grandfathered file is excluded from violations but counted separately', () => {
    const files = [{ path: 'lib/legacy.js', content: "const p = 'C:/Users/rickf/Projects/_EHG/ehg';" }];
    const allow = { 'lib/legacy.js': 'pre-existing, tracked debt' };
    const { violations, grandfathered, ok } = evaluateFiles(files, { allow });
    expect(ok).toBe(true);
    expect(violations).toEqual([]);
    expect(grandfathered).toEqual([{ file: 'lib/legacy.js', line: 1 }]);
  });

  it('flags multiple matching lines in the same file independently', () => {
    const content = [
      "const a = 'C:/Users/rickf/one';",
      'const b = 1;',
      "const c = 'C:/Users/rickf/two';",
    ].join('\n');
    const { violations } = evaluateFiles([{ path: 'lib/multi.js', content }]);
    expect(violations.map((v) => v.line)).toEqual([1, 3]);
  });
});

describe('loadAllowlist', () => {
  let dir;

  it('returns an empty object when the allowlist file is missing', () => {
    expect(loadAllowlist('/nonexistent/path/allowlist.json')).toEqual({});
  });

  it('loads a well-formed allowlist', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'home-path-allowlist-'));
    const p = path.join(dir, 'allowlist.json');
    writeFileSync(p, JSON.stringify({ allow: { 'lib/x.js': 'reason' } }));
    expect(loadAllowlist(p)).toEqual({ 'lib/x.js': 'reason' });
    rmSync(dir, { recursive: true, force: true });
  });

  it('throws loud on an entry with an empty reason', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'home-path-allowlist-'));
    const p = path.join(dir, 'allowlist.json');
    writeFileSync(p, JSON.stringify({ allow: { 'lib/x.js': '' } }));
    expect(() => loadAllowlist(p)).toThrow(/non-empty reason/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('throws loud on malformed JSON', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'home-path-allowlist-'));
    const p = path.join(dir, 'allowlist.json');
    writeFileSync(p, '{ not valid json');
    expect(() => loadAllowlist(p)).toThrow(/Invalid allowlist JSON/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('the real corpus allowlist loads without throwing and every entry is non-empty', () => {
    const real = loadAllowlist();
    for (const [file, reason] of Object.entries(real)) {
      expect(typeof reason).toBe('string');
      expect(reason.trim().length).toBeGreaterThan(0);
      expect(typeof file).toBe('string');
    }
  });
});
