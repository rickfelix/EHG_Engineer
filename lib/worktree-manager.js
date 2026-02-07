/**
 * Worktree Manager - Multi-WorkType Isolation
 * SD-LEO-INFRA-REFACTOR-WORKTREE-MANAGER-001
 * SD-LEO-INFRA-EXTEND-WORKTREE-ISOLATION-001
 *
 * Manages git worktree lifecycle keyed by work identifier.
 * Supports SD, QF, and ad-hoc work types.
 * Worktrees live at .worktrees/<workType>/<workKey>/ for cross-session persistence.
 * Legacy flat layout (.worktrees/<sdKey>/) is still supported.
 *
 * Legacy session-keyed API is supported via deprecation adapter.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const WORKTREES_DIR = '.worktrees';

/** @typedef {'SD'|'QF'|'ADHOC'} WorkType */

/**
 * @typedef {Object} WorktreeResult
 * @property {'worktree'|'main-fallback'} mode - Whether a worktree was used or fell back to main
 * @property {string} path - Absolute path to working directory
 * @property {string} branch - Branch name
 * @property {WorkType} workType - Type of work
 * @property {string} workKey - Work identifier (SD key, QF ID, or ad-hoc token)
 * @property {boolean} [created] - Whether worktree was freshly created
 * @property {boolean} [reused] - Whether an existing worktree was reused
 * @property {string} [reason] - Reason for fallback (only when mode='main-fallback')
 */

// Rate-limit deprecation warnings to once per process
let _deprecationWarningEmitted = false;

// Regex: alphanumeric, hyphens, underscores only. Max 128 chars.
const SD_KEY_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Validate an sdKey for filesystem safety.
 * Rejects path traversal characters, empty strings, and overly long keys.
 *
 * @param {string} sdKey
 * @throws {Error} with code INVALID_SD_KEY if invalid
 */
export function validateSdKey(sdKey) {
  if (!sdKey || typeof sdKey !== 'string') {
    const err = new Error('invalid sdKey: must be a non-empty string');
    err.code = 'INVALID_SD_KEY';
    throw err;
  }
  if (!SD_KEY_PATTERN.test(sdKey)) {
    const err = new Error(
      `invalid sdKey: "${sdKey}" contains disallowed characters. ` +
      'Only alphanumeric, hyphens, and underscores are allowed (max 128 chars).'
    );
    err.code = 'INVALID_SD_KEY';
    throw err;
  }
}

/**
 * Get the repository root (where .git lives)
 * @returns {string} Absolute path to repo root
 */
export function getRepoRoot() {
  return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
}

/**
 * Get the worktrees directory path
 * @param {string} [repoRoot] - Optional repo root override
 * @returns {string} Absolute path to .worktrees/
 */
export function getWorktreesDir(repoRoot) {
  const root = repoRoot || getRepoRoot();
  return path.join(root, WORKTREES_DIR);
}

/**
 * @deprecated Use getWorktreesDir instead
 */
export function getSessionsDir(repoRoot) {
  return getWorktreesDir(repoRoot);
}

/**
 * Create a git worktree keyed by SD.
 *
 * @param {Object} options
 * @param {string} [options.sdKey] - SD key (primary, used as directory name under .worktrees/)
 * @param {string} [options.session] - DEPRECATED: Session name. Maps to sdKey='session-<sanitized>'.
 * @param {string} options.branch - Branch to check out in the worktree
 * @param {boolean} [options.force=false] - Force recreate if exists with different branch
 * @returns {{ path: string, branch: string, sdKey: string, created: boolean, reused: boolean }}
 */
