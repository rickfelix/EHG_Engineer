/**
 * File Operations Domain
 * Handles git file operations without checkout
 *
 * @module branch-resolver/domains/file-operations
 */

import { execSync } from 'child_process';

/**
 * Normalize path for cross-platform git compatibility
 * @param {string} inputPath - Path to normalize
 * @returns {string} Normalized path with forward slashes
 */
function normalizePath(inputPath) {
  return inputPath.replace(/\\/g, '/');
}

/**
 * Read a file from a specific branch without checking it out
 *
 * @param {string} repoPath - Path to repository
 * @param {string} branch - Branch name
 * @param {string} filePath - Path to file within repo
 * @returns {Object} File content result
 */
export function readFileFromBranch(repoPath, branch, filePath) {
  const result = {
    success: false,
    content: null,
    error: null
  };

  try {
    const normalizedPath = normalizePath(repoPath);
    const content = execSync(
      `git -C "${normalizedPath}" show "${branch}:${filePath}"`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] }
    );

    result.success = true;
    result.content = content;

  } catch (error) {
    result.error = `File not found on branch: ${filePath}`;
  }

  return result;
}

/**
 * List files matching pattern from a specific branch
 *
 * @param {string} repoPath - Path to repository
 * @param {string} branch - Branch name
 * @param {string} pattern - Grep pattern for file paths
 * @returns {Array<string>} Matching file paths
 */
export function listFilesFromBranch(repoPath, branch, pattern) {
  try {
    const normalizedPath = normalizePath(repoPath);
    const allFiles = execSync(
      `git -C "${normalizedPath}" ls-tree -r --name-only "${branch}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();

    if (!allFiles) return [];

    // Filter files using JavaScript regex
    const regex = new RegExp(pattern);
    return allFiles.split('\n').filter(f => f && regex.test(f));

  } catch (error) {
    return [];
  }
}

/**
 * Check if a file exists on a specific branch
 * @param {string} repoPath - Path to repository
 * @param {string} branch - Branch name
 * @param {string} filePath - Path to file within repo
 * @returns {boolean} True if file exists
 */
export function fileExistsOnBranch(repoPath, branch, filePath) {
  try {
    const normalizedPath = normalizePath(repoPath);
    execSync(
      `git -C "${normalizedPath}" cat-file -e "${branch}:${filePath}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    return true;
  } catch {
    return false;
  }
}

export default {
  readFileFromBranch,
  listFilesFromBranch,
  fileExistsOnBranch
};
