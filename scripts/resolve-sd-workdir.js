#!/usr/bin/env node
/**
 * resolve-sd-workdir.js - Single source of truth for SD working directory resolution
 *
 * SD-LEO-INFRA-UNIFIED-WORKTREE-LIFECYCLE-001 (FR-1)
 *
 * Determines whether an SD has an existing git worktree, optionally creates one,
 * and outputs a machine-readable JSON result. Used by /leo start, sd:start, and /ship.
 *
 * Usage:
 *   node scripts/resolve-sd-workdir.js --sdKey SD-XXX-001 [--mode claim|ship] [--repoRoot /path] [--output json]
 *
 * Modes:
 *   claim - Used by /leo start and sd:start. Creates worktree if none exists.
 *   ship  - Used by /ship. Read-only resolution, never creates worktrees.
 *
 * Exit codes:
 *   0 - Success (JSON result on stdout)
 *   1 - Error (JSON error on stderr)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const WORKTREES_DIR = '.worktrees';

/**
 * @typedef {Object} ResolveResult
 * @property {string} sdKey
 * @property {string} cwd - Absolute path to the working directory
 * @property {'db'|'scan'|'created'|'legacy'} source - How the worktree was found
 * @property {boolean} success
 * @property {{ exists: boolean, created?: boolean, path?: string, branch?: string }} worktree
 * @property {string} [sessionId]
 * @property {string} [errorCode]
 * @property {string} [error]
 */

function getRepoRoot(override) {
  if (override) return override;
  let toplevel = execSync('git rev-parse --show-toplevel', { encoding: 'utf8', stdio: 'pipe' }).trim();
  // If running inside a worktree, navigate up to the main repo root.
  // Worktree paths contain .worktrees/ (e.g., /repo/.worktrees/SD-XXX/),
  // so git show-toplevel returns the worktree root, not the main repo.
  const wtIdx = toplevel.replace(/\\/g, '/').indexOf('/' + WORKTREES_DIR + '/');
  if (wtIdx >= 0) {
    toplevel = toplevel.substring(0, wtIdx);
  }
  return toplevel;
}

function isValidWorktree(wtPath) {
  if (!fs.existsSync(wtPath)) return false;
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: wtPath, encoding: 'utf8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function getWorktreeBranch(wtPath) {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: wtPath, encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    return null;
  }
}

function validateSdKey(sdKey) {
  if (!sdKey || typeof sdKey !== 'string') return false;
  return /^[a-zA-Z0-9_-]{1,128}$/.test(sdKey);
}

function validateWorktreePath(wtPath, repoRoot) {
  const resolved = path.resolve(wtPath);
  const resolvedRoot = path.resolve(repoRoot);
  // Must be under repo root's .worktrees/ directory
  if (!resolved.startsWith(path.join(resolvedRoot, WORKTREES_DIR))) {
    return false;
  }
  // Reject obviously dangerous paths
  if (resolved === '/' || resolved === 'C:\\' || resolved === resolvedRoot) {
    return false;
  }
  return true;
}

/**
 * Try to resolve worktree from database (claude_sessions.worktree_path)
 */
async function resolveFromDB(sdKey) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data } = await supabase
      .from('claude_sessions')
      .select('worktree_path, session_id')
      .eq('sd_id', sdKey)
      .eq('status', 'active')
      .order('heartbeat_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.worktree_path && fs.existsSync(data.worktree_path)) {
      return { path: data.worktree_path, sessionId: data.session_id };
    }
  } catch {
    // DB unavailable - fall through to scan
  }
  return null;
}

/**
 * Scan .worktrees/ directory for existing worktree matching sdKey
 */
function resolveFromScan(sdKey, repoRoot) {
  const worktreesDir = path.join(repoRoot, WORKTREES_DIR);

  // Check legacy flat layout: .worktrees/<sdKey>/
  const legacyPath = path.join(worktreesDir, sdKey);
  if (isValidWorktree(legacyPath)) {
    return { path: legacyPath, layout: 'legacy' };
  }

  // Check new layout: .worktrees/sd/<sdKey>/
  const newPath = path.join(worktreesDir, 'sd', sdKey);
  if (isValidWorktree(newPath)) {
    return { path: newPath, layout: 'typed' };
  }

  return null;
}

/**
 * Create a new worktree for the SD
 */