export function createWorktree({ sdKey, session, branch, force = false }) {
  // Resolve sdKey: explicit sdKey wins, then legacy session adapter
  const resolvedKey = resolveSdKey(sdKey, session);
  validateSdKey(resolvedKey);

  const repoRoot = getRepoRoot();
  const worktreesDir = getWorktreesDir(repoRoot);
  const worktreePath = path.join(worktreesDir, resolvedKey);

  // Ensure .worktrees/ directory exists
  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true });
  }

  // Check if worktree already exists
  if (fs.existsSync(worktreePath)) {
    const existingBranch = getWorktreeBranch(worktreePath);

    if (existingBranch === branch) {
      return { path: worktreePath, branch, sdKey: resolvedKey, created: false, reused: true };
    }

    if (!force) {
      throw new Error(
        `Worktree '${resolvedKey}' already exists on branch '${existingBranch}'. ` +
        `Expected '${branch}'. Use --force to recreate or choose a different sdKey.`
      );
    }

    removeWorktree(resolvedKey);
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
    execSync(`git worktree add -b "${branch}" "${worktreePath}"`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe'
    });
  }

  // Write .worktree.json metadata
  const worktreeConfig = {
    sdKey: resolvedKey,
    expectedBranch: branch,
    createdAt: new Date().toISOString(),
    hostname: os.hostname(),
    repoRoot
  };
  fs.writeFileSync(
    path.join(worktreePath, '.worktree.json'),
    JSON.stringify(worktreeConfig, null, 2)
  );

  return { path: worktreePath, branch, sdKey: resolvedKey, created: true, reused: false };
}

/**
 * Create a worktree for any work type (SD, QF, or ADHOC).
 * Returns a structured result with fallback semantics.
 *
 * @param {Object} options
 * @param {WorkType} options.workType - Type of work: 'SD', 'QF', or 'ADHOC'
 * @param {string} options.workKey - Identifier (SD key, QF ID, or ad-hoc token)
 * @param {string} [options.branch] - Branch name (auto-generated if not provided)
 * @param {boolean} [options.force=false] - Force recreate if exists with different branch
 * @returns {WorktreeResult}
 */
export function createWorkTypeWorktree({ workType, workKey, branch, force = false }) {
  if (!['SD', 'QF', 'ADHOC'].includes(workType)) {
    throw new Error(`Invalid workType: ${workType}. Must be SD, QF, or ADHOC`);
  }
  if (!workKey || typeof workKey !== 'string') {
    throw new Error('workKey must be a non-empty string');
  }

  const startTime = Date.now();
  const sanitizedKey = workKey.replace(/[^a-zA-Z0-9_-]/g, '-').substring(0, 128);

  // Auto-generate branch if not provided
  const resolvedBranch = branch || generateBranchName(workType, sanitizedKey);

  // Determine worktree subdirectory based on work type
  const subDir = workType.toLowerCase(); // sd, qf, or adhoc
  const repoRoot = getRepoRoot();
  const worktreesDir = getWorktreesDir(repoRoot);
  const worktreeDir = path.join(worktreesDir, subDir);
  const worktreePath = path.join(worktreeDir, sanitizedKey);

  // For SD type, also check legacy flat layout (.worktrees/<sdKey>/)
  if (workType === 'SD') {
    const legacyPath = path.join(worktreesDir, sanitizedKey);
    if (fs.existsSync(legacyPath) && !fs.existsSync(worktreePath)) {
      // Legacy worktree exists - reuse it
      const existingBranch = safeGetWorktreeBranch(legacyPath);
      logWorktreeEvent('worktree.reuse_legacy', { workType, workKey: sanitizedKey, path: legacyPath, durationMs: Date.now() - startTime });
      return {
        mode: 'worktree',
        path: legacyPath,
        branch: existingBranch || resolvedBranch,
        workType,
        workKey: sanitizedKey,
        created: false,
        reused: true
      };
    }
  }

  try {
    // Ensure subdirectory exists
    if (!fs.existsSync(worktreeDir)) {
      fs.mkdirSync(worktreeDir, { recursive: true });
    }

    // Check if worktree already exists
    if (fs.existsSync(worktreePath)) {
      const existingBranch = safeGetWorktreeBranch(worktreePath);

      if (!existingBranch) {
        // Invalid worktree - return fallback
        logWorktreeEvent('worktree.invalid', { workType, workKey: sanitizedKey, reason: 'cannot-resolve-HEAD', durationMs: Date.now() - startTime });
        return {
          mode: 'main-fallback',
          path: repoRoot,
          branch: resolvedBranch,
          workType,
          workKey: sanitizedKey,
          reason: 'invalid-worktree'
        };
      }

      if (existingBranch === resolvedBranch || !force) {
        logWorktreeEvent('worktree.reuse', { workType, workKey: sanitizedKey, mode: 'worktree', durationMs: Date.now() - startTime });
        return {
          mode: 'worktree',
          path: worktreePath,
          branch: existingBranch,
          workType,
          workKey: sanitizedKey,
          created: false,
          reused: true
        };
      }

      // Force recreate
      removeWorktree(path.relative(worktreesDir, worktreePath).replace(/\\/g, '/'));
    }

    // Create worktree
    const branchExists = branchExistsLocally(resolvedBranch) || branchExistsRemotely(resolvedBranch);

    if (branchExists) {
      execSync(`git worktree add "${worktreePath}" "${resolvedBranch}"`, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: 'pipe'
      });
    } else {
      execSync(`git worktree add -b "${resolvedBranch}" "${worktreePath}"`, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: 'pipe'
      });
    }

    // Write metadata file
    const metadataFile = path.join(worktreePath, '.ehg-session.json');
    fs.writeFileSync(metadataFile, JSON.stringify({
      workType,
      workKey: sanitizedKey,
      expectedBranch: resolvedBranch,
      createdAt: new Date().toISOString(),
      hostname: os.hostname()
    }, null, 2));

    // Also write .worktree.json for backward compatibility
    fs.writeFileSync(path.join(worktreePath, '.worktree.json'), JSON.stringify({
      sdKey: sanitizedKey,
      workType,
      workKey: sanitizedKey,
      expectedBranch: resolvedBranch,
      createdAt: new Date().toISOString(),
      hostname: os.hostname(),
      repoRoot
    }, null, 2));

    logWorktreeEvent('worktree.create', { workType, workKey: sanitizedKey, mode: 'worktree', durationMs: Date.now() - startTime });

    return {
      mode: 'worktree',
      path: worktreePath,
      branch: resolvedBranch,
      workType,
      workKey: sanitizedKey,
      created: true,
      reused: false
    };
  } catch (err) {
    logWorktreeEvent('worktree.fallback', { workType, workKey: sanitizedKey, mode: 'main-fallback', reason: err.message, durationMs: Date.now() - startTime });

    return {
      mode: 'main-fallback',
      path: repoRoot,
      branch: resolvedBranch,
      workType,
      workKey: sanitizedKey,
      reason: err.message
    };
  }
}

