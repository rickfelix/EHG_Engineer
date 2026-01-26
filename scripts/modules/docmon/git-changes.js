/**
 * DOCMON Git Changes Resolver
 * Resolves changed documentation files using git diff
 *
 * Part of SD-LEO-INFRA-DOCMON-SUB-AGENT-001-A
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { findRepoRoot } from './config-loader.js';

/**
 * Check if git is available
 */
export function isGitAvailable() {
  try {
    execSync('git --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if we're in a git repository
 */
export function isGitRepo(dir = process.cwd()) {
  try {
    execSync('git rev-parse --git-dir', { cwd: dir, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current git user name and email
 */
export function getGitUser() {
  try {
    const name = execSync('git config user.name', { stdio: 'pipe' }).toString().trim();
    const email = execSync('git config user.email', { stdio: 'pipe' }).toString().trim();
    return { name, email, formatted: `${name} <${email}>` };
  } catch {
    return { name: null, email: null, formatted: null };
  }
}

/**
 * Get changed files relative to a base ref
 */
export function getChangedFiles(baseRef = 'origin/main', extensions = ['.md', '.mdx']) {
  const repoRoot = findRepoRoot();

  if (!isGitAvailable() || !isGitRepo(repoRoot)) {
    return {
      success: false,
      error: 'Git not available or not in a git repository',
      files: [],
      fallback: true
    };
  }

  try {
    // First try to get the merge-base
    let mergeBase;
    try {
      mergeBase = execSync(`git merge-base ${baseRef} HEAD`, {
        cwd: repoRoot,
        stdio: 'pipe'
      }).toString().trim();
    } catch {
      // If merge-base fails, try using the ref directly
      mergeBase = baseRef;
    }

    // Get changed files
    const output = execSync(`git diff --name-only ${mergeBase}`, {
      cwd: repoRoot,
      stdio: 'pipe'
    }).toString().trim();

    const allFiles = output.split('\n').filter(f => f.trim());

    // Filter by extensions
    const docFiles = allFiles.filter(f =>
      extensions.some(ext => f.toLowerCase().endsWith(ext))
    );

    // Get full paths and filter out deleted files
    const existingFiles = docFiles
      .map(f => path.join(repoRoot, f))
      .filter(f => fs.existsSync(f));

    return {
      success: true,
      files: existingFiles,
      relativeFiles: existingFiles.map(f => path.relative(repoRoot, f)),
      baseRef: mergeBase,
      totalChanged: allFiles.length,
      docFilesChanged: docFiles.length,
      fallback: false
    };
  } catch (error) {
    return {
      success: false,
      error: `Git diff failed: ${error.message}`,
      files: [],
      fallback: true
    };
  }
}

/**
 * Get staged files (for pre-commit hook)
 */
export function getStagedFiles(extensions = ['.md', '.mdx']) {
  const repoRoot = findRepoRoot();

  if (!isGitAvailable() || !isGitRepo(repoRoot)) {
    return {
      success: false,
      error: 'Git not available or not in a git repository',
      files: [],
      fallback: true
    };
  }

  try {
    const output = execSync('git diff --cached --name-only', {
      cwd: repoRoot,
      stdio: 'pipe'
    }).toString().trim();

    const allFiles = output.split('\n').filter(f => f.trim());

    // Filter by extensions
    const docFiles = allFiles.filter(f =>
      extensions.some(ext => f.toLowerCase().endsWith(ext))
    );

    // Get full paths and filter out deleted files
    const existingFiles = docFiles
      .map(f => path.join(repoRoot, f))
      .filter(f => fs.existsSync(f));

    return {
      success: true,
      files: existingFiles,
      relativeFiles: existingFiles.map(f => path.relative(repoRoot, f)),
      fallback: false
    };
  } catch (error) {
    return {
      success: false,
      error: `Git staged files check failed: ${error.message}`,
      files: [],
      fallback: true
    };
  }
}

/**
 * Check if a ref exists
 */
export function refExists(ref) {
  try {
    execSync(`git rev-parse --verify ${ref}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
