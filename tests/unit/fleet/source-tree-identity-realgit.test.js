/**
 * S2-R (EXEC SECURITY re-review, BLOCKING) — SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001.
 *
 * WHY THIS FILE EXISTS AND THE OTHER IDENTITY SUITE WAS NOT ENOUGH. My first identity guard
 * compared `rev-parse --git-common-dir` between the candidate and the repo root. That is defeated
 * by a bare `mkdir`, because rev-parse WALKS UP PARENT DIRECTORIES and the default source-tree path
 * sits INSIDE repoRoot's working tree — so a plain directory with no .git of its own answers with
 * repoRoot's OWN common dir and compares equal. Capability required: one mkdir plus one file write,
 * strictly LESS than the `git init` + fake-remote attack the guard was written against. And
 * .reaper-source/ is gitignored, so the plant is invisible to `git status`.
 *
 * THE TESTS WERE GREEN OVER THE DEFEATED GUARD. Every arm of source-tree-identity.test.js uses a
 * synthetic per-directory lookup runner, and that fixture ENCODES THE VERY ASSUMPTION REAL GIT
 * VIOLATES: it answers per-directory, so a "plain subdirectory" simply cannot be expressed in it.
 * A guard that runs but cannot observe its subject is not tested by a fixture that shares its blind
 * spot — being two-sided in that fixture proved logic, not observability.
 *
 * SO THIS SUITE DRIVES REAL GIT against real temporary repositories. It is the only construction
 * that can see this class. It builds its own scratch repos under os.tmpdir() and NEVER touches the
 * live repo or the live worktree pool.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const {
  ensureSourceTreeWorktree, SOURCE_TREE_IDENTITY_ERROR,
  REAPER_SOURCE_DIRNAME, REAPER_SOURCE_BRANCH,
  scrubGitEnv, GIT_REDIRECT_ENV_KEYS, SOURCE_TREE_AHEAD_ERROR,
} = require_('../../../lib/fleet/source-tree-refresh.cjs');

/** The real runner shape production uses: (args, o) => execFileSync('git', args, {...}). */
const realGit = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

let root;          // a real git repo
let plantedDir;    // <root>/.reaper-source as a PLAIN directory (the attack)
let realWtDir;     // <root>/.real-source as a GENUINE linked worktree (the control)

let originDir;     // a real bare remote, so origin/main actually resolves

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 's2r-')));
  realGit(['-C', root, 'init', '-q']);
  realGit(['-C', root, 'config', 'user.email', 'test@example.com']);
  realGit(['-C', root, 'config', 'user.name', 'test']);
  fs.writeFileSync(path.join(root, 'f.txt'), 'v1\n');
  realGit(['-C', root, 'add', '-A']);
  realGit(['-C', root, 'commit', '-qm', 'init']);

  // A REAL remote. The ancestry check (S2-R4) resolves `origin/main`, and a scratch repo without a
  // remote would make every case refuse for the wrong reason — the fixture would stop resembling
  // production, which is exactly the failure mode this whole file exists to avoid.
  originDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 's2r-origin-')));
  realGit(['-C', originDir, 'init', '-q', '--bare']);
  realGit(['-C', root, 'remote', 'add', 'origin', originDir]);
  realGit(['-C', root, 'push', '-q', 'origin', 'HEAD:refs/heads/main']);
  realGit(['-C', root, 'fetch', '-q', 'origin']);

  // THE ATTACK: a plain directory at the default source-tree path, holding attacker code.
  plantedDir = path.join(root, REAPER_SOURCE_DIRNAME);
  fs.mkdirSync(path.join(plantedDir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(plantedDir, 'scripts', 'worktree-reaper.mjs'), '// ATTACKER CODE\n');

  // THE CONTROL: a genuine linked worktree of the same repo.
  realWtDir = path.join(root, '.real-source');
  realGit(['-C', root, 'worktree', 'add', '-q', '-B', 'realwt', realWtDir, 'HEAD']);
});

