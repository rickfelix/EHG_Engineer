'use strict';
/**
 * THE published hardened git runner — the ONE representation of the shell-injection-sink
 * controls that four lineages re-derived by hand (QF-20260529-706, QF-20260701-683,
 * SD-LEO-FIX-SHELL-INJECTION-RCE-001, SD-LEO-FIX-SHELL-INJECTION-REACHABLE-001).
 * SD-LEO-INFRA-PUBLISH-SHELL-INJECTION-001-A.
 *
 * Before this module, the controls existed three times under three names in three files
 * (harness-adapter run(), docmon runGit, schema-reference-lint runGit), each asserting the
 * "ONE RUNNER, NOT A FIX PER CALL SITE" principle in identical hand-copied prose while
 * implementing it privately. Import from here instead of re-deriving.
 *
 * MECHANISM -> SWITCH -> COVERED table (enumerated from git-scm.com documentation, not folklore):
 *
 * | mechanism (hostile-config vector)        | control here                          | covered |
 * |------------------------------------------|---------------------------------------|---------|
 * | core.fsmonitor (cmd git RUNS on status)  | -c core.fsmonitor= (cleared)          | yes     |
 * | core.pager / GIT_PAGER (cmd on paged out)| -c core.pager= (cleared)              | yes     |
 * | filter.<x>.clean/smudge (cmd on checkout)| env scrub of GIT_CONFIG_* injection   | partial¹|
 * | credential.helper (cmd on auth)          | env scrub; system/global NOT nulled   | partial¹|
 * | core.hooksPath / hooks (cmd on verbs)    | env scrub of GIT_* redirection keys   | partial¹|
 * | .gitattributes ext diff/textconv         | --no-ext-diff --no-textconv (diff)    | yes     |
 * | GIT_SSH_COMMAND / GIT_PROXY_COMMAND /    | scrubGitEnv denylist                  | yes     |
 * |   GIT_EXTERNAL_DIFF / GIT_EXEC_PATH ...  |                                       |         |
 * | GIT_CONFIG_COUNT/KEY_n/VALUE_n injection | scrubGitEnv prefix match ^GIT_CONFIG_ | yes     |
 * | GIT_DIR/GIT_WORK_TREE/... redirection    | scrubGitEnv denylist                  | yes     |
 * | pathspec magic (:(attr:...) etc.)        | --literal-pathspecs (DEFAULT ON)      | yes     |
 * | index/optional lock side effects         | --no-optional-locks                   | yes     |
 * | system/global config file contents       | NOT nulled by default                 | no¹     |
 * | option-shaped ref args (--upload-pack=)  | validateBaseRef / VALID_BASE_REF      | yes     |
 * | shell metacharacters in args             | argv array spawn — no shell, ever     | yes     |
 *
 * ¹ Reason (measured, source-tree-refresh.cjs:67-82): pointing GIT_CONFIG_NOSYSTEM/GLOBAL at
 *   nothing BREAKS AUTHENTICATED FETCH on this fleet — credential.helper lives in system config,
 *   github helpers in global. System/global config is the machine owner's own configuration; the
 *   measured threat is ENV-INJECTED config, which the scrub removes. Callers in contexts that
 *   never fetch (e.g. operator-contract gates) can opt IN via `noSystemConfig: true`, which is
 *   per-call/per-factory — never global (R-7).
 */

const path = require('node:path');
const { makeScrubbedGitRunner, scrubGitEnv, GIT_REDIRECT_ENV_KEYS, GIT_REDIRECT_ENV_PREFIXES } =
  require(path.join(__dirname, '..', 'fleet', 'source-tree-refresh.cjs'));

/**
 * THE ref-shape allowlist — single representation. Formerly byte-identical hand-copies at
 * lib/fleet/tree-currency.cjs:53 (origin), lib/gates/operator-contract/harness-adapter.js:76,
 * scripts/lint/schema-reference-lint.mjs:91 — all three now import from here.
 * Refuses anything option-shaped (leading '-'), empty, or carrying shell/pathspec metacharacters.
 */
const VALID_BASE_REF = /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/;

/** Throws before any process spawn — the refusal happens at validation, not inside git. */
function validateBaseRef(ref) {
  if (typeof ref !== 'string' || !VALID_BASE_REF.test(ref)) {
    throw new Error(`HOSTILE_BASE_REF: refusing ref ${JSON.stringify(ref)} — must match ${VALID_BASE_REF}`);
  }
  return ref;
}

