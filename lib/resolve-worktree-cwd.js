/**
 * resolve-worktree-cwd.js — Resolve the git worktree that holds an SD's branch.
 *
 * SD-LEO-INFRA-BRANCH-AWARE-PLAN-001
 *
 * Why: the PLAN-TO-LEAD git verifier GATE5 (scripts/verify-git-commit-status.js)
 * and its sibling GATE6 (scripts/verify-git-branch-status.js) historically ran
 * EVERY git command in the target repo ROOT (appPath, from resolveRepoPath()).
 * For a cross-repo EHG SD whose branch lives in an `ehg/.worktrees/<SD>/`
 * worktree while ehg main is occupied by ANOTHER branch (the normal
 * multi-session case), the root reports the wrong current branch and main's
 * uncommitted files — producing false "Branch SD-ID does not match target
 * SD-ID" and "N uncommitted source files" blockers and forcing a
 * --bypass-validation. Resolving the SD's worktree makes the checks read where
 * the work actually lives; returning null preserves the no-worktree behavior
 * byte-for-byte.
 *
 * Mechanism: enumerate `git worktree list --porcelain` in the TARGET repo
 * (reusing listActiveWorktrees from worktree-quota.js — the single porcelain
 * parser in this codebase) and match the worktree whose branch belongs to the
 * SD. We do NOT read strategic_directives_v2.worktree_path: that column points
 * at the EHG_Engineer worktree, which is the wrong repo for an EHG-targeted SD.
 */

import path from 'node:path';
import { listActiveWorktrees } from './worktree-quota.js';

/**
 * Extract the canonical SD-ID from a branch name.
 * SD-ID segments are UPPERCASE alphanumeric (with optional dots for versions);
 * the slug suffix is lowercase, so the match naturally stops at the slug.
 * Mirrors the extraction used by the verifiers' checkBranchMatchesSD.
 *
 * @param {string} branchName
 * @returns {string|null}
 */
export function extractSdId(branchName) {
  if (!branchName) return null;
  const m = String(branchName).match(/SD-[A-Z0-9.]+(-[A-Z0-9.]+)*/);
  return m ? m[0] : null;
}

/**
 * Strip a leading `refs/heads/` from a branch ref. `git worktree list
 * --porcelain` emits the `branch` field as `refs/heads/<name>`.
 *
 * @param {string} branch
 * @returns {string}
 */
export function stripRefsHeads(branch) {
  if (!branch) return '';
  return String(branch).replace(/^refs\/heads\//, '');
}

/**
 * Resolve the absolute path of the worktree currently checked out on the SD's
 * branch within `appPath`'s repository, or null when none matches.
 *
 * Matching strategy (first hit wins):
 *   1. Exact branch-name equality with `expectedBranch` (refs/heads/ stripped).
 *   2. SD-ID equality: the worktree's branch extracts to the SAME SD-ID as the
 *      target (handles slug vs no-slug canonical branch forms, e.g.
 *      feat/SD-X vs feat/SD-X-some-slug). Exact SD-ID equality guards against
 *      prefix collisions (SD-X must not match SD-X-CHILD or SD-X1).
 *
 * Safe by construction: any git failure inside listActiveWorktrees yields an
 * empty list -> this returns null -> caller falls back to appPath.
 *
 * @param {string} appPath - Absolute path to the target repo ROOT.
 * @param {object} [opts]
 * @param {string} [opts.expectedBranch] - The SD's expected branch name.
 * @param {string} [opts.sdId] - The SD key/ID (e.g. SD-LEO-INFRA-...).
 * @returns {string|null} Absolute, normalized worktree path, or null.
 */
export function resolveWorktreeCwd(appPath, opts = {}) {
  if (!appPath) return null;
  const { expectedBranch, sdId } = opts;

  let worktrees;
  try {
    worktrees = listActiveWorktrees(appPath);
  } catch {
    return null;
  }
  if (!Array.isArray(worktrees) || worktrees.length === 0) return null;

  // 1. Exact branch-name match (preferred — unambiguous).
  const expectedShort = stripRefsHeads(expectedBranch);
  if (expectedShort) {
    const exact = worktrees.find((wt) => stripRefsHeads(wt.branch) === expectedShort);
    if (exact && exact.path) return path.resolve(exact.path);
  }

  // 2. SD-ID extraction fallback (slug vs no-slug canonical branch forms).
  const targetSdId = sdId || extractSdId(expectedShort);
  if (targetSdId) {
    const byId = worktrees.find(
      (wt) => extractSdId(stripRefsHeads(wt.branch)) === targetSdId
    );
    if (byId && byId.path) return path.resolve(byId.path);
  }

  return null;
}

export default resolveWorktreeCwd;
