/**
 * SD-LEO-INFRA-REPO-HYGIENE-PATH-001, FR-2 -- unit tests for scripts/lint/root-dirt-lint.mjs's
 * pure exports. Builds a throwaway git repo fixture (not the live EHG_Engineer tree) so the
 * assertions are deterministic and independent of this repo's own untracked-file count at test
 * time.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { countUntrackedFiles, BASELINE, BUFFER, THRESHOLD } from '../../../scripts/lint/root-dirt-lint.mjs';

let repoDir;

beforeAll(() => {
  repoDir = mkdtempSync(path.join(tmpdir(), 'root-dirt-lint-fixture-'));
  execFileSync('git', ['init', '-q'], { cwd: repoDir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repoDir });
});

afterAll(() => {
  rmSync(repoDir, { recursive: true, force: true });
});

describe('THRESHOLD', () => {
  it('is BASELINE + BUFFER, both positive integers', () => {
    expect(THRESHOLD).toBe(BASELINE + BUFFER);
    expect(Number.isInteger(BASELINE)).toBe(true);
    expect(Number.isInteger(BUFFER)).toBe(true);
    expect(BASELINE).toBeGreaterThan(0);
    expect(BUFFER).toBeGreaterThan(0);
  });
});

describe('countUntrackedFiles', () => {
  it('returns 0 for a clean repo with no untracked files', () => {
    expect(countUntrackedFiles(repoDir)).toBe(0);
  });

  it('counts each untracked file exactly once', () => {
    writeFileSync(path.join(repoDir, 'a.txt'), 'a');
    writeFileSync(path.join(repoDir, 'b.txt'), 'b');
    expect(countUntrackedFiles(repoDir)).toBe(2);
  });

  it('does not count a tracked (committed) file', () => {
    execFileSync('git', ['add', 'a.txt'], { cwd: repoDir });
    execFileSync('git', ['commit', '-q', '-m', 'track a.txt'], { cwd: repoDir });
    // a.txt is now tracked; only b.txt should remain untracked.
    expect(countUntrackedFiles(repoDir)).toBe(1);
  });

  it('respects .gitignore -- an ignored file is not counted as untracked', () => {
    writeFileSync(path.join(repoDir, '.gitignore'), 'b.txt\nscratch/\n');
    execFileSync('git', ['add', '.gitignore'], { cwd: repoDir });
    execFileSync('git', ['commit', '-q', '-m', 'add gitignore'], { cwd: repoDir });
    // b.txt is now ignored -- count drops to 0.
    expect(countUntrackedFiles(repoDir)).toBe(0);
  });

  it('counts files inside an untracked directory individually (--untracked-files=all)', () => {
    const dir = path.join(repoDir, 'newdir');
    execFileSync('git', ['config', 'core.longpaths', 'true'], { cwd: repoDir });
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'x.txt'), 'x');
    writeFileSync(path.join(dir, 'y.txt'), 'y');
    // --untracked-files=all lists each file, not one line for the whole directory.
    expect(countUntrackedFiles(repoDir)).toBe(2);
    rmSync(dir, { recursive: true, force: true });
  });
});
