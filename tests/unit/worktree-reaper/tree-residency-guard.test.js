/**
 * SD-FDBK-INFRA-ORPHAN-WORKTREE-STRANDING-001-B FR-2 — tree residency.
 *
 * FIXTURE CONSTRUCTION IS THE TEST. Two traps were MEASURED at PLAN, and getting either
 * wrong makes this suite pass against broken code:
 *
 *  - An ISOLATED tmpdir is VACUOUS. `git log` there exits 128, headMs stays 0, and the
 *    guarded and unguarded implementations agree. The orphan MUST be nested inside a real
 *    git repo whose HEAD moved recently, or the walk-up never happens and nothing is proved.
 *    (Every pre-existing fixture in worktree-residency-guard.test.js is the vacuous shape.)
 *
 *  - A FRESHLY-CREATED directory has mtime = now, so a CORRECT implementation reports it
 *    resident. Backdate the orphan AFTER writing its children or the test false-REDs against
 *    working code.
 *
 * Each polarity test carries an ARMING ASSERTION: it asserts the raw unguarded signal that
 * WOULD have produced the wrong answer. If a future edit quiets the trap, the arming
 * assertion fails loudly instead of this suite silently going vacuous.
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import {
  treeResidencyBlocksRemoval,
  REAP_BLOCKED_TREE_RESIDENT,
  REAP_RESIDENCY_UNKNOWN,
  DEFAULT_RESIDENCY_WINDOW_MIN,
} from '../../../lib/worktree-reaper/residency-guard.js';

const MIN = 60 * 1000;

// The injected clock is DERIVED from the fixture's own commit rather than hard-coded.
// git stamps %ct with the real committer clock (GIT_COMMITTER_DATE, not --date), so a
// hard-coded constant sits an arbitrary distance from it and every signal reads stale —
// which silently turns the whole suite green-for-the-wrong-reason. Anchoring NOW one
// minute after the parent commit keeps the run deterministic (nowMs is still injected
// everywhere; nothing reads the wall clock at assertion time) AND keeps it truthful.
let NOW;
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

let root;        // the parent git repo
let orphanDir;   // .git-LESS dir nested inside it — the walk-up victim
let realWt;      // a genuine worktree root

/** Backdate a directory so a correct implementation does NOT call it resident. */
function backdate(dir, minutesAgo) {
  const t = new Date(NOW - minutesAgo * MIN);
  fs.utimesSync(dir, t, t);
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr2-parent-'));
  git(['init', '-q', '-b', 'main'], root);
  git(['config', 'user.email', 'fr2@test.local'], root);
  git(['config', 'user.name', 'FR2 Fixture'], root);
  fs.writeFileSync(path.join(root, 'seed.txt'), 'seed');
  git(['add', '-A'], root);
  git(['commit', '-q', '-m', 'seed'], root);

  // Anchor the injected clock to the commit git actually recorded. Parent HEAD is then
  // RECENT by construction — and that recency is the entire walk-up mechanism.
  // (A dirty parent tree is decorative: it affects neither `log -1` nor `--show-toplevel`.)
  NOW = Number(git(['log', '-1', '--format=%ct'], root).trim()) * 1000 + 1 * MIN;

  orphanDir = path.join(root, '.worktrees', 'scribe-privesc-20260731');
  fs.mkdirSync(orphanDir, { recursive: true });
  fs.writeFileSync(path.join(orphanDir, 'leftover.txt'), 'stranded');
  backdate(orphanDir, 24 * 60); // children first, THEN backdate

  realWt = path.join(root, '.worktrees', 'SD-REAL-001');
  git(['worktree', 'add', '-q', '-b', 'feat/SD-REAL-001', realWt], root);
});

