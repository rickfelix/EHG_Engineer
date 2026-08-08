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
function assertSourceTreeNotExempt(cwd, { code, label = 'source' } = {}) {
  if (isWorktreeExemptPath(cwd)) {
    const err = new Error(
      `${label} tree may not sit under .worktrees/ (got: ${cwd}). Paths there are EXEMPT from the ` +
      'tree-currency check, so siting it inside one would disable the invariant it exists to ' +
      'uphold — the caller would appear guarded while asserting nothing. Site it outside ' +
      '.worktrees/, or narrow the exemption.',
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
function ensureSourceTreeWorktree({
  repoRoot, dirname, branch, envOverride, code, label,
  exists, runner, baseRef = 'origin/main', env = process.env,
}) {
  const dir = resolveSourceTreeDir(repoRoot, { dirname, envOverride, code, label }, env);
  if (exists(dir)) {
    let refreshed = true;
    try {
      for (const args of buildSourceTreeUpdateArgs(dir, baseRef)) runner(args);
    } catch {
      refreshed = false;
    }
    return { dir, created: false, refreshed };
  }
  runner(buildSourceTreeWorktreeArgs(dir, baseRef, branch));
  return { dir, created: true, refreshed: null };
}

module.exports = {
  SPAWN_SOURCE_DIRNAME,
  SPAWN_SOURCE_BRANCH,
  REAPER_SOURCE_DIRNAME,
  REAPER_SOURCE_BRANCH,
  isWorktreeExemptPath,
  assertSourceTreeNotExempt,
  resolveSourceTreeDir,
  buildSourceTreeWorktreeArgs,
  buildSourceTreeUpdateArgs,
  ensureSourceTreeWorktree,
};