function createWorktree(sdKey, repoRoot) {
  const worktreesDir = path.join(repoRoot, WORKTREES_DIR);
  const worktreePath = path.join(worktreesDir, sdKey);

  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true });
  }

  // Look for an existing feature branch
  const _branchPrefix = `feat/${sdKey}`;
  let branch = null;

  try {
    const branches = execSync('git branch --list "feat/' + sdKey + '*"', {
      cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
    }).trim();
    if (branches) {
      branch = branches.split('\n')[0].replace(/^\*?\s*/, '').trim();
    }
  } catch { /* no match */ }

  if (!branch) {
    // Check remote
    try {
      const remote = execSync('git ls-remote --heads origin "feat/' + sdKey + '*"', {
        cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
      }).trim();
      if (remote) {
        branch = remote.split('\n')[0].split('\t')[1].replace('refs/heads/', '');
      }
    } catch { /* no match */ }
  }

  if (!branch) {
    branch = `feat/${sdKey}`;
  }

  // Create the worktree
  const branchExists = (() => {
    try {
      execSync(`git show-ref --verify --quiet refs/heads/${branch}`, { cwd: repoRoot, stdio: 'pipe' });
      return true;
    } catch { return false; }
  })();

  if (branchExists) {
    execSync(`git worktree add "${worktreePath}" "${branch}"`, {
      cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
    });
  } else {
    execSync(`git worktree add -b "${branch}" "${worktreePath}"`, {
      cwd: repoRoot, encoding: 'utf8', stdio: 'pipe'
    });
  }

  // Write metadata
  fs.writeFileSync(path.join(worktreePath, '.worktree.json'), JSON.stringify({
    sdKey,
    expectedBranch: branch,
    createdAt: new Date().toISOString(),
    repoRoot
  }, null, 2));

  ensureWorktreeEssentials(worktreePath, repoRoot);

  return { path: worktreePath, branch, created: true };
}

/**
 * Ensure worktree has essential untracked files (node_modules symlink, .env copy).
 * Runs after EVERY successful resolution — not just creation — so previously
 * created worktrees also get patched up.
 */
function ensureWorktreeEssentials(worktreePath, repoRoot) {
  // Symlink node_modules (avoids duplicating ~500MB)
  const sourceModules = path.join(repoRoot, 'node_modules');
  const targetModules = path.join(worktreePath, 'node_modules');
  if (fs.existsSync(sourceModules) && !fs.existsSync(targetModules)) {
    try {
      if (process.platform === 'win32') {
        fs.symlinkSync(sourceModules, targetModules, 'junction');
      } else {
        fs.symlinkSync(sourceModules, targetModules, 'dir');
      }
    } catch { /* best effort */ }
  }

  // Copy .env (gitignored, so never present in worktrees)
  const sourceEnv = path.join(repoRoot, '.env');
  const targetEnv = path.join(worktreePath, '.env');
  if (fs.existsSync(sourceEnv) && !fs.existsSync(targetEnv)) {
    try {
      fs.copyFileSync(sourceEnv, targetEnv);
    } catch { /* best effort */ }
  }
}

/**
 * Update claude_sessions.worktree_path for the active session
 */
async function persistWorktreePath(sdKey, worktreePath) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error } = await supabase
      .from('claude_sessions')
      .update({ worktree_path: worktreePath })
      .eq('sd_id', sdKey)
      .eq('status', 'active');

    if (error) {
      emitLog({ event: 'worktree.db_update_failed', sdKey, error: error.message, errorCode: 'DB_UPDATE_FAILED' });
    }
  } catch (err) {
    emitLog({ event: 'worktree.db_update_failed', sdKey, error: err.message, errorCode: 'DB_UPDATE_FAILED' });
  }
}

function emitLog(fields) {
  const entry = { timestamp: new Date().toISOString(), ...fields };
  console.error(JSON.stringify(entry));
}