afterAll(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('treeResidencyBlocksRemoval — the walk-up trap', () => {
  test('ARMING: the unguarded HEAD probe really does return the PARENT repo time for a .git-less dir', () => {
    // If this ever stops holding, the guard below is testing nothing.
    const orphanHead = Number(git(['log', '-1', '--format=%ct'], orphanDir).trim());
    const parentHead = Number(git(['log', '-1', '--format=%ct'], root).trim());
    expect(orphanHead).toBe(parentHead);
    expect(NOW - orphanHead * 1000).toBeLessThan(DEFAULT_RESIDENCY_WINDOW_MIN * MIN);
    expect(fs.existsSync(path.join(orphanDir, '.git'))).toBe(false);
  });

  test('a .git-less orphan is NOT resident, even though its parent just committed', () => {
    const r = treeResidencyBlocksRemoval(orphanDir, { nowMs: NOW });
    expect(r.blocked).toBe(false);
    expect(r.detail.is_worktree_root).toBe(false);
    expect(r.detail.age_ms).toBeGreaterThan(DEFAULT_RESIDENCY_WINDOW_MIN * MIN);
  });

  test('an injected walk-up gitRunner cannot resurrect the trap', () => {
    // Emulates the unguarded implementation: --show-toplevel answers with the PARENT.
    const walkUp = (args) => args[0] === 'rev-parse'
      ? { code: 0, stdout: root }
      : { code: 0, stdout: String(Math.floor((NOW - MIN) / 1000)) };
    const r = treeResidencyBlocksRemoval(orphanDir, { nowMs: NOW, gitRunner: walkUp });
    expect(r.blocked).toBe(false); // toplevel !== wtPath, so HEAD is never consulted
  });
});

describe('treeResidencyBlocksRemoval — the polarity that keeps it honest', () => {
  test('a GENUINE worktree root whose HEAD just moved IS resident (guards against always-clear)', () => {
    // This is the C2 case: --show-toplevel yields forward slashes on Windows while
    // path.resolve yields backslashes, so a naive === compare fails HERE and the guard
    // silently degenerates to always-clear while still passing the orphan tests above.
    const r = treeResidencyBlocksRemoval(realWt, { nowMs: NOW });
    expect(r.detail.is_worktree_root).toBe(true);
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe(REAP_BLOCKED_TREE_RESIDENT);
  });

  test('ARMING: the real toplevel and the path differ textually, so the comparison must normalize', () => {
    const toplevel = git(['rev-parse', '--show-toplevel'], realWt).trim();
    expect(path.resolve(toplevel).toLowerCase()).toBe(path.resolve(realWt).toLowerCase());
  });

  test('a genuine worktree with BOTH signals stale is not resident — the pool still drains', () => {
    const r = treeResidencyBlocksRemoval(realWt, {
      nowMs: NOW,
      statFn: () => ({ mtimeMs: NOW - 48 * 60 * MIN }),
      gitRunner: (args) => args[0] === 'rev-parse'
        ? { code: 0, stdout: realWt }
        : { code: 0, stdout: String(Math.floor((NOW - 48 * 60 * MIN) / 1000)) },
    });
    expect(r.blocked).toBe(false);
  });

  test('recent mtime alone blocks, with no git signal at all', () => {
    const r = treeResidencyBlocksRemoval(orphanDir, {
      nowMs: NOW,
      statFn: () => ({ mtimeMs: NOW - 2 * MIN }),
      gitRunner: () => ({ code: 128, stdout: '' }),
    });
    expect(r.blocked).toBe(true);
    expect(r.detail.head_ms).toBe(0);
  });
});

describe('treeResidencyBlocksRemoval — degenerate inputs', () => {
  test('a pruned worktree (git fails outright) falls through to mtime without throwing', () => {
    const r = treeResidencyBlocksRemoval(orphanDir, {
      nowMs: NOW,
      gitRunner: () => ({ code: 128, stdout: '' }),
    });
    expect(r.blocked).toBe(false); // orphan was backdated 24h
    expect(r.reason).toBeNull();
  });

  test('a missing directory is not resident (absent is not occupied)', () => {
    const r = treeResidencyBlocksRemoval(path.join(root, 'no-such-dir'), { nowMs: NOW });
    expect(r.blocked).toBe(false);
  });

  test('a THROW still fails CLOSED — unlike a non-zero git exit', () => {
    const r = treeResidencyBlocksRemoval(realWt, {
      nowMs: NOW,
      gitRunner: () => { throw new Error('boom'); },
    });
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe(REAP_RESIDENCY_UNKNOWN);
  });

  test('the window is configurable and respected in both directions', () => {
    const opts = { nowMs: NOW, statFn: () => ({ mtimeMs: NOW - 45 * MIN }), gitRunner: () => ({ code: 128, stdout: '' }) };
    expect(treeResidencyBlocksRemoval(orphanDir, { ...opts, windowMin: 60 }).blocked).toBe(true);
    expect(treeResidencyBlocksRemoval(orphanDir, { ...opts, windowMin: 30 }).blocked).toBe(false);
  });
});
