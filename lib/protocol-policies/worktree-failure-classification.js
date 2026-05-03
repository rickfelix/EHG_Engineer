/**
 * lib/protocol-policies/worktree-failure-classification.js
 *
 * SD-LEO-INFRA-LEO-PROTOCOL-POLICY-001 (FR-003, Part A3)
 *
 * Extends lib/worktree-manager.js::classifyWorktreeError with three new
 * hint classifications that the base classifier does not distinguish:
 *
 *   - 'outside_repo'                — DB-stored worktree path fails repo-root
 *                                     validation (observed bug: sd-start.js
 *                                     runs from inside a worktree, making
 *                                     git rev-parse --show-toplevel return
 *                                     the wrong root; see memory
 *                                     feedback_sd_start_fails_from_inside_worktree.md).
 *   - 'false_success'               — git worktree add exits 0 but the path
 *                                     is absent from `git worktree list`
 *                                     afterward (Issue #7 / SD memory
 *                                     feedback_sd_start_worktree_false_success.md).
 *   - 'target_changed_after_claim'  — worktree target repo changed between
 *                                     the claim acquisition and the worktree
 *                                     creation step (e.g., target_application
 *                                     flipped). Caller should reconcile, not
 *                                     hard-fail.
 *
 * Falls through to the base classifier for transient git-lock / already-
 * checked-out / disk-full / already-exists hints.
 *
 * Return shape (strictly more information than the base classifier — the
 * base `{ transient, hint }` fields are preserved so existing call sites
 * can continue to read them):
 *   {
 *     code: 'outside_repo'|'false_success'|'target_changed_after_claim'
 *         |'transient'|'already_checked_out'|'stale_reference'|'disk_full'
 *         |'unknown',
 *     severity: 'warn'|'error',
 *     hint: string,
 *     transient: boolean,
 *     message: string
 *   }
 *
 * Design constraints (TR-001):
 *   - Pure function. No fs / child_process / DB calls.
 *   - Accepts either an Error, a string, or an object with .message / .stderr.
 *   - context is optional and carries classification hints that cannot be
 *     derived from the error message alone (e.g. targetChanged boolean).
 */

import { classifyWorktreeError as baseClassify } from '../worktree-manager.js';

