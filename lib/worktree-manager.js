/**
 * Worktree Manager
 * SD-LEO-INFRA-GIT-WORKTREE-AUTOMATION-001 (FR-4)
 *
 * Manages git worktree lifecycle: create, list, cleanup, and validate.
 * Integrates with v_active_sessions for session→branch resolution.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const SESSIONS_DIR = '.sessions';

/**
 * Get the repository root (where .git lives)
 * @returns {string} Absolute path to repo root
 */
export function getRepoRoot() {
  return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
}

/**
 * Get the sessions directory path
 * @param {string} [repoRoot] - Optional repo root override
 * @returns {string} Absolute path to .sessions/
 */
export function getSessionsDir(repoRoot) {
  const root = repoRoot || getRepoRoot();
  return path.join(root, SESSIONS_DIR);
}

/**
 * Create a git worktree for a session
 *
 * @param {Object} options
 * @param {string} options.session - Session name (used as directory name)
 * @param {string} options.branch - Branch to check out in the worktree
 * @param {boolean} [options.force=false] - Force recreate if exists with different branch
 * @returns {{ path: string, branch: string, created: boolean, reused: boolean }}
 */
export function createWorktree({ session, branch, force = false }) {
  const repoRoot = getRepoRoot();
  const sessionsDir = getSessionsDir(repoRoot);
  const worktreePath = path.join(sessionsDir, session);

  // Ensure .sessions/ directory exists
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  // Check if worktree already exists
  if (fs.existsSync(worktreePath)) {
    const existingBranch = getWorktreeBranch(worktreePath);

    if (existingBranch === branch) {
      // Same branch — reuse (idempotent, FR-5)
      return { path: worktreePath, branch, created: false, reused: true };
    }

    if (!force) {
      throw new Error(
        `Worktree '${session}' already exists on branch '${existingBranch}'. ` +
        `Expected '${branch}'. Use --force to recreate or choose a different session name.`
      );
    }

    // Force: remove existing worktree and recreate
    removeWorktree(session);
  }

  // Check if branch exists (local or remote)
  const branchExists = branchExistsLocally(branch) || branchExistsRemotely(branch);

  if (branchExists) {
    execSync(`git worktree add "${worktreePath}" "${branch}"`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe'
    });
  } else {
    // Create new branch from current HEAD
    execSync(`git worktree add -b "${branch}" "${worktreePath}"`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe'
    });
  }

  // Write .session.json for branch guard (FR-3)
  const sessionConfig = {
    session,
    expectedBranch: branch,
    createdAt: new Date().toISOString(),
    hostname: os.hostname(),
    repoRoot
  };
  fs.writeFileSync(
    path.join(worktreePath, '.session.json'),
    JSON.stringify(sessionConfig, null, 2)
  );

  return { path: worktreePath, branch, created: true, reused: false };
}

/**
 * Symlink or junction node_modules into a worktree (FR-2)
 *
 * @param {string} worktreePath - Path to the worktree
 * @param {string} [repoRoot] - Optional repo root override
 */
export function symlinkNodeModules(worktreePath, repoRoot) {
  const root = repoRoot || getRepoRoot();
  const sourceModules = path.join(root, 'node_modules');
  const targetModules = path.join(worktreePath, 'node_modules');

  if (!fs.existsSync(sourceModules)) {
    throw new Error(
      'node_modules not found; run npm ci in repo root first'
    );
  }

  // Skip if already linked
  if (fs.existsSync(targetModules)) {
    try {
      const stat = fs.lstatSync(targetModules);
      if (stat.isSymbolicLink()) {
        const linkTarget = fs.readlinkSync(targetModules);
        if (path.resolve(path.dirname(targetModules), linkTarget) === path.resolve(sourceModules)) {
          return; // Already correctly linked
        }
      }
    } catch {
      // If we can't read the link, remove and recreate
    }
    fs.rmSync(targetModules, { recursive: true, force: true });
  }

  // On Windows, use junction (doesn't require elevation)
  // On Unix, use symlink
  if (process.platform === 'win32') {
    try {
      fs.symlinkSync(sourceModules, targetModules, 'junction');
    } catch (err) {
      throw new Error(
        `Failed to create junction for node_modules: ${err.message}. ` +
        'On Windows, ensure you have permission to create junctions or run as administrator.'
      );
    }
  } else {
    fs.symlinkSync(sourceModules, targetModules, 'dir');
  }
}

