/**
 * Dedicated self-refreshing source trees — the ONE definition, shared by every caller that needs
 * to execute code from a tree that stays current without anyone remembering to pull.
 * SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001 FR-1/FR-2.
 *
 * WHY THIS FILE EXISTS AT ALL, and why it is .cjs. The mechanism was written for the spawn path in
 * lib/fleet/spawn-control.js, which is ESM. The worktree reaper needs the identical mechanism, but
 * scripts/fleet/worktree-reaper-tick.cjs is CommonJS and its tick() is called SYNCHRONOUSLY from
 * scripts/stale-session-sweep.cjs:3801 — so a dynamic import() would force that whole call path
 * async. lib/fleet/tree-currency.cjs is the precedent and the reason this shape is chosen: a CJS
 * home can be require()d by CJS and imported by ESM unconditionally, so one definition serves both.
 * spawn-control.js delegates here rather than keeping its own copy; a second implementation of the
 * same idea is exactly the duplication this SD family exists to remove.
 *
 * WHAT PROBLEM THE MECHANISM SOLVES — stated precisely, because the obvious reading is wrong.
 * lib/fleet/tree-currency.cjs refuses on behind>0 and self-heals ONLY when the tree is clean AND on
 * SELF_HEALABLE_BRANCH ('main', tree-currency.cjs:47). A dedicated tree is deliberately on neither
 * (its own branch, so it collides with nobody), so enforceTreeCurrency's internal `git pull` at
 * tree-currency.cjs:236 NEVER FIRES for it. What actually keeps such a tree current is the EXTERNAL
 * fetch + `merge --ff-only` below, which reaches behind===0 BEFORE the currency check runs and
 * short-circuits it at tree-currency.cjs:141-142. Anyone "reusing the pattern" by merely pointing
 * enforceTreeCurrency at a new directory gets today's refuse-only tree with extra steps.
 *
 * WHY NOT JUST ALLOW SELF-HEAL ON THE SHARED ROOT: a `git pull --ff-only` there is an uncoordinated
 * mutation of a tree other live sessions are reading, which breaks them mid-operation. That
 * prohibition is load-bearing; the answer is a tree nobody else shares, not a relaxed guard.
 *
 * ff-only, never reset/clean/stash. If a fast-forward is not possible the tree stays behind and the
 * currency check refuses it with the real reason — one authority decides currency, not this module.
 */
'use strict';

const path = require('node:path');

/** Dedicated tree for the SPAWN path (SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001). */
const SPAWN_SOURCE_DIRNAME = '.spawn-source';
const SPAWN_SOURCE_BRANCH = 'spawn-source';

/** Dedicated tree for the WORKTREE REAPER (this SD). Separate dir AND branch so the two trees
 *  never contend: they refresh on different cadences and a shared branch name would collide. */
const REAPER_SOURCE_DIRNAME = '.reaper-source';
const REAPER_SOURCE_BRANCH = 'reaper-source';

/**
 * Thrown when an existing source-tree directory is not a linked worktree of THIS repo. Distinct
 * from the siting error on purpose — callers must fail SOFT on this one (see the throw site).
 */
const SOURCE_TREE_IDENTITY_ERROR = 'SOURCE_TREE_NOT_LINKED_WORKTREE';

/**
 * Paths under .worktrees/ are EXEMPT from the tree-currency check. That exemption is why siting a
 * dedicated source tree there is catastrophic rather than merely untidy: the tree would be skipped
 * by the very invariant it exists to uphold, and would APPEAR to work while asserting nothing.
 * The guard and the exemption read the SAME predicate here so they cannot drift apart.
 */
function isWorktreeExemptPath(cwd) {
  return String(cwd || '').replace(/\\/g, '/').includes('/.worktrees/');
}

/**
 * THROWS rather than returning a boolean, deliberately. A mis-sited tree fails INVISIBLY — it
 * produces a green, unguarded path — so detecting it must not be optional for the caller.
 * `code` is caller-supplied so each call site can distinguish a CORRECTNESS violation (never fail
 * soft) from an ordinary git hiccup (may fail soft).
 */
