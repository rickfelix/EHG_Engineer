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

const path = require('path');

/** Normalize a path for prefix comparison: backslashes to forward, strip trailing slash. */
function normalizePath(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * Parse a leading `cd <dir>` segment (the shell-segment form, e.g. from
 * `cd <sibling-repo> && git checkout -b x`). Returns the raw target token, or null.
 * @param {string} segment
 * @returns {string|null}
 */
function parseCdSegment(segment) {
  const tokens = tokenize(segment);
  if (tokens.length < 2 || tokens[0] !== 'cd') return null;
  return tokens[tokens.length - 1] || null;
}

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
 * Tokenize a segment on whitespace, honouring simple single/double quoting so a
 * quoted path with spaces stays one token. Pure, no shell semantics beyond that.
 * @param {string} segment
 * @returns {string[]}
 */
function tokenize(segment) {
  const s = String(segment || '');
  const out = [];
  let cur = '';
  let has = false; // whether the current token has started (handles empty quotes)
  let quote = null; // active quote char or null
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; has = true; continue; }
    if (/\s/.test(ch)) {
      if (has) { out.push(cur); cur = ''; has = false; }
      continue;
    }
    cur += ch; has = true;
  }
  if (has) out.push(cur);
  return out;
}

// git GLOBAL options (before the subcommand) that consume the FOLLOWING token
// when given in space form. The `=` form is self-contained in one token.
const GIT_GLOBAL_OPTS_WITH_VALUE = new Set(['-C', '-c', '--work-tree', '--git-dir', '--namespace', '--exec-path', '--super-prefix']);

/**
 * Strip leading `VAR=value` environment-assignment tokens (e.g. `FOO=bar git …`).
 * @param {string[]} tokens
 * @returns {string[]}
 */
function stripLeadingEnvAssignments(tokens) {
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
  return tokens.slice(i);
}

/**
 * Parse a git segment: locate the subcommand verb past any leading env vars and
 * git GLOBAL options, and collect the directory-redirecting globals
 * (-C / --work-tree / --git-dir) so the caller can resolve the EFFECTIVE working
 * tree the op touches. Returns null if the segment is not a git invocation.
 * @param {string} segment
 * @returns {{ verb:string, rest:string, dirs:{C:?string, workTree:?string, gitDir:?string} } | null}
 */
function parseGitSegment(segment) {
  let tokens = stripLeadingEnvAssignments(tokenize(segment));
  if (tokens.length === 0 || tokens[0] !== 'git') return null;
  tokens = tokens.slice(1);

  const dirs = { C: null, workTree: null, gitDir: null };
  const captureDir = (opt, val) => {
    if (opt === '-C') dirs.C = val;
    else if (opt === '--work-tree') dirs.workTree = val;
    else if (opt === '--git-dir') dirs.gitDir = val;
  };

  let i = 0;
  for (; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t.startsWith('-')) break; // first non-option token = the subcommand verb
    // `--opt=value` self-contained form
    const eq = t.indexOf('=');
    if (eq !== -1) {
      captureDir(t.slice(0, eq), t.slice(eq + 1));
      continue;
    }
    // space form: option consumes the next token as its value
    if (GIT_GLOBAL_OPTS_WITH_VALUE.has(t)) {
      const val = tokens[i + 1];
      captureDir(t, val);
      i++; // skip the value token
      continue;
    }
    // valueless global option (--no-pager, --paginate, --bare, …) — skip
  }

  const verb = tokens[i];
  if (verb !== 'checkout' && verb !== 'switch' && verb !== 'reset') return null;
  const rest = ' ' + tokens.slice(i + 1).join(' ') + ' ';
  return { verb, rest, dirs };
}

/**
 * Extract the `-C <dir>` argument from a single git segment, if present.
 * (Retained for back-compat / direct testing; parseGitSegment is the primary path.)
 * @param {string} segment
 */
function extractGitCDir(segment) {
  const p = parseGitSegment(segment);
  return (p && p.dirs.C) || null;
}

