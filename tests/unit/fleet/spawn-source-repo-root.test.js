/**
 * SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001 — resolving the MAIN repo root from any worktree.
 *
 * This is the piece I got wrong twice before writing it, so the wrong answers are pinned as
 * tests rather than only as comments:
 *   - deriving it from path.dirname(cwd) resolves ABOVE the repo for a root-launched spawn, and
 *     under .worktrees/ for a worktree-launched one (which the siting guard then throws on,
 *     breaking those spawns entirely);
 *   - worktree-manager getRepoRoot() resolves against process.cwd(), not the tree being spawned
 *     from, so a server-hosted spawn asks the wrong directory.
 *
 * The correct method asks git: `rev-parse --git-common-dir` returns <main>/.git from ANY worktree,
 * so its parent is the main root. That is layout-independent — unlike the '/.worktrees/' string
 * literal that three separate guards in this repo are keyed to, each silently wrong elsewhere.
 */
import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { resolveMainRepoRoot } from '../../../lib/fleet/spawn-control.js';

const MAIN = '/repo';
// Compare against path.normalize(MAIN), not the literal: path.join('/repo', '.git') yields
// '\repo\.git' on Windows, so dirname correctly returns '\repo'. Asserting the literal '/repo'
// would fail on Windows and pass on POSIX — a platform-dependent test, not a real expectation.
const MAIN_NORM = path.normalize(MAIN);
const gitRunner = (out) => vi.fn(() => out);

describe('resolveMainRepoRoot', () => {
  it('returns the main root when invoked from the main tree', () => {
    const run = gitRunner(path.join(MAIN, '.git') + '\n');
    expect(resolveMainRepoRoot(MAIN, run)).toBe(MAIN_NORM);
  });

  it('returns the MAIN root when invoked from inside a worktree — the case that matters', () => {
    // git-common-dir reports the main .git even from a linked worktree, which is precisely why
    // this is layout-independent where a path-string unwind is not.
    const run = gitRunner(path.join(MAIN, '.git') + '\n');
    expect(resolveMainRepoRoot('/repo/.worktrees/SD-X', run)).toBe(MAIN_NORM);
  });

  it('pins cwd to the directory it was asked about, not process.cwd()', () => {
    const run = gitRunner(path.join(MAIN, '.git'));
    resolveMainRepoRoot('/repo/.worktrees/SD-X', run);
    expect(run).toHaveBeenCalledWith(
      expect.arrayContaining(['rev-parse', '--git-common-dir']),
      expect.objectContaining({ cwd: '/repo/.worktrees/SD-X' }),
    );
  });

  it('asks for an ABSOLUTE path — a relative .git would make dirname meaningless', () => {
    const run = gitRunner(path.join(MAIN, '.git'));
    resolveMainRepoRoot(MAIN, run);
    expect(run).toHaveBeenCalledWith(expect.arrayContaining(['--path-format=absolute']), expect.anything());
  });

  it('fails SOFT to null when git throws — a hiccup must not become a fleet-wide spawn outage', () => {
    const run = vi.fn(() => { throw new Error('not a git repository'); });
    expect(resolveMainRepoRoot(MAIN, run)).toBe(null);
  });

  it('fails soft on empty output rather than returning a bogus path', () => {
    expect(resolveMainRepoRoot(MAIN, gitRunner('   \n'))).toBe(null);
  });

  it('fails soft when no runner is supplied, rather than throwing at the call site', () => {
    expect(resolveMainRepoRoot(MAIN)).toBe(null);
    expect(resolveMainRepoRoot(MAIN, 'not-a-function')).toBe(null);
  });
});