/**
 * Generate a branch name based on work type and key.
 * @param {WorkType} workType
 * @param {string} workKey
 * @returns {string}
 */
function generateBranchName(workType, workKey) {
  switch (workType) {
    case 'SD': return `feat/${workKey}`;
    case 'QF': return `qf/${workKey}`;
    case 'ADHOC': return `adhoc/${workKey}`;
    default: return `work/${workKey}`;
  }
}

/**
 * Safely get a worktree's current branch without throwing.
 * @param {string} worktreePath
 * @returns {string|null}
 */
function safeGetWorktreeBranch(worktreePath) {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: worktreePath,
      encoding: 'utf8',
      stdio: 'pipe'
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Emit a single-line JSON log for worktree operations.
 * @param {string} event
 * @param {Object} fields
 */
function logWorktreeEvent(event, fields = {}) {
  const entry = { event, timestamp: new Date().toISOString(), ...fields };
  console.error(JSON.stringify(entry));
}

/**
 * Symlink or junction node_modules into a worktree
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
 * Remove an SD worktree and deregister it from git.
 *
 * @param {string} sdKey - SD key identifying the worktree
 */
export function removeWorktree(sdKey) {
  const repoRoot = getRepoRoot();
  const worktreePath = path.join(getWorktreesDir(repoRoot), sdKey);

  if (!fs.existsSync(worktreePath)) {
    return; // Already gone - idempotent
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
    try {
      execSync('git worktree prune', { cwd: repoRoot, stdio: 'pipe' });
    } catch {
      // Best effort
    }
  }
}

/**
 * Clean up an SD worktree on SD completion.
 * Aborts if uncommitted changes exist unless force is true.
 *
 * @param {string} sdKey - SD key identifying the worktree
 * @param {Object} [options]
 * @param {boolean} [options.force=false] - Force cleanup even with dirty worktree
 * @returns {{ cleaned: boolean, reason: string }}
 */
export function cleanupWorktree(sdKey, { force = false } = {}) {
  validateSdKey(sdKey);
  const repoRoot = getRepoRoot();
  const worktreePath = path.join(getWorktreesDir(repoRoot), sdKey);

  if (!fs.existsSync(worktreePath)) {
    return { cleaned: false, reason: 'worktree_not_found' };
  }

  // Check for uncommitted changes
  if (!force) {
    try {
      const status = execSync('git status --porcelain', {
        cwd: worktreePath,
        encoding: 'utf8',
        stdio: 'pipe'
      }).trim();

      if (status.length > 0) {
        console.warn(`[worktree-manager] Cleanup aborted for ${sdKey}: uncommitted changes detected`);
        return { cleaned: false, reason: 'dirty_worktree' };
      }
    } catch {
      // If git status fails, the worktree may be corrupt - proceed with cleanup
    }
  }

  console.info(`[worktree-manager] Cleanup started for sdKey=${sdKey}`);
  removeWorktree(sdKey);

  // Verify removal
  const porcelain = execSync('git worktree list --porcelain', {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe'
  });
  const stillExists = porcelain.includes(worktreePath);

  if (stillExists) {
    console.warn(`[worktree-manager] Worktree ${sdKey} still listed after removal`);
    return { cleaned: false, reason: 'removal_incomplete' };
  }

  return { cleaned: true, reason: 'success' };
}

/**
 * List all active SD worktrees.
 *
 * @returns {Array<{ sdKey: string, path: string, branch: string, exists: boolean }>}
 */
export function listWorktrees() {
  const repoRoot = getRepoRoot();
  const worktreesDir = getWorktreesDir(repoRoot);

  if (!fs.existsSync(worktreesDir)) {
    return [];
  }

  const entries = fs.readdirSync(worktreesDir, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => {
      const wtPath = path.join(worktreesDir, e.name);
      const configPath = path.join(wtPath, '.worktree.json');
      // Also check legacy .session.json
      const legacyConfigPath = path.join(wtPath, '.session.json');
      let branch = null;
      let exists = true;

      // Try .worktree.json first, then legacy .session.json
      for (const cfgPath of [configPath, legacyConfigPath]) {
        if (branch) break;
        if (fs.existsSync(cfgPath)) {
          try {
            const config = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
            branch = config.expectedBranch;
          } catch {
            // Fall through
          }
        }
      }

      // Validate it's a real worktree
      try {
        branch = branch || getWorktreeBranch(wtPath);
      } catch {
        exists = false;
      }

      return {
        sdKey: e.name,
        path: wtPath,
        branch: branch || 'unknown',
        exists
      };
    });
}

/**
 * Resolve expected branch for a working directory.
 * Used by branch guard to determine what branch a worktree should be on.
 *
 * Resolution order:
 * 1. .worktree.json in the worktree
 * 2. .session.json in the worktree (legacy)
 * 3. v_active_sessions lookup (if supabase provided)
 * 4. null (cannot determine)
 *
 * @param {string} workdir - Working directory to check
 * @param {Object} [supabase] - Optional Supabase client for v_active_sessions lookup
 * @returns {Promise<string|null>} Expected branch name or null
 */
export async function resolveExpectedBranch(workdir, supabase) {
  // 1. Check .worktree.json, then legacy .session.json
  for (const filename of ['.worktree.json', '.session.json']) {
    const configPath = path.join(workdir, filename);
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.expectedBranch) return config.expectedBranch;
      } catch {
        // Fall through
      }
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
      // DB unavailable - fail-open
    }
  }

  return null;
}

// ── Internal helpers ──

/**
 * Resolve sdKey from explicit value or legacy session adapter.
 * sdKey always wins over session.
 */
function resolveSdKey(sdKey, session) {
  if (sdKey) return sdKey;

  if (session) {
    if (!_deprecationWarningEmitted) {
      console.warn(
        '[worktree-manager] WARNING: session-keyed worktrees are deprecated. ' +
        "Use '--sd-key' instead of '--session'."
      );
      _deprecationWarningEmitted = true;
    }
    // Deterministic mapping: sanitize session name
    const sanitized = session.replace(/[^a-zA-Z0-9_-]/g, '-').substring(0, 120);
    return `session-${sanitized}`;
  }

  const err = new Error('Either sdKey or session must be provided');
  err.code = 'INVALID_SD_KEY';
  throw err;
}

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

/**
 * Reset deprecation warning state (for testing).
 * @internal
 */
export function _resetDeprecationWarning() {
  _deprecationWarningEmitted = false;
}