function assertSourceTreeNotExempt(cwd, { code, label = 'source', ref } = {}) {
  if (isWorktreeExemptPath(cwd)) {
    const err = new Error(
      `${label} tree may not sit under .worktrees/ (got: ${cwd}). Paths there are EXEMPT from the ` +
      'tree-currency check, so siting it inside one would disable the invariant it exists to ' +
      'uphold — the caller would appear guarded while asserting nothing. Site it outside ' +
      '.worktrees/, or narrow the exemption.' + (ref ? ` (${ref})` : ''),
    );
    if (code) err.code = code;
    throw err;
  }
  return cwd;
}

/**
 * Resolve where a dedicated source tree lives, refusing an unguarded location.
 * `envOverride` names the env var that may relocate it (each caller owns its own knob).
 */
function resolveSourceTreeDir(repoRoot, { dirname, envOverride, code, label } = {}, env = process.env) {
  const override = envOverride && env[envOverride] && String(env[envOverride]).trim();
  const dir = override || path.join(String(repoRoot || ''), String(dirname));
  return assertSourceTreeNotExempt(dir, { code, label });
}

/**
 * `git worktree add` argv. Pure — no I/O — so the command SHAPE is assertable without a real repo.
 *
 * `-B` (create-or-reset) not `-b`: the tree is machine-managed and idempotency matters more than
 * protecting a branch nobody should commit to.
 *
 * NEVER `--detach`: assessTreeCurrency resolves the branch via `rev-parse --abbrev-ref HEAD`, which
 * answers the literal string 'HEAD' for a detached worktree and rejects it as detached_head. A
 * detached tree would be pristine, exactly on the base ref, satisfy every condition the guard
 * demands — and be refused anyway. The spawn path shipped that once and it refused every spawn.
 */
function buildSourceTreeWorktreeArgs(dir, baseRef, branch) {
  return ['worktree', 'add', '-B', String(branch), String(dir), String(baseRef)];
}

/**
 * The argv PAIR that brings an existing tree up to the base ref. This is the load-bearing half —
 * see the header: nothing else will ever advance a tree that is off SELF_HEALABLE_BRANCH.
 *
 * `-C <dir>` keeps the single-runner contract: the caller's runner is bound to the repo root, and
 * threading a second cwd would give two ways to say where a command runs.
 */
function buildSourceTreeUpdateArgs(dir, baseRef = 'origin/main') {
  const [remote, ...rest] = String(baseRef).split('/');
  const branch = rest.join('/');
  return [
    remote && branch
      ? ['-C', String(dir), 'fetch', '--quiet', '--', remote, branch]
      : ['-C', String(dir), 'fetch', '--quiet'],
    ['-C', String(dir), 'merge', '--ff-only', '--quiet', String(baseRef)],
  ];
}

/**
 * Ensure the tree exists, creating it once and REFRESHING it on every reuse.
 *
 * REUSE IS NOT A NO-OP, and treating it as one was half the original bug: a tree created once and
 * never advanced is current only until the next merge. `exists` and `runner` are injected so the
 * decision is testable without a filesystem or a real git.
 *
 * A failed refresh does NOT throw. It would turn a transient network blip into an outage, when the
 * currency check immediately downstream refuses with the real reason anyway. A mis-SITED tree, by
 * contrast, DOES throw (via resolveSourceTreeDir) — that one is a correctness violation.
 *
 * @returns {{dir:string, created:boolean, refreshed:boolean|null}} refreshed===null means freshly
 *          created AT the base ref, where a refresh would be a no-op round trip.
 */
