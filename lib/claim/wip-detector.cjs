/**
 * Three-way WIP detector for the claim-steal guard.
 * SD-LEO-INFRA-RECLAIM-STEAL-LIVE-CLAIMANT-WIP-GUARD-001 (FR-2).
 *
 * A prior claimant "has WIP" on an SD if ANY of three signals hold: uncommitted local
 * changes, unpushed commits on the SD's branch, or an open PR for that branch. Per the
 * coordinator co-review refinement, the open-PR-only case (zero local diff, zero unpushed
 * commits -- e.g. a builder who already pushed and opened a PR) MUST still count as WIP.
 *
 * git/gh subprocess access is injectable (runGit/runGh) so this module is unit-testable
 * without a real repo, network, or gh auth. Failing toward "has WIP" on a subprocess error
 * is the deliberate fail-safe direction (see lib/claim/heartbeat-throttle.cjs's own stated
 * philosophy: an extra refused steal costs a retry; a wrongful steal costs lost work).
 */

const { checkWorktreeWIP } = require('../execute/wip-guard.cjs');

/**
 * Default git/gh runners (spawnSync-based, mirrors scripts/worktree-reaper.mjs's runGit/runGh).
 */
function defaultRunGit(args, opts = {}) {
  const { spawnSync } = require('child_process');
  const res = spawnSync('git', args, {
    cwd: opts.cwd || process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    timeout: opts.timeout || 10000,
  });
  return { stdout: res.stdout || '', stderr: res.stderr || '', code: res.status == null ? 1 : res.status };
}

function defaultRunGh(args, opts = {}) {
  const { spawnSync } = require('child_process');
  const res = spawnSync('gh', args, {
    cwd: opts.cwd || process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: process.platform === 'win32',
    timeout: opts.timeout || 10000,
  });
  return { stdout: res.stdout || '', stderr: res.stderr || '', code: res.status == null ? 1 : res.status };
}

/**
 * Does this SD's branch have unpushed commits vs origin/main? Fail-safe: a git error is
 * treated as "has unpushed commits" (true) rather than silently clearing this WIP signal.
 * @param {string} branch
 * @param {{cwd?: string}} opts
 * @param {Function} runGit
 * @returns {boolean}
 */
function hasUnpushedCommits(branch, opts, runGit) {
  if (!branch) return false;
  try {
    const res = runGit(['cherry', 'origin/main', branch], { cwd: opts.cwd });
    if (res.code !== 0) return true; // fail-safe: unknown -> assume WIP
    return (res.stdout || '').split('\n').some((l) => l.trim().startsWith('+'));
  } catch {
    return true; // fail-safe
  }
}

/**
 * Is there an open PR for this branch? Fail-safe: a gh error/timeout is treated as "has an
 * open PR" (true) rather than silently clearing this WIP signal. repo is optional -- when
 * omitted, gh infers the repo from cwd (opts.cwd), the same pattern used elsewhere in this
 * codebase (e.g. `gh pr view <PR#>` without --repo, run from inside the target repo root).
 * @param {string} branch
 * @param {string|null} repo - "owner/name", or falsy to let gh infer from cwd
 * @param {{cwd?: string}} opts
 * @param {Function} runGh
 * @returns {boolean}
 */
function hasOpenPr(branch, repo, opts, runGh) {
  if (!branch) return false;
  try {
    const args = ['pr', 'list', '--state', 'open', '--head', branch, '--json', 'number'];
    if (repo) args.splice(1, 0, '--repo', repo);
    const res = runGh(args, { cwd: opts.cwd });
    if (res.code !== 0) return true; // fail-safe: unknown -> assume WIP
    const parsed = JSON.parse(res.stdout || '[]');
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return true; // fail-safe (includes JSON.parse failure on malformed/empty output)
  }
}

/**
 * Does the prior claimant have real work-in-progress on this SD? Three-way check:
 * uncommitted changes OR unpushed commits OR an open PR.
 * @param {string} worktreePath - absolute path to the claimant's worktree (may be missing/stale;
 *   used ONLY for the uncommitted-changes check)
 * @param {string} branch - the SD's feature branch name
 * @param {string} repo - "owner/name" for the gh PR check
 * @param {{runGit?: Function, runGh?: Function, repoRoot?: string}} [deps] - injectable
 *   subprocess runners; repoRoot is the stable main-tree cwd for the git/gh branch-ref checks
 *   (the branch is a repo-wide ref, not worktree-specific -- a missing/stale worktree must not
 *   block these two checks the way it correctly short-circuits checkWorktreeWIP)
 * @returns {{hasWip: boolean, reasons: string[]}}
 */
function hasWip(worktreePath, branch, repo, deps = {}) {
  const runGit = deps.runGit || defaultRunGit;
  const runGh = deps.runGh || defaultRunGh;
  const repoRoot = deps.repoRoot || process.cwd();
  const reasons = [];

  const wip = checkWorktreeWIP(worktreePath);
  if (wip.dirty) reasons.push('uncommitted_changes');

  if (hasUnpushedCommits(branch, { cwd: repoRoot }, runGit)) reasons.push('unpushed_commits');

  if (hasOpenPr(branch, repo, { cwd: repoRoot }, runGh)) reasons.push('open_pr');

  return { hasWip: reasons.length > 0, reasons };
}

module.exports = { hasWip, hasUnpushedCommits, hasOpenPr };
