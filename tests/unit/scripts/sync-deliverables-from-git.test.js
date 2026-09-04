/**
 * QF-20260903-950: scripts/sync-deliverables-from-git.js
 *
 * Real git subprocess tests (no mocking) against a throwaway temp repo -- deliberately, since
 * two of the four defects fixed here are execSync/cmd.exe platform behavior (DEFECT 2) and real
 * squash-merge history shape (DEFECT 3) that a mocked child_process cannot demonstrate.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import {
  getGitCommits, getMainHistoryCommits, parseCommitLog,
} from '../../../scripts/sync-deliverables-from-git.js';

function git(repoPath, cmd) {
  return execSync(`git -C "${repoPath}" ${cmd}`, { encoding: 'utf-8' });
}

describe('parseCommitLog (defect found while fixing QF-20260903-950 -- not one of the 3 named)', () => {
  it('parses a well-formed "%H|%s|%ai" header followed by name-status lines into structured commits', () => {
    const hash1 = 'a'.repeat(40);
    const hash2 = 'b'.repeat(40);
    const logOutput = [
      `${hash1}|feat: first commit (SD-X-001)|2026-09-01 10:00:00 +0000`,
      'A\tfoo/bar.js',
      'M\tbaz.md',
      `${hash2}|feat: second commit|2026-09-02 10:00:00 +0000`,
      'D\told-file.js',
    ].join('\n');

    const commits = parseCommitLog(logOutput);

    expect(commits).toHaveLength(2);
    expect(commits[0]).toMatchObject({ hash: hash1, message: 'feat: first commit (SD-X-001)' });
    expect(commits[0].files).toEqual([
      { operation: 'create', path: 'foo/bar.js' },
      { operation: 'modify', path: 'baz.md' },
    ]);
    expect(commits[1]).toMatchObject({ hash: hash2 });
    expect(commits[1].files).toEqual([{ operation: 'delete', path: 'old-file.js' }]);
  });

  it('returns [] for empty/blank input rather than throwing', () => {
    expect(parseCommitLog('')).toEqual([]);
    expect(parseCommitLog('   \n  ')).toEqual([]);
  });
});

describe('getGitCommits / getMainHistoryCommits against a real temp git repo', () => {
  let repoPath;
  const sdKey = 'SD-QF950-TESTREPO-001';

  beforeAll(() => {
    repoPath = mkdtempSync(path.join(tmpdir(), 'qf950-sync-deliverables-'));
    git(repoPath, 'init -b main');
    git(repoPath, 'config user.email "qf950@test.local"');
    git(repoPath, 'config user.name "QF950 Test"');

    writeFileSync(path.join(repoPath, 'README.md'), 'init\n');
    git(repoPath, 'add README.md');
    git(repoPath, 'commit -m "chore: initial commit"');

    // A still-open feature branch with real commits (DEFECT 1 + DEFECT 2/4 coverage: the
    // normal, non-squash-merged case must also work end-to-end).
    git(repoPath, `checkout -b feat/${sdKey}`);
    writeFileSync(path.join(repoPath, 'feature.js'), 'export const x = 1;\n');
    git(repoPath, 'add feature.js');
    git(repoPath, `commit -m "feat(${sdKey}): add feature file"`);
    git(repoPath, 'checkout main');

    // A DIFFERENT SD, already squash-merged and its branch deleted -- the shape DEFECT 3 exists
    // to handle. No "feat/<key>" branch exists for this key at all.
    writeFileSync(path.join(repoPath, 'squashed-feature.js'), 'export const y = 2;\n');
    git(repoPath, 'add squashed-feature.js');
    git(repoPath, `commit -m "feat(SD-QF950-SQUASHED-001): squash-merged feature (SD-QF950-SQUASHED-001)"`);
  }, 30000); // real git subprocesses under parallel test-worker load can exceed the 10s default

  afterAll(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it('DEFECT 1/4: finds commits on a still-open branch via the verified branch name (not HEAD)', () => {
    const commits = getGitCommits(sdKey, repoPath);
    expect(commits).toHaveLength(1);
    expect(commits[0].files).toEqual([{ operation: 'create', path: 'feature.js' }]);
  });

  it('DEFECT 2: throws (never silently returns []) when the git command genuinely fails', () => {
    const notARepo = path.join(repoPath, 'does-not-exist-as-a-repo');
    expect(() => getGitCommits(sdKey, notARepo)).toThrow();
  });

  it('DEFECT 3: branch-diff alone is blind to an already squash-merged, branch-deleted SD', () => {
    expect(getGitCommits('SD-QF950-SQUASHED-001', repoPath)).toEqual([]);
  });

  it('DEFECT 3 fix: getMainHistoryCommits finds the squash-merged SD by commit subject and reads its real file changes', () => {
    const commits = getMainHistoryCommits('SD-QF950-SQUASHED-001', repoPath);
    expect(commits.length).toBeGreaterThan(0);
    const files = commits.flatMap(c => c.files.map(f => f.path));
    expect(files).toContain('squashed-feature.js');
  });

  it('DEFECT 3: does NOT cross-match a different, unrelated SD key (end-anchored, per the ratified anchoredKeyPattern)', () => {
    expect(getMainHistoryCommits('SD-QF950-SQUASHED', repoPath)).toEqual([]);
  });
});