/**
 * Mark a source tree as REAP-PROTECTED — SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001, EXEC SECURITY S1.
 *
 * WITHOUT THIS, THIS SD DESTROYS ITSELF ON SUCCESS. A dedicated tree (.reaper-source /
 * .spawn-source) has a branch matching none of the feat|qf|fix|chore|hotfix patterns and a basename
 * in no SD/QF map, so the reaper's own detector classifies it `orphan-sd` -> `stage2_remove`
 * (detectors.js:454, worktree-reaper.mjs:792-802). The only thing standing between it and deletion
 * was the 30-minute tree-residency window, which holds by COINCIDENCE — it depends on origin/main
 * staying busy. This host runs WORKTREE_REAPER_EXECUTE=stage2. So the direct consequence of this
 * SD succeeding (un-starving the reaper) is a reaper that deletes its own execution source the
 * first time main goes quiet for half an hour.
 *
 * Uses the EXISTING opt-out mechanism rather than a new one, and imports the filename constant
 * rather than restating it (the reaper honours the marker at worktree-reaper.mjs:899 and :1372).
 *
 * BEST-EFFORT BY DESIGN, and only because it is NOT the only layer: a failed marker write is
 * logged, not thrown, because throwing here would break every spawn on a transient fs error. The
 * dirname prefixes are also registered in the reaper's NON_SD_PREFIXES, so protection survives the
 * marker being deleted — two independent mechanisms on a data-loss path, deliberately.
 */
function markSourceTreeReapProtected(dir, label) {
  try {
    const { writeReapProtectedMarker } = require('../worktree-reaper/reap-protected-marker.js');
    writeReapProtectedMarker(dir, {
      reason: `${label} tree — the reaper EXECUTES FROM here; deleting it destroys the thing doing the deleting`,
      owner: 'SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001',
    });
    return true;
  } catch (e) {
    console.error(
      `[source-tree-refresh] FAILED to write the reap-protected marker at ${dir} (${e?.message || e}). ` +
      'This tree is now protected ONLY by the NON_SD_PREFIXES entry — restore the marker before relying on it.',
    );
    return false;
  }
}

/**
 * Is `dir` genuinely a linked worktree of THIS repository? — EXEC SECURITY S2 (HIGH).
 *
 * THE ATTACK THIS CLOSES: the reuse branch previously trusted fs.existsSync(dir) alone, then ran
 * `git -C <dir> fetch` and `merge --ff-only` using THAT DIRECTORY'S OWN git config. A directory
 * pre-created at the default path — or pointed at by the unauthenticated FLEET_REAPER_SOURCE_DIR /
 * FLEET_SPAWN_SOURCE_DIR overrides — carrying a self-consistent fake history (its own `origin`,
 * HEAD already equal to its own origin/main) satisfies BOTH the refresh and the independent
 * enforceTreeCurrency re-check. The reaper would then EXECUTE that directory's code with its
 * destructive privileges. Precondition is only local filesystem write access.
 *
 * `--git-common-dir` is the discriminator: it resolves to the MAIN repository's .git for any linked
 * worktree, so a foreign repo (however well-formed) resolves elsewhere and is rejected. Comparing
 * origin URLs would not do — an attacker sets those freely.
 *
 * FAILS CLOSED: an unverifiable directory is NOT reused. The caller then treats it as absent, which
 * lands on the create path or the loud repoRoot fallback — never on "trust it anyway".
 */
