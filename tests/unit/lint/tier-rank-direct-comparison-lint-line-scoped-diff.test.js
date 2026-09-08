/**
 * QF-20260907-544 — tier-rank-direct-comparison-lint.mjs's --diff mode selected whole FILES
 * changed vs the merge base (candidateFiles), then re-linted each file's ENTIRE current content —
 * a pre-existing allowlisted-by-line-number violation whose line SHIFTED (an unrelated earlier
 * edit added/removed lines above it) reported as a fresh, unallowlisted violation even though the
 * PR never touched that line. Measured twice on this exact lint (QF-20260905-562, QF-20260904-610:
 * scripts/leo-create-sd.js's --min-tier-rank help text shifted 177->178->179 from unrelated edits
 * above it, each time requiring an allowlist-line bump for a PR that touched neither the flagged
 * line's content nor line 179 itself).
 *
 * Mirrors tests/unit/lint/session-coordination-insert-classguard-lint-line-scoped-diff.test.js's
 * own convention: spawns the REAL script against a real temp git repo, not a mocked internal
 * function.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const SCRIPT = path.join(REPO_ROOT, 'scripts/lint/tier-rank-direct-comparison-lint.mjs');

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

const VIOLATION_LINE = "  return sd.metadata.min_tier_rank > workerRank ? 'blocked' : 'ok';\n";

/** A real repo with origin/main resolvable, a pre-existing violation already on main (allowlisted
 *  by its ORIGINAL line number), and a `feature` branch that edits the SAME file ABOVE the
 *  violation -- shifting its line number without touching its content, exactly like an unrelated
 *  earlier PR shifting scripts/leo-create-sd.js's --min-tier-rank help text. */
function makeRepoLineShift() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tier-rank-linescope-'));
  const bareRemote = path.join(root, 'remote.git');
  const work = path.join(root, 'work');
  git(['init', '-q', '--bare', bareRemote]);
  fs.mkdirSync(work, { recursive: true });
  git(['init', '-q', '-b', 'main'], work);
  git(['config', 'user.email', 't@t.com'], work);
  git(['config', 'user.name', 't'], work);
  fs.mkdirSync(path.join(work, 'scripts'), { recursive: true });
  const preExisting = 'function claimable(sd, workerRank) {\n' + VIOLATION_LINE + '}\n';
  fs.writeFileSync(path.join(work, 'scripts', 'sweep.js'), preExisting);
  fs.mkdirSync(path.join(work, 'scripts', 'lint'), { recursive: true });
  // Allowlisted at its ORIGINAL line (3: the VIOLATION_LINE), matching a genuine grandfathered entry.
  fs.writeFileSync(path.join(work, 'scripts', 'lint', 'tier-rank-direct-comparison-allowlist.json'), JSON.stringify({
    entries: [{ file: 'scripts/sweep.js', line: 2, note: 'grandfathered, allowlisted at its original line' }],
  }));
  git(['add', '.'], work);
  git(['commit', '-q', '-m', 'pre-existing allowlisted violation'], work);
  git(['remote', 'add', 'origin', bareRemote], work);
  git(['push', '-q', 'origin', 'main'], work);

  git(['checkout', '-q', '-b', 'feature'], work);
  // Insert TWO new lines above the violation -- shifts it from line 2 to line 4, desyncing the
  // allowlist entry, WITHOUT the PR ever touching the violation's own line or content.
  const shifted = 'function claimable(sd, workerRank) {\n'
    + '  // an unrelated comment added above\n'
    + "  console.log('unrelated logging added above');\n"
    + VIOLATION_LINE
    + '}\n';
  fs.writeFileSync(path.join(work, 'scripts', 'sweep.js'), shifted);
  git(['add', '.'], work);
  git(['commit', '-q', '-m', 'unrelated edit that shifts the violation line'], work);
  return work;
}

/** Same shape, but the feature branch's edit IS the violation itself (added on a changed line, no allowlist entry). */
function makeRepoNewViolation() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tier-rank-linescope-new-'));
  const bareRemote = path.join(root, 'remote.git');
  const work = path.join(root, 'work');
  git(['init', '-q', '--bare', bareRemote]);
  fs.mkdirSync(work, { recursive: true });
  git(['init', '-q', '-b', 'main'], work);
  git(['config', 'user.email', 't@t.com'], work);
  git(['config', 'user.name', 't'], work);
  fs.mkdirSync(path.join(work, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(work, 'scripts', 'sweep.js'), 'function f() { return 1; }\n');
  git(['add', '.'], work);
  git(['commit', '-q', '-m', 'init'], work);
  git(['remote', 'add', 'origin', bareRemote], work);
  git(['push', '-q', 'origin', 'main'], work);

  git(['checkout', '-q', '-b', 'feature'], work);
  fs.writeFileSync(path.join(work, 'scripts', 'sweep.js'), 'function f() { return 1; }\n' + VIOLATION_LINE);
  git(['add', '.'], work);
  git(['commit', '-q', '-m', 'introduce a NEW violation'], work);
  return work;
}

function runScript(cwd) {
  const env = { ...process.env };
  return spawnSync('node', [SCRIPT, '--json'], { cwd, encoding: 'utf8', env });
}

describe('tier-rank-direct-comparison-lint.mjs — line-scoped diff (QF-20260907-544)', () => {
  it('a pre-existing violation whose line SHIFTED due to an unrelated edit above it does NOT block', () => {
    const work = makeRepoLineShift();
    const r = runScript(work);
    const out = JSON.parse(r.stdout);
    expect(out.mode).toBe('diff');
    expect(out.violations).toHaveLength(0);
    expect(r.status).toBe(0);
  });

  it('ANTI-VACUITY: a genuinely NEW violation on a changed line still blocks', () => {
    const work = makeRepoNewViolation();
    const r = runScript(work);
    const out = JSON.parse(r.stdout);
    expect(out.mode).toBe('diff');
    expect(out.violations.length).toBeGreaterThan(0);
    expect(r.status).toBe(1);
  });
});
