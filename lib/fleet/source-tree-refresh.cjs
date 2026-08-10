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
const fs = require('node:fs');

/**
 * Git env vars that let a caller REDIRECT which repository a `git -C <dir> ...` call actually
 * operates on. EXEC SECURITY measured a bare `mkdir` being accepted as a source tree with nothing
 * but GIT_DIR + GIT_WORK_TREE set — and the same redirection points the subsequent fetch/merge at
 * the shared root's refs. Both production runners inherit process.env, so the scrub belongs on the
 * child env at every site that runs git in a source tree.
 */
const GIT_REDIRECT_ENV_KEYS = [
  'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CEILING_DIRECTORIES', 'GIT_NAMESPACE',
  // EXEC SECURITY SCRUB-1 / R5-1: these reach COMMAND EXECUTION, not merely redirection.
  'GIT_SSH_COMMAND', 'GIT_PROXY_COMMAND', 'GIT_EXTERNAL_DIFF', 'GIT_EXEC_PATH',
  'GIT_ATTR_NOSYSTEM', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM', 'GIT_CONFIG_NOSYSTEM',
  'GIT_ASKPASS', 'GIT_TEMPLATE_DIR',
];

/**
 * SCRUB-1: GIT_CONFIG_COUNT plus GIT_CONFIG_KEY_<n> / GIT_CONFIG_VALUE_<n> inject ARBITRARY git
 * config, and core.fsmonitor is a command git RUNS - measured reaching command execution on a
 * plain `git status --porcelain`, which is exactly what assessTreeCurrency runs. A fixed-name list
 * STRUCTURALLY cannot cover an indexed family, so this one is matched by PREFIX.
 */
const GIT_REDIRECT_ENV_PREFIXES = [/^GIT_CONFIG_/];

/** A copy of `env` with the redirection vars removed. Never mutates the input. */
function scrubGitEnv(env) {
  const out = { ...(env || {}) };
  for (const k of GIT_REDIRECT_ENV_KEYS) delete out[k];
  for (const k of Object.keys(out)) {
    if (GIT_REDIRECT_ENV_PREFIXES.some((re) => re.test(k))) delete out[k];
  }
  // NO POSITIVE HARDENING HERE, AND THAT IS A REVERSAL OF MY OWN CHANGE — MEASURED.
  // I briefly set GIT_CONFIG_NOSYSTEM=1 and pointed GIT_CONFIG_GLOBAL at a nonexistent file, to
  // neutralise core.hooksPath in system/global config. That BREAKS AUTHENTICATED FETCH on this
  // fleet: origin is https://github.com, `credential.helper=manager` lives in the SYSTEM config and
  // the github-specific helpers live in the GLOBAL config. Measured through this very function:
  // unscrubbed the helper resolves, hardened it does not. A source tree that cannot fetch cannot
  // fast-forward, goes stale, and the reaper then REFUSES — which is EXACTLY the starvation this
  // whole SD exists to fix. My tests could not see it because the real-git fixture uses a local
  // bare remote with no auth: the same "a fixture that cannot resolve what production always has
  // is not modelling production" trap, in a new form.
  //
  // Scope, stated so nobody re-adds it: the measured threat is env-injected GIT_CONFIG_*, which the
  // denylist and the prefix matcher above DO remove. System/global config is the machine owner's
  // own configuration — an attacker who can write ~/.gitconfig already owns the account, and it is
  // not reachable from the gitignored .env that made the env vector interesting.
  return out;
}

/**
 * THE ONE PLACE A GIT RUNNER FOR SOURCE-TREE WORK IS BUILT — R5-4.
 *
 * The scrub was previously applied by hand at each production call site, and MEASURED: it could be
 * unwired at BOTH sites with the entire 4227-test suite green. The only test that could have
 * noticed asserted scrubGitEnv as a PURE FUNCTION, in isolation. Two green endpoints do not prove
 * they are connected, and "a value correctly computed and never consumed" is this SD's founding
 * defect — the same shape, one layer up.
 *
 * Routing both call sites through one factory turns the wire into a single testable object: an
 * effect test on this function covers what a per-site structural grep never could.
 */
