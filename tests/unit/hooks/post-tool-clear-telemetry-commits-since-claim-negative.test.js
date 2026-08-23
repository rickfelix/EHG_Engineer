/**
 * QF-20260728-720: commits_since_claim's NAME asserts "this seat's work"; the
 * implementation (collectGitMetrics -> `git log --since=<claimed_at>`, no
 * --author, no branch restriction) measures repository-wide commits instead.
 *
 * QF-20260728-430 (this fix): collectGitMetrics now accepts a worktreeBranch
 * argument and, when it is a valid branch name, scopes to commits reachable
 * from that branch but NOT from origin/main (`git log <branch> --not
 * origin/main`) — immune to another seat's merge to main, since `--author`
 * cannot substitute (every fleet seat commits under the same git identity).
 * Converted from `it.fails` to a plain `it` now that the fix lands, per this
 * file's own prior instruction — do not weaken the assertion back.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { collectGitMetrics } from '../../../scripts/hooks/post-tool-clear-telemetry.cjs';

let tmpDir;

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

// Git commit dates have 1-second granularity. Rather than relying on real
// wall-clock gaps (slow, flaky), commits are stamped with explicit
// GIT_AUTHOR_DATE/GIT_COMMITTER_DATE far apart so `--since` boundaries are
// unambiguous regardless of how fast the test itself runs.
const BASELINE_DATE = '2020-01-01T00:00:00Z';
const CLAIMED_AT = '2020-01-01T00:10:00Z';
const AFTER_CLAIM_DATE = '2020-01-01T00:20:00Z';

function commitAt({ cwd, dateIso, email, name, file, message }) {
  fs.writeFileSync(path.join(cwd, file), `${message}\n`);
  execSync(`git add ${file}`, { cwd });
  execSync(
    `git -c user.email=${email} -c user.name="${name}" commit -q -m "${message}"`,
    {
      cwd,
      env: { ...process.env, GIT_AUTHOR_DATE: dateIso, GIT_COMMITTER_DATE: dateIso },
    }
  );
}

function makeTempRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qf720-commits-'));
  execSync('git init -q', { cwd: dir });
  commitAt({
    cwd: dir, dateIso: BASELINE_DATE, email: 'seat@example.com', name: 'This Seat',
    file: 'baseline.txt', message: 'baseline',
  });
  return dir;
}

/**
 * A repo shaped like a real worktree: `origin/main` is a plain local ref (git does not
 * distinguish a manually-created ref named "origin/main" from a real remote-tracking one for
 * `git log`/`git diff` purposes) pinned at the baseline commit, and the seat works on a
 * genuinely separate branch — the shape collectGitMetrics' scoped path expects.
 */
function makeTempRepoWithBranch(branchName) {
  const dir = makeTempRepo();
  execSync('git branch origin/main', { cwd: dir }); // mimic a fetched remote-tracking ref
  execSync(`git checkout -q -b ${branchName}`, { cwd: dir });
  return dir;
}

describe('commits_since_claim negative test (QF-20260728-720 / fixed by QF-20260728-430)', () => {
  it('reads 0 when THIS SEAT made no commits since claiming, even though another author committed directly to origin/main in the window', () => {
    tmpDir = makeTempRepoWithBranch('feat/this-seat');

    // Simulate a DIFFERENT worker landing a commit on main (fetched into this worktree's
    // origin/main ref) in the SAME window — work the current seat did not do, and which the
    // seat's own branch never merged/rebased onto.
    execSync('git checkout -q origin/main', { cwd: tmpDir });
    commitAt({
      cwd: tmpDir, dateIso: AFTER_CLAIM_DATE, email: 'other@example.com', name: 'Other Worker',
      file: 'other-worker.txt', message: 'other worker commit',
    });
    execSync('git checkout -q feat/this-seat', { cwd: tmpDir });

    const metrics = collectGitMetrics(tmpDir, CLAIMED_AT, 'feat/this-seat');

    // TRUE state: this seat's own commit count since claiming is 0. Scoped to
    // feat/this-seat excluding origin/main, the other worker's commit (which never touched
    // this branch) is correctly invisible.
    expect(metrics.commits).toBe(0);
  });

  it('correctly reads 1 when this seat itself is the sole committer since claiming (sanity check)', () => {
    tmpDir = makeTempRepoWithBranch('feat/this-seat');

    commitAt({
      cwd: tmpDir, dateIso: AFTER_CLAIM_DATE, email: 'seat@example.com', name: 'This Seat',
      file: 'this-seat.txt', message: 'this seat commit',
    });

    const metrics = collectGitMetrics(tmpDir, CLAIMED_AT, 'feat/this-seat');
    expect(metrics.commits).toBe(1);
  });

  it('a seat whose worktree branch IS main reads 0 once origin/main has caught up to the same commits (the literal measured incident: a static seat tracking main)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qf720-commits-'));
    execSync('git init -q -b main', { cwd: dir });
    tmpDir = dir;
    commitAt({
      cwd: dir, dateIso: BASELINE_DATE, email: 'seat@example.com', name: 'This Seat',
      file: 'baseline.txt', message: 'baseline',
    });

    // Other workers merge to main; this worktree's own branch IS main, so it advances too —
    // exactly Charlie's measured scenario (worktree tracked main, 22 commits from others read
    // as 23 "since claim"). origin/main is created pointing at the SAME HEAD main has already
    // reached, mimicking a fetch that caught up — `--not origin/main` then reports 0 rather
    // than counting those commits as this seat's own work.
    execSync('git branch origin/main HEAD', { cwd: dir });

    const metrics = collectGitMetrics(dir, CLAIMED_AT, 'main');
    expect(metrics.commits).toBe(0);
  });

  it('falls back to the unscoped whole-HEAD query when no valid branch name is supplied (legacy/non-worktree seats) — old behavior, unchanged and still a fleet-wide proxy', () => {
    tmpDir = makeTempRepo();
    commitAt({
      cwd: tmpDir, dateIso: AFTER_CLAIM_DATE, email: 'other@example.com', name: 'Other Worker',
      file: 'other-worker.txt', message: 'other worker commit',
    });

    expect(collectGitMetrics(tmpDir, CLAIMED_AT, undefined).commits).toBe(1);
    expect(collectGitMetrics(tmpDir, CLAIMED_AT, '').commits).toBe(1);
    // Rejects an unsafe branch string (shell-metacharacter fail-closed) by falling back too.
    expect(collectGitMetrics(tmpDir, CLAIMED_AT, 'main; rm -rf /').commits).toBe(1);
  });
});
