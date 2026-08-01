/**
 * SD-LEO-INFRA-WORKTREE-CONTENTION-CLEANUP-001 — shared worktree reapability predicate.
 *
 * SINGLE SOURCE OF TRUTH for "is this worktree safe to remove?". Consumed by every
 * worktree removal / cleanup path — the choke point `removeWorktreeViaGit`
 * (lib/worktree-manager.js), the sweep reaper (scripts/worktree-reaper.mjs),
 * concurrent-session cleanup (scripts/hooks/concurrent-session-worktree.cjs),
 * cleanup-pending-sweep (scripts/cleanup-pending-sweep.mjs) — and the orphan-quota
 * classifier (lib/worktree-quota.js), so the live-owner / dirty-tree / unpushed
 * rule is implemented EXACTLY ONCE rather than re-derived ad hoc per path.
 *
 * Root defect (witnessed twice — CronGenius pilot ~2026-05-28 and
 * SD-LEO-INFRA-LINT-METADATA-ORPHAN-001 on 2026-05-30): ad-hoc cleanup paths removed
 * worktrees that belonged to a LIVE session or held UNCOMMITTED / UNPUSHED work,
 * causing mid-EXEC data loss. A worktree is reapable ONLY when its owner is dead
 * AND its tree is clean AND fully pushed.
 *
 * This module mirrors (and is the new home of) the dirty/unpushed helpers that
 * previously lived locally inside scripts/worktree-reaper.mjs; the reaper now
 * imports them from here so there is one canonical implementation.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const REAP_REASONS = Object.freeze({
  LIVE_OWNER: 'live_owner',
  DIRTY_TREE: 'dirty_tree',
  UNPUSHED: 'unpushed',
  ORPHAN_CLEAN: 'orphan_clean',
  // SD-FDBK-INFRA-ORPHAN-WORKTREE-STRANDING-001-B FR-7: the probes could not answer.
  // Distinct from ORPHAN_CLEAN on purpose — "I looked and found nothing" and "I could
  // not look" had the same return value here, which is the whole defect.
  UNVERIFIABLE: 'unverifiable',
  // QF-20260801-998: a CONTAINER under .worktrees/ — not a worktree at all.
  CONTAINER_DIR: 'container_dir',
});

/**
 * Directory names living under `.worktrees/` that are CONTAINERS, not worktrees.
 *
 * QF-20260801-998 — this list used to exist only in lib/worktree-quota.js, where
 * classifyOrphanDirs skips these entries. isReapable had no equivalent, and isReapable
 * is the SSOT that FOUR removal paths consult (worktree-manager.js, worktree-quota.js,
 * cleanup-pending-sweep.mjs, safe-worktree-remove.mjs). These directories hold no .git
 * of their own, so once the walk-up was closed they began reporting orphan_clean —
 * `.worktrees/_archive` alone holds 40 archived worktrees, and it was protected before
 * only by the false inherited dirt that SD-FDBK-INFRA-ORPHAN-WORKTREE-STRANDING-001-C
 * removed. Protection by a bug is not protection; this makes it explicit.
 *
 * Defined HERE rather than in worktree-quota.js because quota imports this module
 * (worktree-quota.js:34) — importing back would be a cycle. Quota re-exports it as
 * WORKTREE_QUOTA_HELPERS so there stays exactly ONE definition.
 */
export const WORKTREE_CONTAINER_DIRS = Object.freeze(new Set(['_archive', 'qf', 'sd', 'adhoc']));

/** Resolve + forward-slash + lowercase, for cross-platform path-key comparison. */
export function normalizePath(p) {
  if (!p) return '';
  try { return path.resolve(p).replace(/\\/g, '/').toLowerCase(); }
  catch { return String(p).replace(/\\/g, '/').toLowerCase(); }
}

