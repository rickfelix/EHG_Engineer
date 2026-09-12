'use strict';

/**
 * ENF-20 shallow-fetch guard (QF-20260912-292).
 *
 * THE INCIDENT THIS EXISTS FOR: every worktree of this repo shares ONE `.git` object store and
 * ONE shallow boundary. Measured 2026-09-12 05:06-05:28Z: a worker's audit script ran
 * `git fetch --depth=1 --no-tags origin <ref>` once per reclaim ref (~250 times) from its own
 * worktree; `.git/shallow` grew fleet-wide in ~20s and every OTHER seat's `git merge --ff-only
 * origin/main` failed with "refusing to merge unrelated histories" until the coordinator ran
 * `--unshallow` and repaired it. `pre-tool-enforce.cjs` (the one choke point every Bash call
 * passes) had zero rules mentioning fetch/depth/shallow/unshallow. This closes the CLASS, not
 * just the one script (QF-20260912-147 removed --depth from that script alone).
 *
 * Mirrors lib/heredoc-substitution-guard.cjs (ENF-19) / lib/shared-tree-guard.cjs (ENF-17): a
 * pure, unit-testable decision module. The hook owns cwd/`-C`/`--git-dir` resolution (via
 * `git rev-parse --git-common-dir`, the same mechanism ENF-12e already uses to identify "this
 * repo's shared object store" regardless of which worktree invoked it) plus audit-logging and
 * the block/allow exit; this module owns command parsing + the block/allow decision only.
 *
 * `--unshallow` is the REPAIR, not the incident — a coordinator session running it is allowed.
 * A command whose effective target is a DIFFERENT repo (a scratch clone, `--git-dir` pointing
 * elsewhere) is never operative here: the shared shallow boundary only exists inside THIS repo's
 * object store, so a different `--git-common-dir` means a different (unaffected) shallow file.
 */

// `-C <path>` (a git global option) or `--git-dir=<path>` / `--git-dir <path>` redirect which
// repository the command targets, overriding the process cwd.
const EXPLICIT_GIT_DIR_RE = /(?:^|\s)(?:-C\s+(\S+)|--git-dir(?:=(\S+)|\s+(\S+)))/;

// A git fetch/pull/clone invocation, anywhere in the command line (so `git -C x fetch ...` and
// `git --git-dir=x fetch ...` both match on the verb regardless of leading flags/paths).
const GIT_SHALLOW_VERB_RE = /\bgit\s+(?:\S+\s+)*?(fetch|pull|clone)\b/;

// The flags whose effect on the shared shallow boundary is the actual hazard.
const SHALLOW_FLAG_RE = /--depth(?:=\S+|\s+\S+)?|--shallow-since(?:=\S+|\s+\S+)?|--shallow-exclude(?:=\S+|\s+\S+)?|--unshallow\b/g;

/**
 * Cheap, pure parse: does `cmd` contain a git fetch/pull/clone with a shallow-affecting flag?
 * @param {string} cmd
 * @returns {{isGitShallowOp: boolean, verb?: string, flags: string[], explicitGitDir: string|null}}
 */
function parseGitShallowCommand(cmd) {
  const text = String(cmd || '');
  const verbMatch = text.match(GIT_SHALLOW_VERB_RE);
  if (!verbMatch) return { isGitShallowOp: false, flags: [], explicitGitDir: null };
  const flags = [...text.matchAll(SHALLOW_FLAG_RE)].map((m) => m[0]);
  if (flags.length === 0) return { isGitShallowOp: false, flags: [], explicitGitDir: null };
  const dirMatch = text.match(EXPLICIT_GIT_DIR_RE);
  const explicitGitDir = dirMatch ? (dirMatch[1] || dirMatch[2] || dirMatch[3] || null) : null;
  const explicitGitDirKind = dirMatch ? (dirMatch[1] ? 'C' : 'git-dir') : null;
  return { isGitShallowOp: true, verb: verbMatch[1], flags, explicitGitDir, explicitGitDirKind };
}

/**
 * Decide whether a shallow-affecting fetch/pull/clone should be blocked.
 * @param {string} cmd
 * @param {object} ctx
 * @param {string|null} [ctx.targetCommonDir] - `git rev-parse --git-common-dir` resolved from
 *   the command's effective target (its `-C`/`--git-dir` override, or its cwd, if given).
 * @param {string|null} [ctx.fleetCommonDir] - the same, resolved from THIS process's own cwd
 *   (which — per every worktree sharing one object store — equals targetCommonDir whenever the
 *   command would actually touch the fleet's shallow boundary).
 * @param {boolean} [ctx.isCoordinator] - whether the invoking session is the active coordinator.
 * @returns {{matched: false} | {matched: true, outcome: 'block', verb: string, flags: string[]}}
 */
function decideShallowFetchGuard(cmd, { targetCommonDir = null, fleetCommonDir = null, isCoordinator = false } = {}) {
  const parsed = parseGitShallowCommand(cmd);
  if (!parsed.isGitShallowOp) return { matched: false };

  // An explicit --git-dir/-C pointing OUTSIDE this repo's shared object store never touches our
  // shallow boundary — resolution failure (either side null) fails CLOSED (matched), since an
  // unresolved target is not proof of safety.
  if (targetCommonDir && fleetCommonDir && targetCommonDir !== fleetCommonDir) {
    return { matched: false };
  }

  // --unshallow alone is the repair, not the incident.
  if (isCoordinator && parsed.flags.every((f) => f.startsWith('--unshallow'))) {
    return { matched: false };
  }

  return { matched: true, outcome: 'block', verb: parsed.verb, flags: parsed.flags };
}

module.exports = { parseGitShallowCommand, decideShallowFetchGuard, EXPLICIT_GIT_DIR_RE, GIT_SHALLOW_VERB_RE, SHALLOW_FLAG_RE };
