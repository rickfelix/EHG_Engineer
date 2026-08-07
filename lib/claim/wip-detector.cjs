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

/**
 * SD-LEO-INFRA-REAPER-GH-SHELL-INJECTION-001 (FR-2) — the SECOND live instance.
 *
 * `shell: process.platform === 'win32'` USED TO BE HERE too. hasOpenPr below puts a raw
 * BRANCH NAME into this argv, so on Windows a branch name was a command, exactly as in the
 * reaper. The docblock above says this file "mirrors scripts/worktree-reaper.mjs's
 * runGit/runGh" — it mirrored the defect as well.
 *
 * IT WAS ALREADY KNOWN AND STILL SHIPPED, which is the part worth recording:
 * lib/fleet/inflight-git-state.cjs documents this exact line as defective and says the
 * claim that this module "already satisfies SR-1" is false on this platform. That prose
 * sat in another file while the defect stayed live, because no gate reads prose — there is
 * no lint covering shell:true anywhere in scripts/lint/, despite 20+ bespoke allowlist
 * lints there. It was only fixed once someone scoped it into an SD.
 *
 * The fail DIRECTION here is inverted from the reaper's and stays that way: a JSON parse
 * failure below returns has-WIP=true, so corrupt output blocks a claim steal rather than
 * permitting a reap. That makes the consequence a claim-takeover DoS rather than deletion
 * — but the command execution was identical, and that is what this change closes.
 *
 * No shell is needed: gh is a native .exe and resolves fine without one (measured on this
 * fleet; several callers here already do it). Note this runner returns a code rather than
 * throwing — unlike the reaper's — so a missing binary surfaces as a non-zero code and is
 * handled by the existing fail-safe path.
 */
function defaultRunGh(args, opts = {}) {
  const { spawnSync } = require('child_process');
  const res = spawnSync('gh', args, {
    cwd: opts.cwd || process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
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
    // `--` separates options from the ref: check-ref-format PERMITS a leading dash, so a
    // branch named `-v` or `--abbrev=7` would otherwise be consumed by git as a FLAG and the
    // positional would silently vanish. Removing the shell stops a branch being a command;
    // it does not stop a branch being an option. Same fix as detectors.js, same reason.
    const res = runGit(['cherry', 'origin/main', '--', branch], { cwd: opts.cwd });
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

// defaultRunGh/defaultRunGit are exported for TESTING ONLY (FR-2/FR-3). They are the
// DEFAULT runners, so a test that asserts their spawn options is asserting production
// behaviour; a seam-injected fake cannot, because the seam replaces the code that
// decides those options. Production callers should keep using hasWip/hasOpenPr.
module.exports = { hasWip, hasUnpushedCommits, hasOpenPr, defaultRunGh, defaultRunGit };
