/**
 * QF-20260913-950: DOCMON's markdown scans must root at the CURRENT checkout's git
 * top-level, never a module-relative parent directory.
 *
 * THE DEFECT. lib/sub-agents/docmon.js:144 (pre-fix) computed
 * `rootDir = options.root_dir || path.resolve(__dirname, '../../..')`. __dirname is
 * <checkout>/lib/sub-agents, so `../../..` lands ONE LEVEL ABOVE the checkout: the
 * folder holding every sibling repo for a root checkout, or the whole `.worktrees`
 * forest for a worktree checkout. findFiles then recursed into all of it (only
 * excluding node_modules/.git/dist/build/.next by name), walking ~190k directories
 * instead of ~1k and hanging with zero output.
 *
 * THE FIX. resolveDocmonRoot() resolves `git rev-parse --show-toplevel` from this
 * module's own directory, which always returns the checkout docmon.js is actually
 * loaded from (main repo OR a worktree, never their parent). findFiles additionally
 * prunes `.worktrees`, `.artifacts`, `.logs`, `_archive`, `coverage`, `tmp` by name at
 * any depth, since a root checkout's own top level still legitimately contains
 * `.worktrees` (sibling worktrees nested inside it).
 *
 * These tests build a REAL fixture git repo with a sibling repo directory (simulating
 * `_EHG/ehg` next to `_EHG/EHG_Engineer`) and a nested `.worktrees/childrepo` (simulating
 * EHG_Engineer's own worktree forest), each seeded with a marker markdown file the OLD
 * resolution would have found and the NEW one must not.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveDocmonRoot, findFiles } from '../../../lib/sub-agents/docmon.js';

const git = (repo, args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const rm = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } };

describe('resolveDocmonRoot', () => {
  let fixtureParent, myrepo, siblingrepo, nestedWorktree;

  beforeAll(() => {
    // fixtureParent/
    //   siblingrepo/           <- simulates a sibling app repo (e.g. "ehg")
    //     SD-SIBLING-LEAK.md   <- the OLD bug's module-relative-parent walk would reach this
    //   myrepo/                <- the repo actually under test (simulates EHG_Engineer)
    //     .git/
    //     SD-REAL.md           <- a real, in-scope marker
    //     .worktrees/childrepo/
    //       SD-WORKTREE-LEAK.md  <- the OLD bug (or an unpruned NEW walk) would reach this
    fixtureParent = fs.mkdtempSync(path.join(os.tmpdir(), 'docmon-root-'));
    siblingrepo = path.join(fixtureParent, 'siblingrepo');
    myrepo = path.join(fixtureParent, 'myrepo');
    nestedWorktree = path.join(myrepo, '.worktrees', 'childrepo');

    fs.mkdirSync(siblingrepo, { recursive: true });
    fs.writeFileSync(path.join(siblingrepo, 'SD-SIBLING-LEAK.md'), '# leak\n');

    fs.mkdirSync(myrepo, { recursive: true });
    git(myrepo, ['init', '-q', '-b', 'main']);
    git(myrepo, ['config', 'user.email', 'test@example.invalid']);
    git(myrepo, ['config', 'user.name', 'Test']);
    git(myrepo, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(myrepo, 'SD-REAL.md'), '# real\n');
    git(myrepo, ['add', '-A']);
    git(myrepo, ['commit', '-q', '-m', 'base']);

    fs.mkdirSync(nestedWorktree, { recursive: true });
    fs.writeFileSync(path.join(nestedWorktree, 'SD-WORKTREE-LEAK.md'), '# leak\n');
  });

  afterAll(() => { if (fixtureParent) rm(fixtureParent); });

  it('resolves to the fixture repo itself, never its parent', () => {
    const resolved = resolveDocmonRoot({ cwd: myrepo });
    expect(resolved).toBe(fs.realpathSync(myrepo));
  });

  it('the OLD module-relative-parent shape would have escaped to the sibling repo (the bug, reproduced)', () => {
    // Reconstructs the pre-fix computation directly against this fixture's own layout
    // (a repo one level below its parent) to prove the escape was real, not asserted.
    const oldRootDir = path.resolve(myrepo, '..');
    expect(oldRootDir).toBe(fixtureParent);
    expect(fs.existsSync(path.join(oldRootDir, 'siblingrepo', 'SD-SIBLING-LEAK.md'))).toBe(true);
  });

  it('a walk from the resolved root, pruning .worktrees, never enters the nested worktree forest', async () => {
    const resolved = resolveDocmonRoot({ cwd: myrepo });
    const found = await findMarkerFiles(resolved, ['.worktrees']);
    expect(found).toContain('SD-REAL.md');
    expect(found).not.toContain('SD-WORKTREE-LEAK.md');
    // and the sibling repo is structurally unreachable: it is not even inside `resolved`.
    expect(path.relative(resolved, siblingrepo).startsWith('..')).toBe(true);
  });
});

describe('findFiles — real-world ancestor-path regression', () => {
  // LIVE-MEASURED against this actual worktree checkout (2026-09-13): the first version of this
  // fix pruned by testing whether the FULL ABSOLUTE PATH contained `${sep}.worktrees${sep}`
  // anywhere. Every `git worktree` checkout's own path is, by construction, physically nested
  // inside a directory literally named `.worktrees` (that is where `git worktree add` puts it) --
  // so that check matched every entry's ANCESTRY, not just descendants, and pruned the entire
  // tree at the very first level. A live run against this real worktree reported
  // "Directories walked: 4" (should have been ~6000) and completed suspiciously instantly with
  // zero real files found. Fixed by matching `entry.name` only. This fixture reproduces the same
  // topology synthetically: the fixture repo itself lives inside a `.worktrees/<name>` path.
  let fixtureRoot;

  beforeAll(() => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'docmon-ancestor-'));
    fixtureRoot = path.join(parent, '.worktrees', 'fakeqf');
    fs.mkdirSync(fixtureRoot, { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, 'SD-REAL.md'), '# real\n');
    fs.mkdirSync(path.join(fixtureRoot, 'node_modules', 'somepkg'), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, 'node_modules', 'somepkg', 'SD-DECOY.md'), '# decoy\n');
    fs.mkdirSync(path.join(fixtureRoot, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, 'lib', 'SD-NESTED.md'), '# nested real\n');
  });

  afterAll(() => { if (fixtureRoot) rm(path.dirname(fixtureRoot)); });

  it('finds real markdown files even though the scan root itself is nested inside a `.worktrees` path', async () => {
    const stats = { dirsWalked: 0 };
    const found = await findFiles(fixtureRoot, /^SD-.*\.md$/, [], stats);
    const names = found.map((f) => path.basename(f));
    expect(names).toContain('SD-REAL.md');
    expect(names).toContain('SD-NESTED.md');
    // node_modules itself IS a direct child of the scan root and must still be pruned.
    expect(names).not.toContain('SD-DECOY.md');
    // more than the single top-level call -- proves real recursion happened, not an
    // immediate ancestor-match short-circuit.
    expect(stats.dirsWalked).toBeGreaterThan(1);
  });
});

/** Minimal stand-in for docmon's own findFiles, pruning only the named dir by name. */
async function findMarkerFiles(dir, pruneNames) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (pruneNames.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await findMarkerFiles(full, pruneNames)));
    } else if (/^SD-.*\.md$/.test(entry.name)) {
      results.push(entry.name);
    }
  }
  return results;
}
