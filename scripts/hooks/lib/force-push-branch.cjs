'use strict';
/**
 * ENF-15 helper (dbcd817c): resolve the branch(es) a `git push … --force[-with-lease]`
 * command would WRITE, so the force-push gate judges the actual push target rather than
 * whatever branch the hook's own checkout happens to be on.
 *
 * The hook process runs in (or near) the main checkout, so `git rev-parse HEAD` there
 * returns `main` even when the command pushes a topic branch from a worktree or via
 * `git -C <dir>` — producing a false `protected_branch_denylist` block. Deriving the
 * branch from the refspec DESTINATION is both correct (it is the ref being written) and
 * cwd-independent.
 *
 * Fail-closed contract: when nothing can be resolved this returns `[]` and the caller
 * treats the empty/unknown branch as not-allowlisted (block). Any protected destination
 * in a multi-refspec push is surfaced so the gate still blocks it.
 */

const { execSync } = require('child_process');

const PROTECTED_RE = /^(main|master|develop|release\/.*)$/;

/**
 * Parse explicit refspec destination branch names from a `git push` command segment.
 * Handles `git -C <dir>`, leading remote, `src:dst` refspecs, `+force` prefix and
 * `refs/heads/` prefixes, and multiple refspecs.
 * @param {string} cmd
 * @returns {string[]}
 */
function pushRefspecDsts(cmd) {
  const m = String(cmd).match(/\bgit\s+(?:-C\s+(?:"[^"]+"|'[^']+'|\S+)\s+)?push\b([^\n;&|]*)/);
  if (!m) return [];
  const toks = m[1].trim().split(/\s+/).filter(Boolean).filter((t) => !t.startsWith('-'));
  if (toks.length === 0) return [];
  let refs;
  if (toks.length === 1) {
    const t = toks[0];
    // a lone token with no '/' or ':' is a bare remote name (e.g. `git push origin`) — no explicit branch
    if (!t.includes('/') && !t.includes(':')) return [];
    refs = [t];
  } else {
    refs = toks.slice(1); // drop the remote, keep the refspec(s)
  }
  return refs
    .map((r) => {
      let dst = r.includes(':') ? r.split(':').pop() : r; // src:dst -> dst
      return dst.replace(/^\+/, '').replace(/^refs\/heads\//, '');
    })
    .filter(Boolean);
}

/**
 * Resolve candidate destination branch names for a force-push command.
 * Priority: explicit refspec destination(s) → current branch in the push cwd
 * (`git -C <dir>` target, else sessionCwd) → [].
 * @param {string} cmd full Bash command
 * @param {string} [sessionCwd] PreToolUse payload `cwd`
 * @param {(c:string,o:object)=>string} [exec] injectable exec (testing)
 * @returns {string[]}
 */
function forcePushTargetBranches(cmd, sessionCwd, exec) {
  const run =
    exec ||
    ((c, o) => execSync(c, { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'], ...o }).trim());
  const dsts = pushRefspecDsts(cmd);
  if (dsts.length) return dsts;
  // Bare push: resolve the current branch in the push directory. Try the `git -C <dir>`
  // target, then the session cwd, then the hook's own process cwd (current behavior) — first
  // that yields a branch wins. The process-cwd fallback guarantees no regression when an
  // upstream-supplied cwd is in a form this platform's exec cannot chdir into.
  const dirMatch = String(cmd).match(/\bgit\s+-C\s+("[^"]+"|'[^']+'|\S+)\s+push\b/);
  const dirs = [];
  if (dirMatch) dirs.push(dirMatch[1].replace(/^['"]|['"]$/g, ''));
  if (sessionCwd) dirs.push(sessionCwd);
  dirs.push(null); // process cwd
  for (const d of dirs) {
    try {
      const b = run('git rev-parse --abbrev-ref HEAD', d ? { cwd: d } : {});
      if (b) return [b];
    } catch {
      /* try next directory */
    }
  }
  return [];
}

/**
 * The single branch ENF-15 should judge: any PROTECTED destination wins (fail-closed,
 * multi-refspec safe), otherwise the last explicit target. '' when nothing resolved.
 * @param {string[]} candidates
 * @returns {string}
 */
function effectiveForcePushBranch(candidates) {
  if (!candidates || candidates.length === 0) return '';
  return candidates.find((b) => PROTECTED_RE.test(b)) || candidates[candidates.length - 1];
}

module.exports = { pushRefspecDsts, forcePushTargetBranches, effectiveForcePushBranch, PROTECTED_RE };