/** Extended patterns checked before the base classifier. Order matters. */
export const EXTENDED_PATTERNS = Object.freeze([
  {
    code: 'outside_repo',
    severity: 'error',
    test: (msg) => /path rejected \(outside repo\)|INVALID_WORKTREE_PATH|db_path_rejected/i.test(msg),
    hint:
      'DB-stored worktree path failed validateWorktreePath against repo root. ' +
      'If you ran this from inside a worktree, cd to the main repo root first — ' +
      '`git rev-parse --show-toplevel` returns the worktree itself as toplevel, ' +
      'which breaks the validation.',
  },
  {
    code: 'false_success',
    severity: 'error',
    test: (msg) => /worktree.*success.*not in list|outcome=success.*missing|zombie worktree/i.test(msg),
    hint:
      'Worktree creation reported success but the path is absent from ' +
      '`git worktree list`. Zombie state. Run: git worktree prune',
  },
  {
    code: 'target_changed_after_claim',
    severity: 'warn',
    // This case cannot be detected from the message alone — callers signal it
    // via context.targetChanged = true. Treated as WARN so sd-start can
    // reconcile (reclaim worktree under new target) instead of hard-failing.
    test: (_msg, ctx) => ctx?.targetChanged === true,
    hint:
      'Worktree target application changed between claim acquisition and ' +
      'worktree creation. Reconcile the worktree under the new target instead ' +
      'of hard-failing the claim.',
  },
  {
    // SD-LEO-INFRA-START-WORKTREE-BRANCH-001: fail-closed when the explicit
    // base ref cannot be fetched. Operators see a clear remediation rather
    // than the worktree silently inheriting commits from current HEAD.
    code: 'base_ref_fetch_failed',
    severity: 'error',
    test: (msg, ctx) =>
      ctx?.errCode === 'WORKTREE_BASE_FETCH_FAILED' ||
      /WORKTREE_BASE_FETCH_FAILED|Failed to fetch worktree base ref/i.test(msg),
    hint:
      'Could not fetch the base ref for the new worktree branch. ' +
      'Verify network access to the git origin, or override the base by ' +
      'setting LEO_WORKTREE_BASE_REF (e.g., origin/main).',
  },
  {
    // SD-FDBK-ENH-SECOND-CASE-DESTRUCTIVE-001 (FR-2): fail-closed when reusing
    // a branch that is significantly behind base. Without this, the worktree
    // attaches at a stale fork-point and a subsequent merge silently undoes
    // intervening work on origin/main.
    code: 'fork_drift',
    severity: 'error',
    test: (msg, ctx) =>
      ctx?.errCode === 'WORKTREE_FORK_DRIFT' ||
      /WORKTREE_FORK_DRIFT|commits behind .*threshold|silently undo merged work/i.test(msg),
    hint:
      'Branch is forked behind the base ref by more than the configured threshold. ' +
      'Reusing it would silently undo merged work. Rebase, cherry-pick onto a ' +
      'fresh branch, or abandon the local branch and rerun sd-start. Override ' +
      'with LEO_FORK_DRIFT_THRESHOLD_COMMITS / LEO_FORK_DRIFT_THRESHOLD_HOURS only ' +
      'when you have manually verified the diff is safe.',
  },
  {
    // SD-LEO-INFRA-LEO-INFRA-WORKTREE-001 (FR-003): fail-closed when sd-start
    // creates a worktree that passes git-level post-conditions (.git pointer,
    // git worktree list registration) but is missing required substrate items
    // (lib/, package.json, scripts/, etc.). Without this code, downstream
    // tooling fails with opaque module-not-found errors 30s after the claim
    // is recorded. Caller throws Error with .errCode='WORKTREE_INCOMPLETE'
    // and .missing=[…] payload; classify maps to a stable code so RCA filters
    // and operator triage have something queryable.
    code: 'worktree_incomplete',
    severity: 'error',
    // Adversarial review of PR #3488 (finding 2): the prior fallback
    // /substrate.*items.*missing/i overmatched unrelated stage-error strings
    // (e.g., 'stage emit substrate metadata items missing from registry').
    // Anchor to the literal token thrown by resolve-sd-workdir.js OR the
    // ctx-based path that every legitimate caller already sets.
    test: (msg, ctx) =>
      ctx?.errCode === 'WORKTREE_INCOMPLETE' ||
      /\bWORKTREE_INCOMPLETE\b/.test(msg),
    hint:
      'Worktree creation reported success but required substrate items are ' +
      'missing (e.g., lib/, package.json). The incomplete worktree is preserved ' +
      'on disk for inspection. Operator: `git worktree remove --force <path> ' +
      '&& git worktree prune`, then rerun sd-start. The claim has been released ' +
      'so the SD is workable again.',
  },
]);

/**
 * Map the base classifier result to a specific extended code.
 *
 * The base classifier returns only { transient, hint }. We inspect the hint
 * string to assign a stable code that downstream consumers (telemetry, RCA
 * reports, tests) can match on without re-running regex.
 *
 * @param {string} msg
 * @param {{transient: boolean, hint: string}} base
 * @returns {string} code
 */
function baseCode(msg, base) {
  if (base.transient) return 'transient';
  if (/already checked out/i.test(msg)) return 'already_checked_out';
  if (/stale worktree/i.test(base.hint)) return 'stale_reference';
  if (/disk full/i.test(base.hint)) return 'disk_full';
  return 'unknown';
}

/**
 * Normalize heterogeneous error inputs into a message string.
 *
 * @param {unknown} err
 * @returns {string}
 */
function extractMessage(err) {
  if (typeof err === 'string') return err;
  if (!err) return '';
  // stderr may be a Buffer or string depending on child_process call site
  if (err.stderr) {
    return typeof err.stderr === 'string' ? err.stderr : err.stderr.toString();
  }
  if (typeof err.message === 'string') return err.message;
  return String(err);
}

/**
 * Classify a worktree-related error with extended vocabulary.
 *
 * @param {unknown} err - Error, string, or object with .message / .stderr
 * @param {Object} [context]
 * @param {boolean} [context.targetChanged] - true when caller knows the
 *        worktree target changed between claim and creation.
 * @returns {{code: string, severity: 'warn'|'error', hint: string, transient: boolean, message: string}}
 */
export function classify(err, context = {}) {
  const message = extractMessage(err);

  for (const pattern of EXTENDED_PATTERNS) {
    if (pattern.test(message, context)) {
      return {
        code: pattern.code,
        severity: pattern.severity,
        hint: pattern.hint,
        // Extended codes are all non-transient; preserve the base shape.
        transient: false,
        message,
      };
    }
  }

  const base = baseClassify(message);
  return {
    code: baseCode(message, base),
    severity: base.transient ? 'warn' : 'error',
    hint: base.hint,
    transient: base.transient,
    message,
  };
}