afterAll(() => {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  try { fs.rmSync(originDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

const ensureAt = (dirname) => ensureSourceTreeWorktree({
  repoRoot: root,
  dirname,
  branch: REAPER_SOURCE_BRANCH,
  label: 'reaper-source',
  exists: fs.existsSync,
  runner: realGit,
});

describe('S2-R: a PLAIN directory inside the repo is not a worktree, and real git says so', () => {
  it('the bypass is real: --git-common-dir alone CANNOT tell them apart', () => {
    // The finding itself, pinned as an executable fact rather than a claim in a commit message.
    // If a future git changes this, the guard's second check becomes redundant rather than wrong —
    // and whoever reads this test will know why the second check was added.
    const common = (d) => realGit(['-C', d, 'rev-parse', '--path-format=absolute', '--git-common-dir']).trim();
    expect(common(plantedDir)).toBe(common(root)); // <-- identical. one mkdir defeats check 1.

    // ...while the position-sensitive question separates them cleanly.
    const top = (d) => realGit(['-C', d, 'rev-parse', '--path-format=absolute', '--show-toplevel']).trim();
    expect(top(plantedDir)).not.toBe(plantedDir);  // resolves to the ENCLOSING repo
    expect(fs.realpathSync(top(realWtDir))).toBe(fs.realpathSync(realWtDir)); // a real worktree IS its own top
  });

  it('REFUSES the planted plain directory — the exact bypass SECURITY measured', () => {
    let err = null;
    try { ensureAt(REAPER_SOURCE_DIRNAME); } catch (e) { err = e; }
    expect(err).toBeTruthy();
    expect(err.message).toMatch(/NOT a linked worktree/i);
  });

  it('does NOT run git in the planted directory, and does NOT mark it as protected', () => {
    // The two observable side effects of the pre-fix behaviour, measured by the reviewer:
    // it returned {created:false, refreshed:true} and wrote its protection marker INTO the
    // attacker's directory. Asserting the throw alone would not have caught either.
    try { ensureAt(REAPER_SOURCE_DIRNAME); } catch { /* expected */ }
    expect(fs.existsSync(path.join(plantedDir, '.reap-protected.json'))).toBe(false);
    // The attacker's file is untouched and, critically, the repo was never fast-forwarded from it.
    expect(fs.readFileSync(path.join(plantedDir, 'scripts', 'worktree-reaper.mjs'), 'utf8'))
      .toContain('ATTACKER CODE');
  });

  it('the refusal carries its OWN code, so callers fail SOFT instead of taking the fleet down', () => {
    // spawn-control treats SPAWN_SOURCE_SITING_ERROR as its one must-stay-fatal class. Reusing that
    // code here would turn an identity refusal — or a transient git failure — into a fleet-wide
    // spawn outage.
    let err = null;
    try { ensureAt(REAPER_SOURCE_DIRNAME); } catch (e) { err = e; }
    expect(err.code).toBe(SOURCE_TREE_IDENTITY_ERROR);
    expect(err.code).not.toBe('SPAWN_SOURCE_SITED_IN_EXEMPT_PATH');
  });

  it('POSITIVE CONTROL — a GENUINE linked worktree is still reused and refreshed', () => {
    // Load-bearing: a guard that refuses everything would pass every test above. This is the case
    // production actually depends on, driven through the same real git.
    const out = ensureAt('.real-source');
    expect(out.created).toBe(false);
    expect(fs.existsSync(path.join(realWtDir, '.reap-protected.json'))).toBe(true);
  });

  it('S2-R2: REFUSES a `.git` FILE plant — one dir + one ~50-byte file, no git init', () => {
    // The attack that defeated checks 1 AND 2 simultaneously. A file named `.git` containing
    // `gitdir: <repoRoot>/.git` makes git treat the CONTAINING directory as the worktree, so
    // --show-toplevel returns the candidate (check 2 passes) while --git-common-dir returns
    // repoRoot's own .git (check 1 passes). Measured on real git before the fix.
    //
    // Worse than the bare-mkdir hole it replaced: because the plant points at repoRoot's gitdir,
    // the reuse `merge --ff-only` operates on THE SHARED ROOT'S OWN REFS.
    const dir = path.join(root, '.gitfile-plant');
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'scripts', 'worktree-reaper.mjs'), "console.log('PWNED')\n");
    fs.writeFileSync(path.join(dir, '.git'), `gitdir: ${root.replace(/\\/g, '/')}/.git\n`);

    // Both original checks really do pass on this shape — asserted so the test cannot silently
    // become a tautology if the plant stops working on a future git.
    const g = (d, ...a) => realGit(['-C', d, 'rev-parse', ...a]).trim();
    expect(fs.realpathSync.native(g(dir, '--path-format=absolute', '--git-common-dir')))
      .toBe(fs.realpathSync.native(g(root, '--path-format=absolute', '--git-common-dir')));
    expect(fs.realpathSync.native(g(dir, '--path-format=absolute', '--show-toplevel')))
      .toBe(fs.realpathSync.native(dir));

    let err = null;
    try { ensureAt('.gitfile-plant'); } catch (e) { err = e; }
    expect(err, 'the .git-file plant must be REFUSED').toBeTruthy();
    expect(err.code).toBe(SOURCE_TREE_IDENTITY_ERROR);
    // And nothing was done to it: no marker, payload untouched.
    expect(fs.existsSync(path.join(dir, '.reap-protected.json'))).toBe(false);
    expect(fs.readFileSync(path.join(dir, 'scripts', 'worktree-reaper.mjs'), 'utf8')).toContain('PWNED');
  });

  it('S2-R3: REFUSES a bare mkdir carrying GIT_DIR/GIT_WORK_TREE in the environment', () => {
    // No file at all — the exact shape check 2 was added to reject, resurrected via env. Both
    // production runners inherit process.env, so this is inside the module's declared threat model
    // (it already names the FLEET_*_SOURCE_DIR overrides as untrusted).
    const dir = path.join(root, '.env-plant');
    fs.mkdirSync(dir, { recursive: true });
    const hostileEnv = {
      ...process.env,
      GIT_DIR: path.join(root, '.git'),
      GIT_WORK_TREE: dir,
    };
    const hostileRunner = (args) => execFileSync('git', args, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: hostileEnv,
    });
    let err = null;
    try {
      ensureSourceTreeWorktree({
        repoRoot: root, dirname: '.env-plant', branch: REAPER_SOURCE_BRANCH, label: 'reaper-source',
        exists: fs.existsSync, runner: hostileRunner,
      });
    } catch (e) { err = e; }
    expect(err, 'the GIT_DIR/GIT_WORK_TREE plant must be REFUSED').toBeTruthy();
    expect(err.code).toBe(SOURCE_TREE_IDENTITY_ERROR);
  });

  it('scrubGitEnv removes every redirection var, and does not mutate its input', () => {
    const before = { GIT_DIR: 'x', GIT_WORK_TREE: 'y', GIT_COMMON_DIR: 'z', PATH: 'keep' };
    const after = scrubGitEnv(before);
    for (const k of GIT_REDIRECT_ENV_KEYS) expect(after[k]).toBeUndefined();
    expect(after.PATH).toBe('keep');          // does not over-scrub
    expect(before.GIT_DIR).toBe('x');          // does not mutate the caller's env
  });

  it('S2-R4: REFUSES a GENUINE worktree that is AHEAD of the base ref — identity is not integrity', () => {
    // The residual attack after every identity check passes. This tree really IS our worktree, so
    // identity says yes; `merge --ff-only` is a harmless no-op because it is already up to date;
    // and enforceTreeCurrency measures BEHIND, which is 0 — because the tree is AHEAD, and nothing
    // rejects ahead. So one unreviewed commit executes with the reaper's destructive privileges,
    // and persists: `-B` only force-resets on the CREATE path, and the dir is gitignored.
    const dir = path.join(root, '.ahead-source');
    realGit(['-C', root, 'worktree', 'add', '-q', '-B', 'aheadwt', dir, 'origin/main']);
    fs.writeFileSync(path.join(dir, 'evil.txt'), 'ATTACKER REAPER\n');
    realGit(['-C', dir, 'add', '-A']);
    realGit(['-C', dir, 'commit', '-qm', 'unreviewed commit on top of base']);

    // It genuinely passes the identity probes — asserted, so this test cannot quietly become a
    // duplicate of the foreign-repo case.
    const gitDir = realGit(['-C', dir, 'rev-parse', '--absolute-git-dir']).trim().replace(/\\/g, '/');
    expect(gitDir.toLowerCase()).toContain('/worktrees/');

    let err = null;
    try {
      ensureSourceTreeWorktree({
        repoRoot: root, dirname: '.ahead-source', branch: 'aheadwt', label: 'reaper-source',
        exists: fs.existsSync, runner: realGit, // default baseRef 'origin/main'
      });
    } catch (e) { err = e; }
    expect(err, 'a tree carrying commits not in the base ref must be REFUSED').toBeTruthy();
    expect(err.code).toBe(SOURCE_TREE_AHEAD_ERROR);
    // A DISTINCT code from the identity refusal: "not ours" and "ours but tampered" are different
    // operator problems, even though both fail soft.
    expect(err.code).not.toBe(SOURCE_TREE_IDENTITY_ERROR);
  });

  it('a FOREIGN repository at the path is refused too — check 1 still does its job', () => {
    // Guards against "fixing" this by replacing check 1 with check 2 instead of requiring both:
    // a foreign repo IS its own toplevel, so check 2 alone would accept it.
    const foreign = path.join(root, '.foreign-source');
    fs.mkdirSync(foreign, { recursive: true });
    realGit(['-C', foreign, 'init', '-q']);
    let err = null;
    try { ensureAt('.foreign-source'); } catch (e) { err = e; }
    expect(err).toBeTruthy();
    expect(err.code).toBe(SOURCE_TREE_IDENTITY_ERROR);
  });
});