/**
 * Recorded deliberate divergences from the default hardening. An opt-out is a LEDGER ENTRY, not a
 * silent bypass: every record needs a non-empty reason (same contract the lint allowlists enforce —
 * loadAllowlist throws /non-empty reason/; see fixture-producer-guard-lint.test.js:99-104).
 */
const OPT_OUTS = [
  {
    file: 'scripts/lint/schema-reference-lint.mjs',
    opt: 'literalPathspecs: false',
    reason: 'passes no pathspec at all — the flag would be inert decoration a later reader could '
      + 'mistake for the protection (its own header, :64-67, documents this omission as deliberate)',
  },
];

/** Refuses opt-out records whose reason is empty or whitespace — the backstop must be loud. */
function assertOptOutReasons(records = OPT_OUTS) {
  for (const r of records) {
    if (!r || typeof r.reason !== 'string' || r.reason.trim() === '') {
      throw new Error(`OPT_OUT_WITHOUT_REASON: ${JSON.stringify(r && r.file)} — an opt-out without a reason is a silent bypass`);
    }
  }
  return records;
}
assertOptOutReasons();

/** Git verbs whose output can invoke external diff/textconv drivers via .gitattributes. */
const DIFF_VERBS = new Set(['diff', 'show', 'log', 'format-patch']);

/**
 * Build the ONE hardened runner.
 *
 * @param {string} cwd repo/worktree to run in
 * @param {object} [opts]
 *   Inherited from makeScrubbedGitRunner (FR-0): spawnSync, env, envPassthrough, timeout,
 *   maxBuffer, stdio, result.
 *   Added here:
 *   - literalPathspecs (default TRUE — R-5: every measured flag-dependent site is covered by the
 *     armed suites; forgetting an opt-IN silently reopens the pathspec-magic vector, so the safe
 *     state is the default and divergence is a recorded opt-out)
 *   - noSystemConfig (default FALSE — see footnote ¹ above; per-call opt for no-fetch contexts)
 * @returns {(args: string[], callOpts?: object) => string|{status,stdout,stderr,error}}
 */
function makeHardenedGitRunner(cwd, opts = {}) {
  const {
    literalPathspecs = true,
    noSystemConfig = false,
    env = process.env,
    ...scrubOpts
  } = opts;
  // noSystemConfig rides envAugment (post-scrub) — GIT_CONFIG_NOSYSTEM is on the scrub denylist,
  // so setting it on the pre-scrub env would be silently stripped: inert decoration.
  const envAugment = noSystemConfig
    ? { ...(scrubOpts.envAugment || {}), GIT_CONFIG_NOSYSTEM: '1' }
    : scrubOpts.envAugment;
  const inner = makeScrubbedGitRunner(cwd, { ...scrubOpts, env, envAugment });
  return (args, callOpts = {}) => {
    if (!Array.isArray(args)) {
      throw new Error('HARDENED_RUNNER_ARGV_ONLY: args must be an array — a string here is the sink shape this module abolishes');
    }
    const { literalPathspecs: lp = literalPathspecs, validateRefs = [], ...innerCallOpts } = callOpts;
    for (const ref of validateRefs) validateBaseRef(ref);
    const globalFlags = ['--no-optional-locks', '-c', 'core.fsmonitor=', '-c', 'core.pager='];
    if (lp) globalFlags.unshift('--literal-pathspecs');
    // Find the verb, skipping option-VALUE args (`-c k=v`, `-C <dir>` take a separate value).
    let verbIdx = -1;
    for (let i = 0; i < args.length; i += 1) {
      const a = args[i];
      if (a === '-c' || a === '-C') { i += 1; continue; }
      if (!a.startsWith('-')) { verbIdx = i; break; }
    }
    const verb = verbIdx > -1 ? args[verbIdx] : null;
    let finalArgs;
    if (verb && DIFF_VERBS.has(verb)) {
      finalArgs = [...globalFlags, ...args.slice(0, verbIdx + 1), '--no-ext-diff', '--no-textconv', ...args.slice(verbIdx + 1)];
    } else {
      finalArgs = [...globalFlags, ...args];
    }
    return inner(finalArgs, innerCallOpts);
  };
}

module.exports = {
  VALID_BASE_REF,
  validateBaseRef,
  OPT_OUTS,
  assertOptOutReasons,
  makeHardenedGitRunner,
  // Re-exported so hardened-runner is a one-stop import for consolidating sites.
  makeScrubbedGitRunner,
  scrubGitEnv,
  GIT_REDIRECT_ENV_KEYS,
  GIT_REDIRECT_ENV_PREFIXES,
};
