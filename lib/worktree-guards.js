/**
 * Worktree Safety Guards
 * SD: SD-LEO-INFRA-AUTO-WORKTREE-START-001
 *
 * Utilities for safe worktree lifecycle management:
 * - sanitizeBranchName: reject unsafe characters before git worktree add
 * - checkDirtyWorktree: abort cleanup if uncommitted changes exist
 * - verifyGitignore: confirm .env is ignored in new worktrees
 */

import { execSync } from 'node:child_process';
import { existsSync, openSync, writeSync, closeSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const SAFE_BRANCH_PATTERN = /^[A-Za-z0-9/_.-]+$/;

/**
 * Sanitize a branch name for safe use with git worktree add.
 * Rejects names with shell metacharacters, path traversal, or whitespace.
 *
 * @param {string} name - Raw branch name (e.g., "feat/SD-FOO-001")
 * @returns {{ safe: boolean, sanitized: string, reason?: string }}
 */
export function sanitizeBranchName(name) {
  if (!name || typeof name !== 'string') {
    return { safe: false, sanitized: '', reason: 'Branch name is empty or not a string' };
  }
  const trimmed = name.trim();
  if (!SAFE_BRANCH_PATTERN.test(trimmed)) {
    return { safe: false, sanitized: trimmed, reason: `Branch name contains unsafe characters: ${trimmed}` };
  }
  if (trimmed.includes('..')) {
    return { safe: false, sanitized: trimmed, reason: 'Branch name contains path traversal (..)' };
  }
  return { safe: true, sanitized: trimmed };
}

/**
 * Check if a worktree has uncommitted changes (dirty working tree).
 * Used as a guard before cleanup/recreation to prevent data loss.
 *
 * @param {string} worktreePath - Absolute path to the worktree directory
 * @returns {{ dirty: boolean, changes?: string }}
 */
export function checkDirtyWorktree(worktreePath) {
  if (!existsSync(worktreePath)) {
    return { dirty: false };
  }
  try {
    const status = execSync('git status --porcelain', {
      cwd: worktreePath, encoding: 'utf8', stdio: 'pipe'
    }).trim();
    if (status) {
      return { dirty: true, changes: status };
    }
    return { dirty: false };
  } catch {
    // If git status fails (e.g., not a git dir), treat as not dirty
    return { dirty: false };
  }
}

/**
 * Verify that .env is in the worktree's effective .gitignore.
 * Prevents accidental commit of secrets in new worktrees.
 *
 * @param {string} worktreePath - Absolute path to the worktree directory
 * @returns {{ ignored: boolean, reason?: string }}
 */
export function verifyGitignore(worktreePath) {
  if (!existsSync(worktreePath)) {
    return { ignored: false, reason: 'Worktree path does not exist' };
  }
  const envPath = join(worktreePath, '.env');
  try {
    execSync(`git check-ignore -q "${envPath}"`, {
      cwd: worktreePath, stdio: 'pipe'
    });
    return { ignored: true };
  } catch {
    // Exit code 1 = not ignored, exit code 128 = not in git repo
    return { ignored: false, reason: '.env is not in .gitignore — secrets may be committed' };
  }
}

/**
 * Check if a lock file's owner process is still alive.
 * @param {{ pid: number, sessionId: string, timestamp: string }} lockContent
 * @returns {boolean} true if the lock is stale (owner is dead)
 */
export function isLockStale(lockContent) {
  if (!lockContent || typeof lockContent.pid !== 'number') return true;
  try {
    process.kill(lockContent.pid, 0); // Signal 0 = existence check only
    return false; // Process is alive — lock is held
  } catch (err) {
    if (err.code === 'ESRCH') return true; // No such process — stale
    if (err.code === 'EPERM') return false; // Alive but no permission
    // Fallback: treat as stale if lock is older than 1 hour
    const age = Date.now() - new Date(lockContent.timestamp).getTime();
    return age > 3600000;
  }
}

/**
 * Acquire an exclusive worktree lock for an SD key.
 * Uses fs.openSync with 'wx' flag for atomic creation on NTFS.
 * @param {string} sdKey - The SD key to lock
 * @param {string} sessionId - Current session identifier
 * @param {string} worktreesDir - Absolute path to .worktrees/ directory
 * @returns {string} The lock file path (for releaseLock)
 * @throws {Error} If lock is held by a live process or on EBUSY
 */
export function acquireWorktreeLock(sdKey, sessionId, worktreesDir) {
  const lockPath = join(worktreesDir, `${sdKey}.lock`);
  const content = JSON.stringify({ pid: process.pid, sessionId, timestamp: new Date().toISOString() });
  try {
    const fd = openSync(lockPath, 'wx');
    writeSync(fd, content);
    closeSync(fd);
    return lockPath;
  } catch (err) {
    if (err.code === 'EEXIST') {
      // Lock exists — check if stale
      try {
        const existing = JSON.parse(readFileSync(lockPath, 'utf8'));
        if (isLockStale(existing)) {
          unlinkSync(lockPath);
          // Retry once
          const fd = openSync(lockPath, 'wx');
          writeSync(fd, content);
          closeSync(fd);
          return lockPath;
        }
        throw new Error(`Worktree lock held by session ${existing.sessionId} (PID ${existing.pid}, since ${existing.timestamp})`);
      } catch (readErr) {
        if (readErr.message.startsWith('Worktree lock held')) throw readErr;
        // Lock file unreadable — treat as stale, remove and retry
        try { unlinkSync(lockPath); } catch { /* ignore */ }
        const fd = openSync(lockPath, 'wx');
        writeSync(fd, content);
        closeSync(fd);
        return lockPath;
      }
    }
    // EBUSY or other — hard error
    throw new Error(`Worktree lock failed (${err.code}): ${err.message}`);
  }
}

/**
 * Release a worktree lock. Safe to call even if lock doesn't exist.
 * @param {string} lockPath - Path to the lock file
 */
export function releaseLock(lockPath) {
  try {
    unlinkSync(lockPath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`Warning: Failed to release lock ${lockPath}: ${err.message}`);
    }
  }
}