/**
 * Remove a worktree and clean up (FR-5)
 *
 * @param {string} session - Session name to remove
 */
export function removeWorktree(session) {
  const repoRoot = getRepoRoot();
  const worktreePath = path.join(getSessionsDir(repoRoot), session);

  if (!fs.existsSync(worktreePath)) {
    return; // Already gone — idempotent
  }

  try {
    execSync(`git worktree remove --force "${worktreePath}"`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe'
    });
  } catch {
    // If git worktree remove fails, clean up manually
    fs.rmSync(worktreePath, { recursive: true, force: true });
    // Prune worktree references
    try {
      execSync('git worktree prune', { cwd: repoRoot, stdio: 'pipe' });
    } catch {
      // Best effort
    }
  }
}

/**
 * List all active worktree sessions
 *
 * @returns {Array<{ session: string, path: string, branch: string, exists: boolean }>}
 */
export function listWorktrees() {
  const repoRoot = getRepoRoot();
  const sessionsDir = getSessionsDir(repoRoot);

  if (!fs.existsSync(sessionsDir)) {
    return [];
  }

  const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => {
      const sessionPath = path.join(sessionsDir, e.name);
      const configPath = path.join(sessionPath, '.session.json');
      let branch = null;
      let exists = true;

      // Try .session.json first
      if (fs.existsSync(configPath)) {
        try {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          branch = config.expectedBranch;
        } catch {
          // Fall through to git check
        }
      }

      // Validate it's a real worktree
      try {
        branch = branch || getWorktreeBranch(sessionPath);
      } catch {
        exists = false;
      }

      return {
        session: e.name,
        path: sessionPath,
        branch: branch || 'unknown',
        exists
      };
    });
}

/**
 * Resolve expected branch for a working directory.
 * Used by branch guard (FR-3) to determine what branch a worktree should be on.
 *
 * Resolution order:
 * 1. .session.json in the worktree
 * 2. v_active_sessions lookup (if supabase provided)
 * 3. null (cannot determine)
 *
 * @param {string} workdir - Working directory to check
 * @param {Object} [supabase] - Optional Supabase client for v_active_sessions lookup
 * @returns {Promise<string|null>} Expected branch name or null
 */
export async function resolveExpectedBranch(workdir, supabase) {
  // 1. Check .session.json
  const configPath = path.join(workdir, '.session.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.expectedBranch) return config.expectedBranch;
    } catch {
      // Fall through
    }
  }

  // 2. Check v_active_sessions by worktree path
  if (supabase) {
    try {
      const { data } = await supabase
        .from('v_active_sessions')
        .select('sd_id, branch')
        .eq('worktree_path', workdir)
        .in('computed_status', ['active'])
        .limit(1);

      if (data && data.length > 0 && data[0].branch) {
        return data[0].branch;
      }
    } catch {
      // DB unavailable — fail-open
    }
  }

  return null;
}

// ── Internal helpers ──

function getWorktreeBranch(worktreePath) {
  return execSync('git rev-parse --abbrev-ref HEAD', {
    cwd: worktreePath,
    encoding: 'utf8',
    stdio: 'pipe'
  }).trim();
}

function branchExistsLocally(branch) {
  try {
    execSync(`git show-ref --verify --quiet refs/heads/${branch}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function branchExistsRemotely(branch) {
  try {
    const result = execSync(`git ls-remote --heads origin ${branch}`, {
      encoding: 'utf8',
      stdio: 'pipe'
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}
