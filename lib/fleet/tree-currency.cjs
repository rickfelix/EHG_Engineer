'use strict';
/**
 * FAIL-CLOSED working-tree currency assertion.
 * SD-LEO-INFRA-SPAWN-ROOT-CURRENCY-INVARIANT-001 FR-1.
 *
 * WHY THIS EXISTS. The spawn path and the worktree reaper both EXECUTE FROM the
 * repository root, and nothing keeps the root current. Every merge re-stales the tree
 * that spawns the next worker, so a merged fix is inert until somebody happens to pull.
 * Measured 2026-07-25: 26 commits landed on origin/main in two hours, 111 in a day.
 * Two subsystems were provably running code that had already been replaced — a canary
 * fix (PR 6464) and the worktree-reaper opt-out marker, whose fix sits 50 commits back,
 * so a root behind it executes a reaper containing ZERO occurrences of the protection.
 *
 * WHY IT IS NOT lib/governance/checkout-freshness.js. That module answers a similar
 * question but FAILS OPEN: every git error returns FRESH. It has five advisory
 * startup-badge consumers, so inverting it in place would silently change all of them.
 * More importantly, a fail-open gauge is exactly the thing this SD rejects — the
 * acceptance bar is that no executing path may depend on a human or a loop remembering
 * to pull, and a check that reports CURRENT when it could not actually tell is a habit
 * with monitoring, not an invariant. So: a separate module, failing CLOSED, and that one
 * left untouched.
 *
 * FAIL-CLOSED means EVERY abnormal outcome — git missing, remote unreachable, timeout,
 * detached HEAD, unparseable output, not-a-repository — yields current:false. There is
 * no branch that returns current:true on uncertainty.
 *
 * BEHIND-COUNT SEMANTICS (FR-1 / correction C4, stated because it surprised us):
 * `git rev-list --count HEAD..<baseRef>` counts EVERY commit reachable from baseRef but
 * not from HEAD — not the first-parent distance. On a merge-heavy history a rewind of 3
 * merge commits reported 10, because each merge drags in the commits it merged. That is
 * the correct number for "how much code am I missing", which is the question that
 * matters here, so it is what we use — but any assertion on this value must expect the
 * reachability count, not the number of `git reset` steps.
 *
 * PURITY: all git invocation goes through an injectable `runner`, so the decision table
 * is unit-testable without a live git, and so callers can supply their own timeout.
 */
const { execFileSync } = require('child_process');

/** The ref an execution-source tree must be current with respect to. */
const DEFAULT_BASE_REF = 'origin/main';

/** Bound every git call — a hung fetch must not convert a spawn into an unbounded stall. */
const DEFAULT_TIMEOUT_MS = 15000;

/** The only branch a tree may be SELF-HEALED on; anything else is refuse-only. */
const SELF_HEALABLE_BRANCH = 'main';

/**
 * SEC-1: a ref must never be able to lead with a dash (git would read it as an option).
 * Deliberately strict — this gates a value that reaches a subprocess argv.
 */
const VALID_BASE_REF = /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/;

