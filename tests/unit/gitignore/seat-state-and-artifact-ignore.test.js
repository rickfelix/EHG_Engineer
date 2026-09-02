/**
 * QF-20260902-429: role-seat state files (.claude/*-session-state-*.md) and frozen scratch
 * artifacts (.artifacts/_*, .artifacts/PREREG-*) were untracked but NOT gitignored, so a plain
 * `git clean` could discard them -- witnessed 2026-09-02 02:00-02:15Z (Adam seat CP1-CP27 lost).
 * Real `git check-ignore` invocation (no mocking) against the repo's actual .gitignore: the
 * protection this pins is the literal mechanism scripts/safe-root-resync.mjs relies on (it
 * never passes -x to `git clean`, so it already defers entirely to .gitignore -- there is no
 * second exclusion list in that script to keep in sync).
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

function isIgnored(relPath) {
  try {
    execFileSync('git', ['check-ignore', '--quiet', relPath], { cwd: REPO_ROOT });
    return true;
  } catch (err) {
    // git check-ignore exits 1 when the path is NOT ignored.
    if (err.status === 1) return false;
    throw err;
  }
}

describe('QF-20260902-429: seat-state and frozen-artifact gitignore patterns', () => {
  it('ignores an Adam seat-state file (.claude/*-session-state-*.md)', () => {
    expect(isIgnored('.claude/adam-session-state-673db833.md')).toBe(true);
  });

  it('ignores a Solomon seat-state file', () => {
    expect(isIgnored('.claude/solomon-session-state-319e2797.md')).toBe(true);
  });

  it('ignores the .bak twin of a seat-state file', () => {
    expect(isIgnored('.claude/adam-session-state-673db833.md.bak')).toBe(true);
  });

  it('ignores an underscore-prefixed .artifacts/_ scratch file', () => {
    expect(isIgnored('.artifacts/_HELD-SENDS.md')).toBe(true);
  });

  it('ignores an .artifacts/PREREG- frozen preregistration file', () => {
    expect(isIgnored('.artifacts/PREREG-M3-composition-frozen-20260830.mjs')).toBe(true);
  });

  it('does NOT ignore an unrelated .claude/ file (pattern is scoped, not a blanket exclusion)', () => {
    expect(isIgnored('.claude/settings.json')).toBe(false);
  });
});