function makeScrubbedGitRunner(cwd, {
  spawnSync: spawnSyncImpl, env = process.env,
  // FR-0 (SD-LEO-INFRA-PUBLISH-SHELL-INJECTION-001-A): adoption sites carry contracts the
  // original runner cannot express — dirty-probing treats non-zero exit as data (not failure),
  // inflight-git-state must leave the child env AMBIENT so gh/git credential helpers resolve
  // (its test asserts opts.env === undefined), schema-reference-lint needs a 32MB maxBuffer
  // (spawnSync's 1MB default returns status:null on overflow), and tree-currency pipes stderr
  // explicitly. All four are factory/call opts here; defaults are byte-compatible with the
  // original behavior so the existing consumer (worktree-reaper-tick) is untouched.
  envPassthrough = false, envAugment, timeout, maxBuffer, stdio, result = false,
} = {}) {
  const sync = spawnSyncImpl || require('node:child_process').spawnSync;
  return (args, callOpts = {}) => {
    const o = { envPassthrough, envAugment, timeout, maxBuffer, stdio, result, ...callOpts };
    const spawnOpts = { cwd, encoding: 'utf8', windowsHide: true };
    // envPassthrough leaves spawnOpts.env UNSET (child inherits ambient env) rather than passing
    // a copy — the inflight-git-state contract is `env === undefined`, not "env deep-equals".
    // envAugment applies AFTER the scrub: the scrub's denylist includes keys a caller may need to
    // POSITIVELY set (e.g. GIT_CONFIG_NOSYSTEM for no-fetch contexts) — setting them pre-scrub
    // would be silently stripped, an inert decoration.
    if (!o.envPassthrough) spawnOpts.env = { ...scrubGitEnv(env), ...(o.envAugment || {}) };
    if (o.timeout != null) spawnOpts.timeout = o.timeout;
    if (o.maxBuffer != null) spawnOpts.maxBuffer = o.maxBuffer;
    if (o.stdio != null) spawnOpts.stdio = o.stdio;
    const r = sync('git', args, spawnOpts);
    if (o.result) {
      return {
        status: r ? r.status : null,
        stdout: r && r.stdout != null ? r.stdout.toString() : '',
        stderr: r && r.stderr != null ? r.stderr.toString() : '',
        error: (r && r.error) || undefined,
      };
    }
    if (!r || r.status !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${((r && r.stderr) || '').toString().trim()}`);
    }
    return r.stdout;
  };
}

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
 * Thrown when a source tree is a genuine worktree of this repo but carries commits not present in
 * the base ref. Distinct from the identity error so operators can tell "not ours" from "ours but
 * tampered/stale-forward"; both fail SOFT at the caller.
 */
const SOURCE_TREE_AHEAD_ERROR = 'SOURCE_TREE_AHEAD_OF_BASE';

/**
 * Thrown when a source tree is genuinely ours and at the right commit, but its WORKING TREE carries
 * content that was never committed. Distinct code; fails SOFT like the others.
 */
const SOURCE_TREE_DIRTY_ERROR = 'SOURCE_TREE_CONTENT_UNVERIFIED';

/**
 * Thrown when a source-dir override keeps a valid location but RENAMES the tree. Its own code
 * (IDLE-3-CODE): reusing the caller's siting code made an env typo indistinguishable from a
 * mis-sited tree, and spawn-control keeps THAT class must-stay-fatal — so a typo became a
 * fleet-wide spawn outage reported as "SITED_IN_EXEMPT_PATH". Follows the precedent set by the
 * identity/ahead/content codes: distinct, and fails soft.
 */
const SOURCE_TREE_BASENAME_ERROR = 'SOURCE_TREE_OVERRIDE_RENAMED';

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
  // IDLE-3 (EXEC SECURITY): the override may relocate the tree, but it MAY NOT RENAME IT. Both
  // reap-protection layers in lib/worktree-reaper/detectors.js key on the literal basename, while
  // this override previously accepted any path — so a relocated tree named anything else was
  // stage-2 eligible via BOTH the idle and orphan-sd routes, leaving only the reap-protected
  // marker, which is explicitly best-effort and is a deletable file. Measured: '.reaper-src',
  // 'reaper-source' and '.Reaper-Source' were all reapable.
  //
  // Constraining the basename keeps layer 2's literal true BY CONSTRUCTION and preserves the part
  // of the override that is actually used (putting the tree on another disk or outside the repo).
  // The alternative — teaching the detectors to read this env — would make a destructive
  // classifier depend on the environment of whoever happens to run it.
  // SITING IS CHECKED FIRST, deliberately. A tree under .worktrees/ is EXEMPT from the currency
  // check — a silently-unguarded path — and that error is the one spawn-control keeps fatal. A
  // path that is both mis-sited AND misnamed must report the mis-siting, the worse of the two.
  assertSourceTreeNotExempt(dir, { code, label });
  if (override && path.basename(dir) !== String(dirname)) {
    const err = new Error(
      `${label || 'source'} tree override ${envOverride}=${dir} must keep the basename "${dirname}". ` +
      'The reaper\'s protection layers match that literal name, so a renamed tree is classified as ' +
      'an ordinary abandoned worktree and becomes eligible for stage-2 REMOVAL — the reaper would ' +
      'delete the tree it executes from. Relocate the parent directory instead.',
    );
    // NOT the caller's siting code (IDLE-3-CODE). See SOURCE_TREE_BASENAME_ERROR.
    err.code = SOURCE_TREE_BASENAME_ERROR;
    throw err;
  }
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
    // realpath, not path.resolve: this fleet creates worktrees behind junctions, and a junction
    // makes git answer with the TARGET while path.resolve returns the link — a false refusal.
    if (!top || top !== realNorm(dir)) return false;

    // CHECK 3 — THE GIT DIR ITSELF MUST LIVE UNDER <common>/worktrees/. This is the only check
    // that survives a forged linkage, and checks 1+2 are BOTH defeated without it:
    //
    //   (a) A `.git` FILE plant. `mkdir <repoRoot>/.reaper-source` plus a ~50-byte file named
    //       `.git` containing `gitdir: <repoRoot>/.git`. Git's .git-file handling sets the worktree
    //       to the directory CONTAINING the file, so --show-toplevel returns the candidate (check 2
    //       passes) while --git-common-dir returns repoRoot's own .git (check 1 passes). MEASURED
    //       on real git 2.50.1. Worse than the bare-mkdir hole it replaced: because the plant points
    //       at repoRoot's gitdir, the reuse `merge --ff-only` moves THE SHARED ROOT'S OWN REFS.
    //   (b) GIT_DIR + GIT_WORK_TREE in the inherited environment, with a BARE mkdir and no file at
    //       all — the exact shape check 2 was added to reject.
    //
    // A genuine linked worktree answers `<common>/worktrees/<name>`; both forgeries answer
    // `<common>` itself, as does repoRoot. Measured two-sided, not reasoned.
    const gitDir = norm(runner(['-C', String(dir), 'rev-parse', '--absolute-git-dir']));
    if (!gitDir || !gitDir.startsWith(`${mine}/worktrees/`)) return false;

    return true;
  } catch {
    return false; // unverifiable => not reused
  }
}

/**
 * Allowlist for the ONE file the source tree may legitimately carry beyond its committed content:
 * the reap-protection marker this module writes itself. Resolved LAZILY so the name keeps a single
 * definition (TR-3) across the CJS/ESM boundary - the marker module is ESM, which is why the
 * existing marker-write call site also requires it lazily. Falls back to the literal, because
 * refusing every source tree over a module-resolution hiccup is worse than the drift risk.
 */
function sourceTreeAllowedPaths() {
  try {
    const { PROTECTED_MARKER_FILENAME } = require('../worktree-reaper/reap-protected-marker.js');
    if (PROTECTED_MARKER_FILENAME) return new Set([PROTECTED_MARKER_FILENAME]);
  } catch { /* fall through to the literal */ }
  return new Set(['.reap-protected.json']);
}

/**
 * IDENTITY AND ANCESTRY ARE CHECKS ON GIT METADATA. THE REAPER EXECUTES FILES.
 *
 * EXEC SECURITY CI-1, and it is cheaper than every attack already closed here: let this module
 * create the tree legitimately, then OVERWRITE <dir>/scripts/worktree-reaper.mjs and commit
 * NOTHING. Checks 1/2/3 pass - it genuinely IS our linked worktree. merge --ff-only succeeds
 * ("already up to date"). merge-base --is-ancestor passes - HEAD equals origin/main. And
 * enforceTreeCurrency returns {current:true, behind:0, dirty:true}: it COMPUTES dirty at
 * tree-currency.cjs:132 and reports current anyway, exactly as its own comment says it must.
 * Nothing compared the working tree to what was committed. Capability: ONE FILE WRITE. And the
 * refresh keeps fast-forwarding the tree, so the plant survives and re-executes indefinitely.
 *
 * WHY THE OBVIOUS FIX IS ALSO BLIND (CI-2) - the reason for the extra flags. Plain
 * `git status --porcelain` cannot see a GITIGNORED plant. node_modules/ is gitignored here, and
 * node resolution walks UP from <dir>/scripts/, so <dir>/node_modules/<pkg> SHADOWS the repo root
 * copy and executes with no status output at all. --untracked-files=all --ignored=matching is the
 * discriminator, measured two-sided across pristine / tracked-modification / gitignored-plant /
 * pristine-again.
 *
 * This also retires FORGE-4 (a hand-forged .git/worktrees entry) WITHOUT a fourth linkage check:
 * its payload is untracked content, and untracked content is what this refuses.
 */
function assertSourceTreeContentClean(dir, runner, label) {
  let out;
  try {
    out = String(runner(['-C', String(dir), 'status', '--porcelain', '--untracked-files=all', '--ignored=matching']) || '');
  } catch (e) {
    const err = new Error(
      (label || 'source') + ' tree at ' + dir + ': could not verify working-tree content ('
      + ((e && e.message) || e) + '). Refusing to execute from a tree whose contents cannot be read.',
    );
    err.code = SOURCE_TREE_DIRTY_ERROR;
    throw err; // FAIL CLOSED
  }
  const allowed = sourceTreeAllowedPaths();
  const offenders = out.split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter(Boolean)
    // porcelain v1: two status chars, a space, then the path (quoted when it needs escaping).
    .map((l) => l.slice(3).trim().replace(/^"(.*)"$/, '$1'))
    .filter((x) => x && !allowed.has(x));

  if (offenders.length > 0) {
    const err = new Error(
      (label || 'source') + ' tree at ' + dir + ' has UNCOMMITTED working-tree content: '
      + offenders.slice(0, 5).join(', ')
      + (offenders.length > 5 ? ' (+' + (offenders.length - 5) + ' more)' : '')
      + '. Refusing to execute from it: the reaper runs these FILES with destructive privileges, '
      + 'while the identity, ancestry and currency checks all inspect git METADATA and pass for a '
      + 'tree whose files were simply overwritten. Ignored paths are included deliberately - a '
      + 'gitignored node_modules/ plant shadows the repo root copy and would otherwise execute '
      + 'invisibly. Reset the tree to a clean checkout, or remove it.',
    );
    err.code = SOURCE_TREE_DIRTY_ERROR;
    throw err;
  }
}

/**
 * True when the tree's HEAD is an ANCESTOR OF (or equal to) baseRef — i.e. at or behind, never
 * ahead. `merge-base --is-ancestor` exits 0 for ancestor-or-equal and non-zero otherwise, and both
 * production runners throw on a non-zero exit, so the catch covers both "is ahead" and "git could
 * not answer". FAILS CLOSED on either: an unverifiable source tree is not one to execute from.
 */
function isAtOrBehind(dir, baseRef, runner) {
  try {
    runner(['-C', String(dir), 'merge-base', '--is-ancestor', 'HEAD', String(baseRef)]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Absolute + symlink/junction-resolved + normalized. Falls back to a lexical resolve when the path
 * cannot be realpath'd (it may not exist yet on the create path).
 */
function realNorm(p) {
  const norm = (v) => String(v || '').trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  try {
    return norm(fs.realpathSync.native(String(p)));
  } catch {
    return norm(path.resolve(String(p)));
  }
}

/**
 * STARVE-1 (EXEC SECURITY): REMEDIATE, DON'T REFUSE.
 *
 * My content check (CI-1/CI-2) refuses on ANY uncommitted path, INCLUDING gitignored ones — which
 * is exactly what makes it able to see a node_modules plant. But the real .gitignore carries 263
 * patterns, among them *.log, .env, .env.*, *.backup, .ehg-session.json and .worktree.json.
 * MEASURED: a single stray `debug.log` in the source tree refuses it, resolveReaperSourceRoot then
 * returns null, sourceRoot falls back to repoRoot, and the currency guard refuses the chronically-
 * behind shared root — reaching `refused_stale_tree`. That is THE EXACT PRE-SD STARVATION, through
 * a door this SD opened. Loud rather than silent (the streak alarm fires at 6), but still my
 * regression.
 *
 * The right answer is not to weaken the check. The source tree is MACHINE-MANAGED: gitignored, on
 * its own branch, owned by nobody, reconstructible from origin/main in one command. "Dirty" there
 * is a signal to REBUILD, not to stop. So: remove and re-create, then RE-VERIFY, and refuse only
 * if the rebuilt tree is still unclean — which now means something is genuinely wrong.
 *
 * SAFETY, because this is a delete inside a security guard:
 *  - It runs ONLY after checks 1/2/3 have proven the directory IS our linked worktree at the
 *    resolved (basename-constrained) source-tree path. The target is provably the source tree, so
 *    this can never become a general delete primitive.
 *  - Removal goes through removeWorktreeViaGit, the junction-safe chokepoint (TR-2). A plain
 *    `git worktree remove` FOLLOWS THE node_modules JUNCTION AND DESTROYS THE TARGET.
 *  - Followed by `git worktree prune`. This SD's own earlier evidence records the wedge: an
 *    interrupted removal leaves a stale admin entry and the next `worktree add -B` fails
 *    "already exists", which would turn a recoverable starvation into a manual-intervention one.
 *  - Fails SOFT: if any step fails we fall through to the original refusal, never to "trust it".
 */
function rebuildSourceTree(dir, repoRoot, baseRef, branch, runner, label, logger) {
  const log = typeof logger === 'function' ? logger : () => {};
  try {
    log(`[source-tree-refresh] ${label || 'source'} tree at ${dir} is content-unverified — REBUILDING `
      + '(machine-managed tree; dirty means rebuild, not stop)');
    const { removeWorktreeViaGit } = require('../worktree-manager.js');
    // The result is CHECKED, not discarded. removeWorktreeViaGit can return {ok:false, skipped:true}
    // — residency-blocked or guard-skipped — and discarding that read as success. It happened to be
    // safe only because the re-create below then failed and we fell through to the original refusal:
    // safety by coincidence, which survives exactly until someone reorders this. Also dropped a
    // `{ force: true }` that looked like it controlled something; the function destructures only
    // {allowFail, guard, liveOwner, logger} and the removal is already unconditionally forced.
    const removal = removeWorktreeViaGit(dir, repoRoot);
    if (removal && removal.ok === false) {
      log(`[source-tree-refresh] rebuild: removal did not proceed (${removal.skipped ? 'skipped' : 'failed'}`
        + `${removal.reason ? ': ' + removal.reason : ''}) — not rebuilding`);
      return false;
    }
  } catch (e) {
    log(`[source-tree-refresh] rebuild: junction-safe removal failed (${(e && e.message) || e})`);
    return false;
  }
  try {
    // Without this, an interrupted removal leaves the admin entry and the re-create below fails
    // with "already exists" — a wedge that needs a human.
    //
    // `-C repoRoot` IS LOAD-BEARING AND WAS A REAL BUG. These argv carry no cwd of their own, so
    // they run wherever the runner happens to point. In production the runner is bound to repoRoot
    // and that is invisible; driven by a runner that is NOT bound, `worktree prune` and
    // `worktree add` EXECUTED AGAINST THE LIVE REPOSITORY — measured: a stale worktree entry and
    // two stray branches appeared in the real repo during a test run, and had to be cleaned up by
    // hand. A destructive create/remove must never depend on ambient cwd.
    runner(['-C', String(repoRoot), 'worktree', 'prune']);
  } catch { /* best effort; the add below is the real test */ }
  try {
    runner(['-C', String(repoRoot), ...buildSourceTreeWorktreeArgs(dir, baseRef, branch)]);
    markSourceTreeReapProtected(dir, label || 'source');
    return true;
  } catch (e) {
    log(`[source-tree-refresh] rebuild: re-create failed (${(e && e.message) || e})`);
    return false;
  }
}

function ensureSourceTreeWorktree({
  repoRoot, dirname, branch, envOverride, code, label,
  exists, runner, baseRef = 'origin/main', env = process.env, logger,
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
    // S2-R4 (EXEC SECURITY): IDENTITY IS NOT INTEGRITY. A GENUINE `git worktree add`-ed tree at
    // this path, carrying one attacker commit ON TOP OF origin/main, passes every check above:
    // it is really our worktree (identity), `merge --ff-only` is a harmless no-op (already
    // up to date), and enforceTreeCurrency measures BEHIND — which is 0, because the tree is
    // AHEAD. Nothing in the pipeline rejects "ahead", so the extra commit executes with the
    // reaper's destructive privileges and persists indefinitely: `-B` only force-resets on the
    // CREATE path, and the directory is gitignored, so `git status` never shows it.
    //
    // This also subsumes the TOCTOU question — same outcome, no race needed.
    //
    // SCOPED TO THE SOURCE TREE, deliberately not added to enforceTreeCurrency: that authority is
    // applied to ordinary worker worktrees, which are legitimately ahead of main (that is what a
    // feature branch IS). A blanket ancestry rule there would refuse the entire fleet.
    if (!isAtOrBehind(dir, baseRef, runner)) {
      const err = new Error(
        `${label || 'source'} tree at ${dir} has commits NOT in ${baseRef}. Refusing to execute from it: ` +
        'the source tree must track ' + baseRef + ' exactly, and a tree that is AHEAD carries code that ' +
        'no review or CI has seen while passing both the identity probe and the currency check ' +
        '(which measures BEHIND, and this tree is not behind). Reset it to ' + baseRef + ' or remove it.',
      );
      err.code = SOURCE_TREE_AHEAD_ERROR;
      throw err; // fail soft at the caller, exactly like the identity refusal
    }
    // CI-1/CI-2/FORGE-4: metadata is verified above; now verify the FILES. Last, because the
    // refresh legitimately changes the working tree and this must judge the final state.
    //
    // STARVE-1: on failure, REBUILD once and re-verify rather than refusing outright — refusing
    // starves the reaper on any stray gitignored artifact. A rebuilt tree that is STILL unclean is
    // a real problem and does refuse.
    try {
      assertSourceTreeContentClean(dir, runner, label);
    } catch (contentErr) {
      const rebuilt = rebuildSourceTree(dir, repoRoot, baseRef, branch, runner, label, logger);
      if (!rebuilt) throw contentErr;
      assertSourceTreeContentClean(dir, runner, label); // still dirty => genuinely wrong, refuse
      return { dir, created: true, refreshed: true, rebuilt: true };
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
  SOURCE_TREE_AHEAD_ERROR,
  SOURCE_TREE_DIRTY_ERROR,
  SOURCE_TREE_BASENAME_ERROR,
  GIT_REDIRECT_ENV_KEYS,
  GIT_REDIRECT_ENV_PREFIXES,
  scrubGitEnv,
  makeScrubbedGitRunner,
  isWorktreeExemptPath,
  assertSourceTreeNotExempt,
  resolveSourceTreeDir,
  buildSourceTreeWorktreeArgs,
  buildSourceTreeUpdateArgs,
  ensureSourceTreeWorktree,
};