function defaultRunner(args, { cwd, timeoutMs }) {
  return execFileSync('git', args, {
    cwd,
    timeout: timeoutMs,
    encoding: 'utf8',
    // SCRUB-2 (EXEC SECURITY, re-rated to BLOCKING after measurement): this runner is the
    // PRODUCTION path — worktree-reaper-tick only injects a runner when opts.currencyRunner is set,
    // i.e. in tests. Measured: with GIT_CONFIG_COUNT/core.fsmonitor set, the injected command RAN
    // and assessTreeCurrency still returned reason="current". The source-tree scrub landed on one
    // door; this one kept serving, on the same directory in the same tick.
    env: require('./source-tree-refresh.cjs').scrubGitEnv(process.env),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function notCurrent(reason, extra = {}) {
  return {
    current: false,
    selfHealable: false,
    reason,
    behind: null,
    dirty: null,
    branch: null,
    ...extra,
  };
}

/**
 * Assess whether a working tree is current with respect to a base ref.
 *
 * @param {object}   opts
 * @param {string}   opts.dir        the working tree to assess
 * @param {string}   [opts.baseRef]  defaults to origin/main
 * @param {Function} [opts.runner]   (args, {cwd, timeoutMs}) => stdout; injected for tests
 * @param {number}   [opts.timeoutMs]
 * @param {boolean}  [opts.fetch]    fetch before comparing (default true — without it the
 *                                   comparison is against a possibly-ancient remote ref,
 *                                   which is the same lie in a different place)
 * @returns {{current:boolean, selfHealable:boolean, reason:string,
 *            behind:number|null, dirty:boolean|null, branch:string|null}}
 */
function assessTreeCurrency({
  dir,
  baseRef = DEFAULT_BASE_REF,
  runner = defaultRunner,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetch = true,
} = {}) {
  if (!dir || typeof dir !== 'string') return notCurrent('no_dir');
  // SEC-1 (adversarial security review): baseRef is split and handed to git as positional
  // arguments. A value LEADING WITH A DASH is parsed by git as an OPTION, not a ref —
  // reproduced during review: `--upload-pack=<program>/main` made git EXECUTE the named
  // program. Not reachable today (baseRef defaults to origin/main and no caller overrides
  // it), but it is a local command-execution primitive the moment anyone wires baseRef to
  // env, DB config or a flag. Validate the shape, and use `--` below so git can never
  // treat a ref as an option regardless.
  if (!VALID_BASE_REF.test(String(baseRef || ''))) return notCurrent('invalid_base_ref');

  // R5 (post-CI RCA): remember the argv actually in flight. When this refuses in
  // production the operator gets only `reason=git_error`; identifying the real cause
  // (a 15s `git fetch` timeout, vs. git absent, vs. not-a-repository) previously took
  // wall-clock forensics on CI run durations. Carry the command and git's own message.
  let lastArgs = null;
  const run = (args) => { lastArgs = args; return runner(args, { cwd: dir, timeoutMs }); };

  try {
    // Refresh the remote ref first. A comparison against a stale origin/main would
    // report CURRENT for a tree that is in fact behind — the exact failure this exists
    // to prevent, relocated one level down.
    if (fetch) {
      const [remote, ...rest] = String(baseRef).split('/');
      const branch = rest.join('/');
      if (remote && branch) run(['fetch', '--quiet', '--', remote, branch]);
      else run(['fetch', '--quiet']);
    }

    const branch = String(run(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    // 'HEAD' is git's answer for a detached HEAD. It is never current for our purposes:
    // we cannot know what it is supposed to track, and we must not guess.
    if (!branch || branch === 'HEAD') {
      return notCurrent('detached_head', { branch: branch || null });
    }

    const dirty = String(run(['status', '--porcelain'])).trim().length > 0;

    const rawBehind = String(run(['rev-list', '--count', `HEAD..${baseRef}`])).trim();
    const behind = Number.parseInt(rawBehind, 10);
    // An unparseable count must NOT collapse to 0 — that would silently read as current.
    if (!Number.isFinite(behind) || behind < 0) {
      return notCurrent('unparseable_behind_count', { branch, dirty });
    }

    if (behind === 0) {
      return { current: true, selfHealable: false, reason: 'current', behind: 0, dirty, branch };
    }

    // Behind. Self-heal is permitted ONLY when a fast-forward is safe: clean and on the
    // base branch. The shared root is chronically dirty (lib/coordinator/checkout-
    // staleness.cjs documents this), and mutating a dirty or off-branch tree risks
    // clobbering a peer worktree or a session's in-flight state — the hazard that
    // tests/restart-skill-content.test.js encodes. Everything else is refuse-only.
    const selfHealable = !dirty && branch === SELF_HEALABLE_BRANCH;
    return { current: false, selfHealable, reason: 'behind', behind, dirty, branch };
  } catch (err) {
    // EVERY failure lands here and every one of them is NOT-CURRENT. No exceptions:
    // git absent, remote unreachable, credentials expired, timeout (err.killed),
    // not-a-repository, permission denied. If we could not establish currency, we do
    // not have it.
    // A timeout is distinguishable and worth naming: execFileSync sets .killed when it
    // SIGTERMs on timeoutMs, and "the fetch took longer than the budget" is a completely
    // different operator action from "git is not installed".
    const timedOut = !!(err && (err.killed || err.signal === 'SIGTERM'));
    return notCurrent('git_error', {
      error: err && err.message ? String(err.message) : 'unknown',
      gitArgs: lastArgs ? ['git', ...lastArgs].join(' ') : null,
      timedOut,
      timeoutMs: timedOut ? timeoutMs : undefined,
    });
  }
}

/**
 * The escape hatch (FR-2 / correction C5). Deliberately keyed on a REASON rather than a
 * boolean: an operator cannot silence this by setting a flag to 1, they have to say why,
 * and that reason is carried into the log line and onto the invocation. Default OFF —
 * an unset or blank value is not a bypass.
 *
 * Why a hatch exists at all: fail-closed on git error means an offline or air-gapped
 * host, an expired credential, a proxy outage or a shallow CI checkout would make the
 * ENTIRE fleet unspawnable. That is a worse failure than the one we are fixing. But the
 * hatch must never be mistaken for currency: when it is used the answer is
 * UNKNOWN-AND-DECLARED, never CURRENT, and `currencyBypassed` says so out loud.
 */
const BYPASS_REASON_ENV = 'FLEET_TREE_CURRENCY_BYPASS_REASON';

/** Thrown when an execution-source tree is not current and cannot be safely healed. */
class TreeStaleError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'TreeStaleError';
    this.code = 'TREE_NOT_CURRENT';
    this.detail = detail;
  }
}

/**
 * Enforce currency on a tree something is about to EXECUTE from: self-heal when that is
 * safe, refuse otherwise. This is the invariant — not a gauge, not a warning. The caller
 * either proceeds from a tree known to be current, or does not proceed.
 *
 * @returns {{ok:true, healed:boolean, currencyBypassed:boolean, assessment:object}}
 * @throws  {TreeStaleError} when the tree is not current and not safely healable
 */
function enforceTreeCurrency({
  dir,
  baseRef = DEFAULT_BASE_REF,
  runner = defaultRunner,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetch = true,
  env = process.env,
  logger = console,
  label = 'execution-source tree',
  // Whether this caller may FIX a stale tree, or may only refuse. The spawn seam heals
  // (a fast-forward on a clean main is safe and keeps the fleet moving). The REAPER does
  // not: it runs unattended against a shared root, a mutation there can collide with a
  // peer worktree, and refusing costs it nothing — the next tick simply tries again. When
  // the only options are "mutate someone else's tree" and "do nothing", a destructive
  // subsystem should do nothing.
  allowSelfHeal = true,
} = {}) {
  const bypassReason = String((env && env[BYPASS_REASON_ENV]) || '').trim();
  if (bypassReason) {
    // LOUD. Every bypassed run says so, names the operator's reason, and is greppable.
    const warn = (logger && logger.warn) ? logger.warn.bind(logger) : () => {};
    warn(`[tree-currency] CURRENCY_BYPASSED ${label} at ${dir} — currency is UNKNOWN, not verified. Reason: ${bypassReason}`);
    return { ok: true, healed: false, currencyBypassed: true, bypassReason, assessment: null };
  }

  const assessment = assessTreeCurrency({ dir, baseRef, runner, timeoutMs, fetch });
  if (assessment.current) {
    return { ok: true, healed: false, currencyBypassed: false, assessment };
  }

  if (assessment.selfHealable && allowSelfHeal) {
    try {
      const [remote, ...rest] = String(baseRef).split('/');
      const branch = rest.join('/');
      runner(['pull', '--ff-only', '--quiet', '--', remote, branch], { cwd: dir, timeoutMs });
    } catch (err) {
      throw new TreeStaleError(
        `[tree-currency] REFUSED: ${label} at ${dir} is ${assessment.behind} commit(s) behind ${baseRef} `
        + `and the fast-forward failed (${err && err.message ? err.message : 'unknown'}). Not proceeding from a stale tree.`,
        { ...assessment, healAttempted: true },
      );
    }
    // Re-assess rather than assume the pull worked. Trusting the exit code here would be
    // the same "verified at the merge, not at the consumer" mistake this SD exists for.
    const after = assessTreeCurrency({ dir, baseRef, runner, timeoutMs, fetch: false });
    if (!after.current) {
      throw new TreeStaleError(
        `[tree-currency] REFUSED: ${label} at ${dir} was still not current after a fast-forward `
        + `(reason=${after.reason}, behind=${after.behind}). Not proceeding from a stale tree.`,
        { ...after, healAttempted: true },
      );
    }
    return { ok: true, healed: true, currencyBypassed: false, assessment: after };
  }

  // R5: when the reason is git_error, `reason=git_error` alone is not actionable. Name the
  // command that failed, whether it was a timeout, and git's own message.
  const detail = assessment.reason === 'git_error'
    ? ` [${assessment.timedOut ? `TIMED OUT after ${assessment.timeoutMs}ms` : 'failed'}`
      + `${assessment.gitArgs ? `: ${assessment.gitArgs}` : ''}`
      + `${assessment.error ? ` — ${assessment.error}` : ''}]`
    : '';

  // QF-20260726-423(b): SEPARATE THE FAULT FROM THE REMEDY-BLOCKER.
  //
  // The previous wording ran the two together — "N behind and NOT safely healable (dirty=…)
  // — refusing rather than mutating a dirty tree" — which reads as though DIRT is what
  // failed the check. It is not, and that misreading has already cost real time: the row
  // that commissioned this change described the guard as one that "refuses a spawn from the
  // chronically-dirty shared root" and posed the design question as whether "spawn should
  // not require a clean root". Spawn does not require a clean root. assessTreeCurrency
  // returns current:true whenever behind === 0 REGARDLESS of dirty; dirt enters in exactly
  // one place (selfHealable = !dirty && branch === SELF_HEALABLE_BRANCH), where it disables
  // the automatic fast-forward. So BEING BEHIND is the fault; DIRT only blocks the auto-fix.
  //
  // Stating that split explicitly is the whole point of this edit — the guard's behaviour is
  // deliberately UNCHANGED. Nothing here relaxes it, and the dirty/off-branch self-heal
  // refusal stays exactly as it was, because mutating a dirty or off-branch tree risks
  // clobbering a peer worktree.
  const blocker = assessment.reason !== 'behind' ? null
    : assessment.dirty && assessment.branch !== SELF_HEALABLE_BRANCH
      ? `the tree is DIRTY and on '${assessment.branch}' rather than '${SELF_HEALABLE_BRANCH}'`
      : assessment.dirty ? 'the tree is DIRTY'
        : assessment.branch !== SELF_HEALABLE_BRANCH
          ? `the tree is on '${assessment.branch}' rather than '${SELF_HEALABLE_BRANCH}'`
          : null;

  const why = assessment.reason === 'behind'
    ? `THE FAULT IS BEING BEHIND: ${assessment.behind} commit(s) behind ${baseRef}`
      + (blocker
        // Behind AND un-healable: name why the auto-fix could not run, and be explicit that
        // the dirt is not itself the failure — otherwise the reader "fixes" the wrong thing.
        ? `. The auto-fast-forward could not run because ${blocker} `
          + `(dirty=${assessment.dirty}, branch=${assessment.branch}); refusing rather than mutating a `
          + `dirty or off-branch tree, which would risk clobbering a peer worktree. `
          + `NOTE: dirt alone never fails this check — a dirty tree that is CURRENT passes`
        // Clean AND on the base branch, so a fast-forward WOULD have been safe — this path is
        // reached only when the CALLER forbade healing (allowSelfHeal:false, which is the
        // reaper's deliberate posture: unattended, shared root, refusing costs it nothing).
        // The failed-fast-forward and did-not-converge cases throw earlier with their own
        // messages, so they never land here. Saying "self-heal was permitted" would be exactly
        // backwards for the only caller that reaches this branch.
        : `. A fast-forward would have been safe (clean, on '${SELF_HEALABLE_BRANCH}') but this `
          + `caller may not heal (allowSelfHeal=${allowSelfHeal}) — it refuses rather than mutating a shared tree`)
    : `currency could not be established (reason=${assessment.reason})${detail}`;

  throw new TreeStaleError(
    `[tree-currency] REFUSED: ${label} at ${dir} — ${why}. `
    + `Remedy: from a clean checkout on ${SELF_HEALABLE_BRANCH}, run git pull --ff-only. `
    + `To proceed without verifying currency, set ${BYPASS_REASON_ENV} to an explicit reason.`,
    assessment,
  );
}

module.exports = {
  assessTreeCurrency,
  enforceTreeCurrency,
  TreeStaleError,
  BYPASS_REASON_ENV,
  DEFAULT_BASE_REF,
  DEFAULT_TIMEOUT_MS,
  SELF_HEALABLE_BRANCH,
};
