/**
 * git-freshness.js — Git State Verification for Heal Scoring
 *
 * Ensures the local codebase is up-to-date with remote before scoring.
 * Prevents stale-codebase scoring that produces misleading results.
 *
 * Root cause: After worktree PRs merge to main on GitHub, the local
 * main branch stays behind. Scoring agents evaluate stale code and
 * report no improvement despite completed SDs.
 *
 * Three safeguards:
 *   1. ensureFresh() — fetch + auto-pull if behind remote
 *   2. getGitMeta()  — capture commit SHA + branch for score audit trail
 *   3. warnIfWorktree() — detect worktree scoring (may miss main-branch code)
 */

import { execSync } from 'child_process';

/**
 * Ensure the local branch is up-to-date with its remote tracking branch.
 * If behind, auto-pulls. Returns a status object for logging.
 *
 * @param {object} opts
 * @param {string} opts.cwd - Working directory (default: process.cwd())
 * @param {boolean} opts.autoPull - Auto-pull if behind (default: true)
 * @param {string} opts.remote - Remote name (default: 'origin')
 * @returns {{ fresh: boolean, branch: string, behind: number, ahead: number, pulled: boolean, sha: string }}
 */
export function ensureFresh(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const autoPull = opts.autoPull !== false;
  const remote = opts.remote || 'origin';

  const result = {
    fresh: true,
    branch: '',
    behind: 0,
    ahead: 0,
    pulled: false,
    sha: '',
    error: null,
  };

  try {
    // Get current branch
    result.branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf8' }).trim();

    // Fetch remote (quiet, no output)
    try {
      execSync(`git fetch ${remote} ${result.branch} --quiet`, { cwd, encoding: 'utf8', stdio: 'pipe' });
    } catch {
      // Fetch may fail if no tracking branch — that's OK
    }

    // Get current SHA
    result.sha = execSync('git rev-parse HEAD', { cwd, encoding: 'utf8' }).trim();

    // Check if tracking branch exists
    let trackingRef;
    try {
      trackingRef = execSync(`git rev-parse ${remote}/${result.branch}`, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
    } catch {
      // No tracking branch — can't compare, assume fresh
      return result;
    }

    // Count behind/ahead
    const counts = execSync(
      `git rev-list --left-right --count ${result.branch}...${remote}/${result.branch}`,
      { cwd, encoding: 'utf8', stdio: 'pipe' }
    ).trim();

    const [ahead, behind] = counts.split(/\s+/).map(Number);
    result.ahead = ahead || 0;
    result.behind = behind || 0;
    result.fresh = result.behind === 0;

    // Auto-pull if behind
    if (result.behind > 0 && autoPull) {
      console.log(`\n⚠️  Local ${result.branch} is ${result.behind} commit(s) behind ${remote}/${result.branch}`);
      console.log('   Auto-pulling to ensure scoring uses latest code...');

      try {
        execSync(`git pull ${remote} ${result.branch}`, { cwd, encoding: 'utf8', stdio: 'pipe' });
        result.pulled = true;
        result.sha = execSync('git rev-parse HEAD', { cwd, encoding: 'utf8' }).trim();
        result.fresh = true;
        result.behind = 0;
        console.log(`   ✅ Pulled successfully. Now at ${result.sha.substring(0, 10)}`);
      } catch (pullErr) {
        result.error = `Auto-pull failed: ${pullErr.message}`;
        console.error(`   ❌ Auto-pull failed: ${pullErr.message}`);
        console.error('   ⚠️  Scoring will proceed against STALE local code.');
        console.error(`   Fix: manually run 'git pull ${remote} ${result.branch}' and retry.`);
      }
    } else if (result.behind > 0) {
      result.error = `Local branch is ${result.behind} commit(s) behind remote`;
      console.warn(`\n⚠️  Local ${result.branch} is ${result.behind} commit(s) behind ${remote}/${result.branch}`);
      console.warn('   Scoring may produce stale results. Run \'git pull\' first.');
    }
  } catch (err) {
    result.error = err.message;
    // Non-fatal: if git commands fail, scoring still proceeds
  }

  return result;
}

/**
 * Get git metadata for embedding in score records.
 * Provides audit trail of what code was actually scored.
 *
 * @param {string} cwd - Working directory
 * @returns {{ sha: string, branch: string, shortSha: string, isWorktree: boolean, worktreePath: string|null }}
 */
export function getGitMeta(cwd) {
  const meta = {
    sha: '',
    branch: '',
    shortSha: '',
    isWorktree: false,
    worktreePath: null,
  };

  try {
    meta.sha = execSync('git rev-parse HEAD', { cwd: cwd || process.cwd(), encoding: 'utf8', stdio: 'pipe' }).trim();
    meta.shortSha = meta.sha.substring(0, 10);
    meta.branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: cwd || process.cwd(), encoding: 'utf8', stdio: 'pipe' }).trim();

    // Detect worktree
    const gitDir = execSync('git rev-parse --git-dir', { cwd: cwd || process.cwd(), encoding: 'utf8', stdio: 'pipe' }).trim();
    meta.isWorktree = gitDir.includes('.worktrees') || gitDir.includes('worktrees');
    if (meta.isWorktree) {
      meta.worktreePath = cwd || process.cwd();
    }
  } catch {
    // Non-fatal
  }

  return meta;
}

/**
 * Emit a warning if scoring is happening inside a worktree.
 * Worktree scoring may miss code that only exists on main.
 *
 * @param {object} gitMeta - Output from getGitMeta()
 */
export function warnIfWorktree(gitMeta) {
  if (gitMeta.isWorktree) {
    console.warn(`\n⚠️  WORKTREE DETECTED: Scoring from worktree branch '${gitMeta.branch}'`);
    console.warn('   Worktree may not include all merged changes from main.');
    console.warn('   For accurate portfolio-level scoring, run from main branch.');
  }
}