function isLinkedWorktreeOf(dir, repoRoot, runner) {
  const norm = (p) => String(p || '').trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  try {
    // `--path-format=absolute` matches the precedent already set by resolveMainRepoRoot()
    // (lib/fleet/spawn-control.js:338) and lets git do the resolution: without it the answer can
    // come back as a bare relative ".git", and resolving that by hand is its own bug surface.
    const probe = (d, opt) => norm(runner(['-C', String(d), 'rev-parse', '--path-format=absolute', opt]));

    // CHECK 1 — SAME REPO. Rejects a foreign repository with its own .git.
    const mine = probe(dir, '--git-common-dir');
    const theirs = probe(repoRoot, '--git-common-dir');
    if (!mine || !theirs || mine !== theirs) return false;

    // CHECK 2 — IS THE WORKTREE ROOT, not merely INSIDE one. Load-bearing, and the reason the
    // first version of this guard was defeated by a bare `mkdir`: rev-parse WALKS UP parent
    // directories, and the default source-tree path sits INSIDE repoRoot's working tree. So a
    // plain directory with no .git of its own answers CHECK 1 with repoRoot's own common dir and
    // passes. MEASURED with real git in a scratch repo: <repoRoot>/.reaper-source containing
    // attacker code was accepted, refreshed, and marked — capability required was one mkdir plus
    // one file write, strictly LESS than the `git init` + fake-remote attack CHECK 1 was written
    // against, and .reaper-source/ is gitignored so the plant is invisible to `git status`.
    // --show-toplevel is position-sensitive: for a real worktree it equals the dir itself; for a
    // plain subdirectory it resolves to the enclosing repo root.
    const top = probe(dir, '--show-toplevel');
    if (!top || top !== norm(path.resolve(String(dir)))) return false;

    return true;
  } catch {
    return false; // unverifiable => not reused
  }
}

function ensureSourceTreeWorktree({
  repoRoot, dirname, branch, envOverride, code, label,
  exists, runner, baseRef = 'origin/main', env = process.env,
}) {
  const dir = resolveSourceTreeDir(repoRoot, { dirname, envOverride, code, label }, env);
  // S2: existence is NOT identity. Verify the directory belongs to THIS repo before running git in
  // it or executing anything from it.
  if (exists(dir) && !isLinkedWorktreeOf(dir, repoRoot, runner)) {
    const err = new Error(
      `${label || 'source'} tree at ${dir} exists but is NOT a linked worktree of ${repoRoot}. ` +
      'Refusing to refresh or execute from it: a pre-created directory with a self-consistent fake ' +
      'git history would otherwise pass both the refresh and the currency check, and the reaper ' +
      'executes from this tree with destructive privileges. Remove it, or unset the source-dir override.',
    );
    // ITS OWN CODE, deliberately NOT the caller's siting code (EXEC SECURITY, medium). spawn-control
    // treats SPAWN_SOURCE_SITING_ERROR as its ONE must-stay-fatal class (spawn-control.js:617), so
    // reusing it would turn an identity refusal — or a transient git failure, which this probe
    // cannot distinguish — into a FLEET-WIDE SPAWN OUTAGE. Under a distinct code the caller falls
    // soft to the spawning tree, which is still the guarded path: degraded, not unguarded, and it
    // never executes from the unverified directory.
    err.code = SOURCE_TREE_IDENTITY_ERROR;
    throw err; // correctness violation, not a hiccup — the caller degrades to the GUARDED path
  }
  if (exists(dir)) {
    // Re-assert on reuse: a tree created BEFORE this fix has no marker, and a marker can be
    // deleted. Re-writing it every pass is cheap and makes the protection self-healing.
    markSourceTreeReapProtected(dir, label || 'source');
    let refreshed = true;
    try {
      for (const args of buildSourceTreeUpdateArgs(dir, baseRef)) runner(args);
    } catch {
      refreshed = false;
    }
    return { dir, created: false, refreshed };
  }
  runner(buildSourceTreeWorktreeArgs(dir, baseRef, branch));
  // Mark IMMEDIATELY after creation — the window between `worktree add` and the marker is the
  // only moment this tree is visible-and-unprotected.
  markSourceTreeReapProtected(dir, label || 'source');
  return { dir, created: true, refreshed: null };
}

module.exports = {
  SPAWN_SOURCE_DIRNAME,
  SPAWN_SOURCE_BRANCH,
  REAPER_SOURCE_DIRNAME,
  REAPER_SOURCE_BRANCH,
  SOURCE_TREE_IDENTITY_ERROR,
  isWorktreeExemptPath,
  assertSourceTreeNotExempt,
  resolveSourceTreeDir,
  buildSourceTreeWorktreeArgs,
  buildSourceTreeUpdateArgs,
  ensureSourceTreeWorktree,
};