async function resolve(sdKey, mode, repoRoot) {
  if (!validateSdKey(sdKey)) {
    return {
      sdKey, cwd: repoRoot, source: 'legacy', success: false,
      worktree: { exists: false },
      errorCode: 'INVALID_SD_KEY',
      error: `Invalid SD key: ${sdKey}`
    };
  }

  // 1. Try DB lookup first
  const dbResult = await resolveFromDB(sdKey);
  if (dbResult) {
    if (!isValidWorktree(dbResult.path)) {
      emitLog({ event: 'worktree.db_path_invalid', sdKey, path: dbResult.path, errorCode: 'INVALID_WORKTREE_PATH' });
      // Fall through to scan
    } else if (!validateWorktreePath(dbResult.path, repoRoot)) {
      emitLog({ event: 'worktree.db_path_rejected', sdKey, path: dbResult.path, errorCode: 'INVALID_WORKTREE_PATH' });
      return {
        sdKey, cwd: repoRoot, source: 'legacy', success: false,
        worktree: { exists: false },
        errorCode: 'INVALID_WORKTREE_PATH',
        error: `Worktree path rejected (outside repo): ${dbResult.path}`
      };
    } else {
      const branch = getWorktreeBranch(dbResult.path);
      emitLog({ event: 'worktree.resolved', sdKey, source: 'db', resolvedCwd: dbResult.path, outcome: 'success' });
      ensureWorktreeEssentials(dbResult.path, repoRoot);
      return {
        sdKey, cwd: dbResult.path, source: 'db', success: true,
        worktree: { exists: true, path: dbResult.path, branch },
        sessionId: dbResult.sessionId
      };
    }
  }

  // 2. Scan filesystem
  const scanResult = resolveFromScan(sdKey, repoRoot);
  if (scanResult) {
    const branch = getWorktreeBranch(scanResult.path);
    emitLog({ event: 'worktree.resolved', sdKey, source: 'scan', resolvedCwd: scanResult.path, outcome: 'success' });

    // Persist to DB for future lookups
    await persistWorktreePath(sdKey, scanResult.path);

    ensureWorktreeEssentials(scanResult.path, repoRoot);
    return {
      sdKey, cwd: scanResult.path, source: 'scan', success: true,
      worktree: { exists: true, path: scanResult.path, branch }
    };
  }

  // 3. No worktree found
  if (mode === 'claim') {
    // Create one
    try {
      const created = createWorktree(sdKey, repoRoot);
      emitLog({ event: 'worktree.resolved', sdKey, source: 'created', resolvedCwd: created.path, outcome: 'success' });

      // Persist to DB
      await persistWorktreePath(sdKey, created.path);

      return {
        sdKey, cwd: created.path, source: 'created', success: true,
        worktree: { exists: true, created: true, path: created.path, branch: created.branch }
      };
    } catch (err) {
      emitLog({ event: 'worktree.create_failed', sdKey, error: err.message, errorCode: 'WORKTREE_CREATE_FAILED' });
      return {
        sdKey, cwd: repoRoot, source: 'legacy', success: false,
        worktree: { exists: false },
        errorCode: 'WORKTREE_CREATE_FAILED',
        error: err.message
      };
    }
  }

  // mode=ship, no worktree found - fallback to main repo
  emitLog({ event: 'worktree.resolved', sdKey, source: 'legacy', resolvedCwd: repoRoot, outcome: 'success' });
  return {
    sdKey, cwd: repoRoot, source: 'legacy', success: true,
    worktree: { exists: false }
  };
}

async function main() {
  const args = process.argv.slice(2);
  let sdKey = null;
  let mode = 'claim';
  let repoRoot = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sdKey' && args[i + 1]) { sdKey = args[++i]; }
    else if (args[i] === '--mode' && args[i + 1]) { mode = args[++i]; }
    else if (args[i] === '--repoRoot' && args[i + 1]) { repoRoot = args[++i]; }
    else if (!args[i].startsWith('--')) { sdKey = sdKey || args[i]; }
  }

  if (!sdKey) {
    console.error(JSON.stringify({
      success: false, errorCode: 'MISSING_SD_KEY',
      error: 'Usage: resolve-sd-workdir.js --sdKey SD-XXX [--mode claim|ship] [--repoRoot /path]'
    }));
    process.exit(1);
  }

  if (!['claim', 'ship'].includes(mode)) {
    console.error(JSON.stringify({
      success: false, errorCode: 'INVALID_MODE',
      error: `Invalid mode: ${mode}. Must be 'claim' or 'ship'.`
    }));
    process.exit(1);
  }

  const resolvedRoot = getRepoRoot(repoRoot);
  const result = await resolve(sdKey, mode, resolvedRoot);

  // Output to stdout (machine-readable)
  process.stdout.write(JSON.stringify(result));

  if (!result.success) {
    process.exit(1);
  }
}

// Cross-platform entry point check
const _e = process.argv[1] || '';
const isMainScript = import.meta.url === `file://${_e}` ||
  import.meta.url === `file:///${_e.replace(/\\/g, '/')}`;

if (isMainScript) {
  main().catch(err => {
    console.error(JSON.stringify({
      success: false, errorCode: 'RESOLVE_FATAL',
      error: err.message, timestamp: new Date().toISOString()
    }));
    process.exit(1);
  });
}

export { resolve, resolveFromDB, resolveFromScan, validateWorktreePath };