/**
 * Classify a single git segment as a HEAD-moving branch operation in scope for
 * the guard. Returns { kind, dirs } when blockable-in-principle, else null.
 *  - checkout/switch to a branch (incl. -b/-c create+switch) → kind 'branch'
 *  - reset --hard [<ref>]                                    → kind 'reset'
 *  - file-restore checkout (contains ` -- `)                 → null (HEAD stays)
 * `dirs` carries any -C / --work-tree / --git-dir so the caller can resolve the
 * effective working tree (defends `--work-tree=<shared-root>` — itself a hijack).
 * @param {string} segment
 */
function classifyHeadMovingGitOp(segment) {
  const p = parseGitSegment(segment);
  if (!p) return null;
  const { verb, rest, dirs } = p;

  if (verb === 'reset') {
    // Only `--hard` mutates the working tree enough to revert the host.
    return /(^|\s)--hard(\s|$)/.test(rest) ? { kind: 'reset', dirs } : null;
  }

  // checkout / switch: a file-restore form has a `--` path separator and never
  // moves HEAD, so it is out of scope.
  if (/(^|\s)--(\s|$)/.test(rest)) return null;

  // `git checkout --help` / `git switch --help` are informational.
  if (/(^|\s)(-h|--help)(\s|$)/.test(rest)) return null;

  // Otherwise this checkout/switch moves HEAD to a (possibly new) branch.
  return { kind: 'branch', dirs };
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

  // QF-20260704-121: an authoritative, harness-provided reference to the TRUE project
  // root (independent of which worktree's own copy of this hook happens to be executing
  // it — __dirname would be wrong for that). When present, a `cd`-resolved effective
  // directory that is provably outside this root entirely (e.g. an independent sibling
  // repo like marketlens under the same parent folder) can never touch the tree this
  // guard protects. Absent it, fall back to the original ctx.cwd-only behavior exactly
  // (never less safe than before).
  const sharedRoot = typeof env.CLAUDE_PROJECT_DIR === 'string' && env.CLAUDE_PROJECT_DIR
    ? normalizePath(env.CLAUDE_PROJECT_DIR) : null;

  const segments = splitSegments(cmd);
  let effectiveCwd = (ctx && ctx.cwd) || '';
  for (const seg of segments) {
    // Track a leading/chained `cd <dir>` so the NEXT segment's effective directory
    // reflects it, instead of blindly using the tool call's original tracked cwd — the
    // root cause of the sibling-repo false-positive (a `cd <sibling> && git checkout`
    // was judged against the stale starting cwd, never the command's own target).
    const cdTarget = parseCdSegment(seg);
    if (cdTarget) {
      effectiveCwd = path.isAbsolute(cdTarget) ? cdTarget : path.resolve(effectiveCwd, cdTarget);
      continue;
    }

    const op = classifyHeadMovingGitOp(seg);
    if (!op) continue;

    // Resolve the effective working tree THIS op touches. `--work-tree` sets the
    // working tree explicitly (a `--work-tree=<shared-root>` from inside a
    // worktree IS a hijack and must be judged on the target, not the cwd); else
    // `-C <dir>` changes git's directory; else the running (cd-tracked) cwd. If the
    // resolved tree is inside an isolated worktree, the op is safe.
    const dirs = op.dirs || {};
    const effectiveDir = dirs.workTree || dirs.C || effectiveCwd || '';
    if (WORKTREE_PATH_RE.test(effectiveDir)) {
      // Isolated worktree — safe, keep scanning other segments.
      continue;
    }

    if (sharedRoot) {
      const normDir = normalizePath(effectiveDir);
      if (normDir !== sharedRoot && !normDir.startsWith(sharedRoot + '/')) {
        // Genuinely outside the protected root (e.g. an independent sibling repo) — safe.
        continue;
      }
    }

    // A HEAD-moving op in the shared root while a foreign coordinator is active.
    return { block: true, reason: 'shared_root_hijack', kind: op.kind };
  }

  return { block: false, reason: 'no_head_moving_op_in_shared_root' };
}

module.exports = {
  decideSharedTreeCheckout,
  classifyHeadMovingGitOp,
  parseGitSegment,
  parseCdSegment,
  normalizePath,
  extractGitCDir,
  tokenize,
  stripLeadingEnvAssignments,
  splitSegments,
  WORKTREE_PATH_RE,
};
