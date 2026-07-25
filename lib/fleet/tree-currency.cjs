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

function defaultRunner(args, { cwd, timeoutMs }) {
  return execFileSync('git', args, {
    cwd,
    timeout: timeoutMs,
    encoding: 'utf8',
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

  const run = (args) => runner(args, { cwd: dir, timeoutMs });

  try {
    // Refresh the remote ref first. A comparison against a stale origin/main would
    // report CURRENT for a tree that is in fact behind — the exact failure this exists
    // to prevent, relocated one level down.
    if (fetch) {
      const [remote, ...rest] = String(baseRef).split('/');
      const branch = rest.join('/');
      if (remote && branch) run(['fetch', '--quiet', remote, branch]);
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
    return notCurrent('git_error', { error: err && err.message ? String(err.message) : 'unknown' });
  }
}

module.exports = {
  assessTreeCurrency,
  DEFAULT_BASE_REF,
  DEFAULT_TIMEOUT_MS,
  SELF_HEALABLE_BRANCH,
};
