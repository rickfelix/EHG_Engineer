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
import { existsSync } from 'node:fs';
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