/** Default git runner: spawnSync, never throws, returns {stdout,stderr,code}. */
export function runGit(args, cwd = process.cwd()) {
  const res = spawnSync('git', args, {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  return {
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    code: res.status == null ? 1 : res.status,
  };
}

/**
 * Working-tree dirty status. Returns {dirtyCount, untracked, modified, exists}.
 * A non-existent path is reported as exists:false / dirtyCount:0 (nothing to lose).
 *
 * SD-LEO-FEAT-DATA-LOSS-HIGH-001 (FR-1): `modified` lists TRACKED changed file paths
 * (porcelain lines NOT starting with '?? '). These are uncommitted edits to existing files —
 * the ~56-LOC data-loss class — which the reaper's preserve-before-delete step previously
 * IGNORED (it copied only `untracked`). Rename/copy lines (`R  old -> new`) contribute the
 * NEW (current) path; pure deletions (a 'D' in the 2-char status) are skipped — there is no
 * working-tree file to preserve. PURE: status comes from the injected gitRunner only.
 * Existing fields (dirtyCount/untracked/exists) are unchanged for back-compat.
 */
/**
 * Does `wtPath` own the git state that `git` commands run there would report?
 *
 * Three outcomes, and conflating any two of them causes a real defect:
 *   - git cannot answer at all (no repo anywhere above)  => ownsGitState:false, definitive
 *   - git answers about an ANCESTOR (the walk-up)        => ownsGitState:false, definitive
 *   - git answers about THIS tree                        => ownsGitState:true
 *
 * Only the third case makes a subsequent `status`/`cherry` failure genuinely UNKNOWN.
 * Separator- and case-tolerant because Windows `--show-toplevel` returns forward slashes
 * while path.resolve returns backslashes — a naive === reports every real worktree as
 * not-its-own, which silently disables the guard.
 */
/**
 * QF-20260801-998: `path.resolve` does NOT resolve junctions, symlinks or 8.3 short
 * names; git's `--show-toplevel` returns the REAL path. So a genuinely-owned worktree
 * reached through an alias compares unequal and reads as a walk-up — the guard failing
 * in the UNDER-PROTECTIVE direction, licensing deletion of a tree holding uncommitted
 * work. Latent rather than live (the current layout has no alias), but the DB-persisted
 * path at cleanup-pending-sweep.mjs:245 originates from sd-start.js and is the way one
 * would enter. realpath both sides before comparing; fall back to the given path when
 * it cannot be resolved, so a missing directory still compares as before.
 */
function realPathOrSelf(p) {
  try { return fs.realpathSync.native(p); } catch { return p; }
}

function resolveWorktreeRoot(wtPath, gitRunner) {
  try {
    const res = gitRunner(['rev-parse', '--show-toplevel'], wtPath);
    if (!res || res.code !== 0) return { ownsGitState: false, toplevel: null };
    const toplevel = String(res.stdout || '').trim();
    if (!toplevel) return { ownsGitState: false, toplevel: null };
    return { ownsGitState: normalizePath(realPathOrSelf(toplevel)) === normalizePath(realPathOrSelf(wtPath)), toplevel };
  } catch {
    // A THROWN runner is an unknown, not a definitive "no git here" — say so by
    // claiming ownership, which routes the caller into its unknown handling.
    return { ownsGitState: true, toplevel: null, probeThrew: true };
  }
}

export function collectDirtyStatus(wtPath, { gitRunner = runGit } = {}) {
  if (!wtPath || !fs.existsSync(wtPath)) {
    return { dirtyCount: 0, untracked: [], modified: [], exists: false };
  }
  try {
    const res = gitRunner(['status', '--porcelain', '--untracked-files=all'], wtPath);
    // FR-7: a non-zero exit means the question was NOT ANSWERED. Reporting dirtyCount:0
    // here told isReapable "clean" and it returned reapable:true — a locked index, a
    // corrupt or pruned gitdir, or a Windows permission error was enough to license
    // deletion of a tree that might be full of uncommitted work. `unknown` is additive:
    // dirtyCount/untracked/modified/exists keep their existing values and meaning, so
    // consumers that do not read it are byte-identical to before.
    if (res.code !== 0) return { dirtyCount: 0, untracked: [], modified: [], exists: true, unknown: true };
    const lines = (res.stdout || '').split('\n').filter(Boolean);
    const untracked = [];
    const modified = [];
    let dirty = 0;
    for (const l of lines) {
      dirty++;
      if (l.startsWith('?? ')) { untracked.push(l.slice(3).trim()); continue; }
      const status = l.slice(0, 2);
      if (status.includes('D')) continue; // deletion — no working-tree file to preserve
      let p = l.slice(3).trim();
      const arrow = p.indexOf(' -> ');         // rename/copy: keep the NEW path
      if (arrow !== -1) p = p.slice(arrow + 4).trim();
      if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1); // git quotes special chars
      if (p) modified.push(p);
    }
    // FR-1 (SD-FDBK-INFRA-ORPHAN-WORKTREE-STRANDING-001-C) — THE WALK-UP.
    //
    // `git status` run with cwd=<a .git-less directory> does not fail: discovery CLIMBS
    // OUT and answers about an ANCESTOR (.worktrees/ is gitignored, so the parent's dirt
    // is reported as this tree's — observed at 758 files, byte-identical to the repo
    // root). The probe SUCCEEDS WITH SOMEBODY ELSE'S ANSWER, so `unknown` stays false and
    // isReapable returns dirty_tree at its FIRST check — which is exactly why -B's
    // resolveWorktreeRoot guard, consulted only inside the `if (dirty.unknown || ...)`
    // branch below, is structurally incapable of seeing this input.
    //
    // LAZY BY DESIGN: ownership is asked ONLY when the answer would BLOCK reaping. A
    // clean status is verdict-identical whether or not this tree owns its git state, so
    // probing there buys nothing and would put a rev-parse on every call site — the
    // unconditional hoist -B tried and abandoned when it broke injected-runner fixtures.
    //
    // `unknown` stays FALSE on the disproved path: git ANSWERED, it just answered about
    // somebody else. Setting unknown here would route the tree into UNVERIFIABLE below
    // and re-strand it one layer down — the same shape this SD family exists to unstick.
    if (dirty > 0) {
      if (!resolveWorktreeRoot(wtPath, gitRunner).ownsGitState) {
        return { dirtyCount: 0, untracked: [], modified: [], exists: true, unknown: false, ownsGitState: false };
      }
      return { dirtyCount: dirty, untracked, modified, exists: true, unknown: false, ownsGitState: true };
    }
    // Clean: ownership deliberately NOT measured, so the field is absent rather than
    // guessed. Absent means NOT MEASURED — the same doctrine the stranded-worker
    // detector applies to an absent worktree_path.
    return { dirtyCount: dirty, untracked, modified, exists: true, unknown: false };
  } catch { return { dirtyCount: 0, untracked: [], modified: [], exists: true, unknown: true }; }
}

/** Count commits on HEAD not yet pushed to the upstream (default origin/main). */
export function countUnpushedCommits(wtPath, opts = {}) {
  return countUnpushedCommitsResult(wtPath, opts).count;
}

/**
 * FR-7 sibling of countUnpushedCommits that can say "I could not answer".
 *
 * The plain counter returns 0 on a git failure, which isReapable read as "nothing
 * unpushed" — the same conflation of not-found with could-not-look that
 * collectDirtyStatus had. countUnpushedCommits stays a number-returning wrapper so
 * every existing caller and test is unaffected; only isReapable consults `unknown`.
 *
 * NAMING, RECORDED SO IT IS NOT MISTAKEN FOR A MEASUREMENT BUG: `git cherry origin/main
 * HEAD` counts commits NOT PATCH-PRESENT IN origin/main, which is NOT the same as
 * unpushed — a branch pushed to its own remote with an open PR reports non-zero. The
 * error direction is OVER-reporting, and non-zero means NOT reapable, so it
 * OVER-PROTECTS. Making it "accurate" would REMOVE protection from every branch with an
 * open PR. The semantics deliberately do not change.
 *
 * THAT FREEZE GOVERNS *WHAT IS MEASURED*, NOT *WHICH REPO IS MEASURED* — the two are
 * separable and conflating them is what let the walk-up survive sibling -B. -C changes
 * only the latter: the count is still "commits not patch-present in upstream", it is
 * just no longer allowed to be an ANCESTOR's count. Nothing about the over-reporting,
 * and therefore nothing about the over-protection, is touched.
 *
 * @returns {{count: number, unknown: boolean, ownsGitState?: boolean}}
 */
export function countUnpushedCommitsResult(wtPath, { gitRunner = runGit, upstream = 'origin/main' } = {}) {
  if (!wtPath || !fs.existsSync(wtPath)) return { count: 0, unknown: false };
  try {
    const res = gitRunner(['cherry', upstream, 'HEAD'], wtPath);
    if (res.code !== 0) return { count: 0, unknown: true };
    const count = (res.stdout || '').split('\n').filter((l) => l.startsWith('+')).length;
    // FR-2 — the SECOND blocking input, and closing only the first is not a partial fix
    // but a broken one: isReapable returns UNPUSHED on count>0, so a tree fixed only in
    // collectDirtyStatus RE-STRANDS the moment the ancestor is ahead of origin/main,
    // which is the normal state of a busy main. Reproduced from an orphan at 42 commits
    // and again at 2. Same lazy rule, same reasoning as FR-1 above.
    if (count > 0) {
      if (!resolveWorktreeRoot(wtPath, gitRunner).ownsGitState) {
        return { count: 0, unknown: false, ownsGitState: false };
      }
      return { count, unknown: false, ownsGitState: true };
    }
    return { count, unknown: false };
  } catch { return { count: 0, unknown: true }; }
}

/**
 * THE shared reapability predicate. A worktree is reapable ONLY when ALL hold:
 *   1. no live owner   — caller supplies `liveOwner` from a fresh-heartbeat claim map
 *   2. clean tree      — no uncommitted/untracked changes
 *   3. nothing unpushed — no commits ahead of the pushed upstream
 *
 * Reason precedence when NOT reapable: live_owner > dirty_tree > unpushed.
 *
 * @param {string} worktreePath
 * @param {object} [opts]
 * @param {boolean}  [opts.liveOwner=false] true if a fresh-heartbeat session owns this worktree
 * @param {function} [opts.gitRunner]       injectable git runner (tests)
 * @param {string}   [opts.upstream]        upstream ref for the unpushed check
 * @returns {{reapable: boolean, reason: string}}
 */
export function isReapable(worktreePath, opts = {}) {
  const { liveOwner = false, gitRunner = runGit, upstream = 'origin/main' } = opts;

  // QF-20260801-998: checked FIRST, ahead of even live_owner, because this is a
  // STRUCTURAL fact about the path rather than an observation of mutable state — no
  // reading of ownership, dirt or heartbeats can make a container safe to delete.
  // Reason precedence for the other three (live_owner > dirty_tree > unpushed) is
  // unchanged.
  if (WORKTREE_CONTAINER_DIRS.has(path.basename(String(worktreePath || '')))) {
    return { reapable: false, reason: REAP_REASONS.CONTAINER_DIR };
  }

  if (liveOwner) return { reapable: false, reason: REAP_REASONS.LIVE_OWNER };

  const dirty = collectDirtyStatus(worktreePath, { gitRunner });
  if (dirty.dirtyCount > 0) return { reapable: false, reason: REAP_REASONS.DIRTY_TREE };

  const ahead = countUnpushedCommitsResult(worktreePath, { gitRunner, upstream });
  if (ahead.count > 0) return { reapable: false, reason: REAP_REASONS.UNPUSHED };

  // FR-7: could-not-look is not proof-of-clean — ordered AFTER both positive checks so a
  // tree that actually answered keeps its more specific reason.
  //
  // BUT (TESTING F1/F3) "git could not answer" splits in two, and collapsing them created a
  // NEW stranding: a PRUNED or .git-less directory makes every git command fail, which the
  // first cut of this read as unverifiable and refused FOREVER — precisely the orphan shape
  // this SD family exists to unstick, re-created one layer down. It also broke
  // cleanup-pending-sweep, whose fixtures are bare mkdtemp dirs.
  //
  // So: only ask WHOSE git state this is once a probe has already failed. A directory that
  // owns none is definitively clean (it holds no commits and no uncommitted work of its
  // own); a directory that owns its git state and still failed is genuinely unknown. The
  // probe is deliberately NOT hoisted into collectDirtyStatus/countUnpushedCommitsResult —
  // that would add a git call to every call site and break existing injected-runner
  // fixtures that never anticipated a rev-parse.
  if (dirty.unknown || ahead.unknown) {
    if (!resolveWorktreeRoot(worktreePath, gitRunner).ownsGitState) {
      return { reapable: true, reason: REAP_REASONS.ORPHAN_CLEAN };
    }
    return { reapable: false, reason: REAP_REASONS.UNVERIFIABLE };
  }

  return { reapable: true, reason: REAP_REASONS.ORPHAN_CLEAN };
}

/**
 * Structured skip-reason log line (FR-6). Emits a single machine-grep-able line
 * describing a reap/skip decision so a stuck-quota condition is never silent.
 * @param {object} logger - console-like (defaults to console.warn)
 */
export function logReapDecision({ worktree, decision, reason, ownerSession = null, heartbeatAgeS = null }, logger = console.warn) {
  logger(`[reapability] ${JSON.stringify({ worktree: normalizePath(worktree), decision, reason, owner_session: ownerSession, heartbeat_age_s: heartbeatAgeS })}`);
}
