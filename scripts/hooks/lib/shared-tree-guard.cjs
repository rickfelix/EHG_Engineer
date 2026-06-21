'use strict';
/**
 * Shared-Tree Hijack Guard (ENF-17 / SD-LEO-FEAT-SHARED-TREE-HIJACK-001)
 *
 * Pure decision logic for the PreToolUse Bash guard that prevents a worker from
 * running a HEAD-moving git operation (checkout/switch to a branch, or
 * `reset --hard`) inside the SHARED operator/coordinator ROOT working tree while
 * a DIFFERENT session holds the active-coordinator pointer.
 *
 * Live incident (2026-06-11, HIGH): a worker building QF-20260610-626 ran
 * `git checkout` of its qf/ branch in the shared root, un-deploying the
 * coordinator's branch — coordinator scripts/hooks vanished from disk and every
 * supervision cron loop would have MODULE_NOT_FOUND'd on its next tick.
 *
 * Design invariants:
 *  - PURE: no git subprocess, no network, no fs (the caller injects cwd + the
 *    already-read coordinator session id). Pure string/path logic only → fast,
 *    Windows-safe, can never hang.
 *  - FAIL-OPEN: if there is no active coordinator, or the current session IS the
 *    coordinator, or anything is ambiguous, ALLOW. The guard only fires when
 *    there is a foreign host to protect, so a solo operator is never locked out.
 *  - WORKTREE-SAFE: a branch op whose effective directory is inside a
 *    .worktrees/<sd>/ subtree (including via `git -C <worktree>`) is always
 *    allowed — isolated worktrees cannot hijack the shared host.
 *  - FILE-RESTORE-SAFE: `git checkout -- <path>` / `git checkout <ref> -- <path>`
 *    do not move HEAD and are never blocked.
 */

// Matches a path that lives inside a .worktrees/<segment>/ subtree (both separators).
const WORKTREE_PATH_RE = /[/\\]\.worktrees[/\\][^/\\]+/i;

/**
 * Split a command line into shell-segment-delimited sub-commands so we evaluate
 * each `git ...` invocation independently (e.g. `cd x && git checkout y`).
 * @param {string} cmd
 * @returns {string[]}
 */
function splitSegments(cmd) {
  return String(cmd || '')
    .split(/(?:&&|\|\||[;&|()\n])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Extract the `-C <dir>` argument from a single git segment, if present.
 * Returns the raw directory string or null.
 * @param {string} segment
 */
function extractGitCDir(segment) {
  // -C <dir> or -C=<dir>; tolerate quotes around the dir.
  const m = segment.match(/\s-C(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))/);
  if (!m) return null;
  return m[1] || m[2] || m[3] || null;
}

/**
 * Classify a single git segment as a HEAD-moving branch operation in scope for
 * the guard. Returns { kind } when blockable-in-principle, else null.
 *  - checkout/switch to a branch (incl. -b/-c create+switch) → kind 'branch'
 *  - reset --hard [<ref>]                                    → kind 'reset'
 *  - file-restore checkout (contains ` -- `)                 → null (HEAD stays)
 * @param {string} segment
 */
function classifyHeadMovingGitOp(segment) {
  const s = String(segment || '').trim();
  // Must be a git invocation (optionally `git -C <dir> ...`).
  if (!/^git(\s|$)/.test(s)) return null;

  // `git checkout` / `git switch`
  const sub = s.match(/^git\b(?:\s+-C(?:=\S+|\s+\S+))?\s+(checkout|switch|reset)\b(.*)$/);
  if (!sub) return null;
  const verb = sub[1];
  const rest = sub[2] || '';

  if (verb === 'reset') {
    // Only `--hard` mutates the working tree enough to revert the host.
    return /(^|\s)--hard(\s|$)/.test(rest) ? { kind: 'reset' } : null;
  }

  // checkout / switch: a file-restore form has a `--` path separator and never
  // moves HEAD, so it is out of scope.
  if (/(^|\s)--(\s|$)/.test(rest)) return null;

  // `git checkout --help` / `git switch --help` are informational.
  if (/(^|\s)(-h|--help)(\s|$)/.test(rest)) return null;

  // Otherwise this checkout/switch moves HEAD to a (possibly new) branch.
  return { kind: 'branch' };
}

/**
 * Decide whether a Bash command must be blocked as a shared-tree hijack.
 *
 * @param {string} cmd                       The Bash tool's command string.
 * @param {object} ctx
 * @param {string} ctx.cwd                   Effective working directory of the tool call.
 * @param {string} ctx.sessionId            The current session id.
 * @param {string|null} ctx.coordinatorSessionId  Active-coordinator session id (null if none).
 * @param {object} [ctx.env]                 Environment (for LEO_SHARED_TREE_GUARD=off).
 * @returns {{ block: boolean, reason: string, kind?: string }}
 */
function decideSharedTreeCheckout(cmd, ctx) {
  const env = (ctx && ctx.env) || {};
  if (env.LEO_SHARED_TREE_GUARD === 'off') {
    return { block: false, reason: 'guard_disabled' };
  }

  const sessionId = ctx && ctx.sessionId;
  const coordinatorSessionId = ctx && ctx.coordinatorSessionId;

  // Fail-open: no foreign coordinator host to protect.
  if (!coordinatorSessionId || typeof coordinatorSessionId !== 'string') {
    return { block: false, reason: 'no_active_coordinator' };
  }
  // The coordinator may manage its own root tree.
  if (sessionId && coordinatorSessionId === sessionId) {
    return { block: false, reason: 'session_is_coordinator' };
  }

  const segments = splitSegments(cmd);
  for (const seg of segments) {
    const op = classifyHeadMovingGitOp(seg);
    if (!op) continue;

    // Resolve the effective directory of THIS op: a `-C <dir>` wins over the
    // process cwd. If that directory is inside an isolated worktree, allow it.
    const cDir = extractGitCDir(seg);
    const effectiveDir = cDir || (ctx && ctx.cwd) || '';
    if (WORKTREE_PATH_RE.test(effectiveDir)) {
      // Isolated worktree — safe, keep scanning other segments.
      continue;
    }

    // A HEAD-moving op in the shared root while a foreign coordinator is active.
    return { block: true, reason: 'shared_root_hijack', kind: op.kind };
  }

  return { block: false, reason: 'no_head_moving_op_in_shared_root' };
}

module.exports = {
  decideSharedTreeCheckout,
  classifyHeadMovingGitOp,
  extractGitCDir,
  splitSegments,
  WORKTREE_PATH_RE,
};
