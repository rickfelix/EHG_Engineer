// QF-20260905-060 — isCwdWorktreeLiveClaim, DB-injected (hermetic: fake `sb`, no live DB).
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const { isCwdWorktreeLiveClaim } = require('../../../lib/fleet/cwd-worktree-liveness.cjs');

function fakeSb(table, row, error = null) {
  return {
    from: (t) => {
      expect(t).toBe(table);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error }),
          }),
        }),
      };
    },
  };
}

describe('isCwdWorktreeLiveClaim', () => {
  const SD_CWD = 'C:/Users/x/EHG_Engineer/.worktrees/SD-FOO-001';
  const QF_CWD = 'C:/Users/x/EHG_Engineer/.worktrees/qf/QF-999';

  it('no worktree segment at all: true (irrelevant -- repo-match axis skips it anyway)', async () => {
    const sb = { from: () => { throw new Error('must not query when no worktree key'); } };
    await expect(isCwdWorktreeLiveClaim(sb, 'C:/Users/x/EHG_Engineer')).resolves.toBe(true);
  });

  it('SD worktree, non-terminal status + a live claiming_session_id: true (LIVE)', async () => {
    const sb = fakeSb('strategic_directives_v2', { status: 'in_progress', claiming_session_id: 'sess-1' });
    await expect(isCwdWorktreeLiveClaim(sb, SD_CWD)).resolves.toBe(true);
  });

  it('SD worktree, terminal status: false (a "leftover" -- its own build already shipped)', async () => {
    const sb = fakeSb('strategic_directives_v2', { status: 'completed', claiming_session_id: null });
    await expect(isCwdWorktreeLiveClaim(sb, SD_CWD)).resolves.toBe(false);
  });

  it('SD worktree, non-terminal status but no active claim: false (never actually built here)', async () => {
    const sb = fakeSb('strategic_directives_v2', { status: 'draft', claiming_session_id: null });
    await expect(isCwdWorktreeLiveClaim(sb, SD_CWD)).resolves.toBe(false);
  });

  it('QF worktree, status=in_progress: true (LIVE)', async () => {
    const sb = fakeSb('quick_fixes', { status: 'in_progress' });
    await expect(isCwdWorktreeLiveClaim(sb, QF_CWD)).resolves.toBe(true);
  });

  it('QF worktree, status=completed: false (a "leftover")', async () => {
    const sb = fakeSb('quick_fixes', { status: 'completed' });
    await expect(isCwdWorktreeLiveClaim(sb, QF_CWD)).resolves.toBe(false);
  });

  it('row not found: true (could-not-determine -> old, stricter default)', async () => {
    const sb = fakeSb('strategic_directives_v2', null);
    await expect(isCwdWorktreeLiveClaim(sb, SD_CWD)).resolves.toBe(true);
  });

  it('query error: true (fail toward the pre-fix default, never toward new leniency)', async () => {
    const sb = fakeSb('strategic_directives_v2', null, new Error('boom'));
    await expect(isCwdWorktreeLiveClaim(sb, SD_CWD)).resolves.toBe(true);
  });

  it('a thrown error inside the client never propagates: true', async () => {
    const sb = { from: () => { throw new Error('boom'); } };
    await expect(isCwdWorktreeLiveClaim(sb, SD_CWD)).resolves.toBe(true);
  });
});

// Adversarial deep-tier review finding on this QF's own PR: worktreeKeyOfCwd parses the DIRECTORY
// NAME only, and a reused slot's directory keeps its PREVIOUS occupant's name while a NEW branch
// is checked out inside it (lib/fleet/worktree-reuse-marker.js's own header documents this exact
// pattern). Real temp git repos, not fakes -- currentBranchOf shells out to real git.
describe('slot-reuse sanity guard (adversarial review finding)', () => {
  function makeRepo(dirName) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwd-liveness-'));
    const repoDir = path.join(dir, '.worktrees', dirName);
    fs.mkdirSync(repoDir, { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 't@t.com'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.name', 't'], { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, 'a.txt'), 'x');
    execFileSync('git', ['add', 'a.txt'], { cwd: repoDir });
    execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: repoDir });
    return repoDir;
  }

  it('branch visibly diverges from the stale path-derived key: true, WITHOUT querying the DB', async () => {
    // Directory still named after the OLD occupant (SD-OLD-001); the checked-out branch names
    // the NEW one (SD-NEW-001) -- exactly the slot-reuse shape the review flagged.
    const repoDir = makeRepo('SD-OLD-001');
    execFileSync('git', ['checkout', '-q', '-b', 'feat/SD-NEW-001'], { cwd: repoDir });
    const sb = { from: () => { throw new Error('must not query the DB on a detected path/branch divergence'); } };
    await expect(isCwdWorktreeLiveClaim(sb, repoDir)).resolves.toBe(true);
  });

  it('branch matches the path-derived key: proceeds to the normal DB-backed check', async () => {
    const repoDir = makeRepo('SD-SAME-001');
    execFileSync('git', ['checkout', '-q', '-b', 'feat/SD-SAME-001'], { cwd: repoDir });
    // If the guard incorrectly short-circuited here, the DB would never be queried and this
    // fixture's terminal status (=> false) would never be observed.
    const sb = {
      from: (t) => {
        expect(t).toBe('strategic_directives_v2');
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: 'completed', claiming_session_id: null }, error: null }) }) }) };
      },
    };
    await expect(isCwdWorktreeLiveClaim(sb, repoDir)).resolves.toBe(false);
  });

  it('not a git repo at all (branch unresolvable): falls through to the normal DB-backed check, unaffected', async () => {
    const sb = fakeSb('strategic_directives_v2', { status: 'completed', claiming_session_id: null });
    const notAGitRepoSdCwd = 'C:/Users/x/EHG_Engineer/.worktrees/SD-FOO-001';
    await expect(isCwdWorktreeLiveClaim(sb, notAGitRepoSdCwd)).resolves.toBe(false); // same as the earlier terminal-status test
  });
});
