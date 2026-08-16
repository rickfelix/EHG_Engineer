/**
 * QF-20260728-720: commits_since_claim's NAME asserts "this seat's work"; the
 * implementation (collectGitMetrics -> `git log --since=<claimed_at>`, no
 * --author, no branch restriction) measures repository-wide commits instead.
 *
 * Negative test: construct the false state (this seat made ZERO commits since
 * claiming, but ANOTHER author committed in the same window) and assert the
 * field does not claim work this seat did not do. A field with no negative
 * test is a check that cannot fail at the storage layer — see
 * docs/reference/field-name-is-a-claim.md.
 *
 * A companion fix is tracked separately at QF-20260728-430 (open as of this
 * writing) — this test is expected to FAIL until that fix lands, and is the
 * regression pin that proves it when it does.
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

describe('commits_since_claim negative test (QF-20260728-720)', () => {
  // it.fails: this pins a LIVE, currently-true defect (companion fix tracked
  // at QF-20260728-430, open). Under it.fails, vitest reports GREEN while the
  // assertion inside keeps failing (the honest state today) and reports RED
  // the moment it starts passing — i.e. this test alerts, rather than stays
  // silently green, the moment someone fixes the field. Do not "fix" this
  // test by weakening the assertion; when QF-20260728-430 lands, convert
  // this to a plain `it` instead.
  it.fails('reads 0 when THIS SEAT made no commits since claiming, even though another author committed in the window', () => {
    tmpDir = makeTempRepo();

    // Simulate a DIFFERENT worker landing a commit in the SAME repo/branch
    // window, after claimed_at — this is work the current seat did not do.
    commitAt({
      cwd: tmpDir, dateIso: AFTER_CLAIM_DATE, email: 'other@example.com', name: 'Other Worker',
      file: 'other-worker.txt', message: 'other worker commit',
    });

    const metrics = collectGitMetrics(tmpDir, CLAIMED_AT);

    // TRUE state: this seat's own commit count since claiming is 0.
    // collectGitMetrics has no --author filter, so it currently reports the
    // OTHER worker's commit as if it were this seat's — the false claim the
    // field's name makes. This assertion documents the honest value and is
    // expected to fail until QF-20260728-430 adds author scoping.
    expect(metrics.commits).toBe(0);
  });

  it('correctly reads 1 when this seat itself is the sole committer since claiming (sanity check, should pass today)', () => {
    tmpDir = makeTempRepo();

    commitAt({
      cwd: tmpDir, dateIso: AFTER_CLAIM_DATE, email: 'seat@example.com', name: 'This Seat',
      file: 'this-seat.txt', message: 'this seat commit',
    });

    const metrics = collectGitMetrics(tmpDir, CLAIMED_AT);
    expect(metrics.commits).toBe(1);
  });
});
