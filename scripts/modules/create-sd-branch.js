/**
 * SD Branch Creation Module
 * Creates and manages feature branches for Strategic Directives
 */

import { execSync } from 'child_process';
import path from 'path';

/**
 * Generate a branch name from SD ID and title
 * @param {string} sdId - SD identifier
 * @param {string} title - SD title
 * @returns {string} Generated branch name
 */
export function generateBranchName(sdId, title) {
  const sanitizedTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  return `feat/${sdId}-${sanitizedTitle}`;
}

/**
 * Check if a branch exists locally or remotely
 * @param {string} branchName - Branch name to check
 * @param {string} repoPath - Path to repository
 * @returns {boolean} True if branch exists
 */
export function branchExists(branchName, repoPath = process.cwd()) {
  try {
    // Check local branches
    const localBranches = execSync('git branch --list', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    if (localBranches.includes(branchName)) {
      return true;
    }

    // Check remote branches
    const remoteBranches = execSync('git branch -r --list', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    return remoteBranches.includes(branchName);
  } catch {
    return false;
  }
}

/**
 * Create a new branch for an SD
 * @param {string} sdId - SD identifier
 * @param {string} title - SD title
 * @param {string} repoPath - Path to repository
 * @returns {Object} Result with branch name and status
 */
export function createSDBranch(sdId, title, repoPath = process.cwd()) {
  const branchName = generateBranchName(sdId, title);

  // Check if branch already exists
  if (branchExists(branchName, repoPath)) {
    return {
      success: true,
      branch: branchName,
      created: false,
      message: `Branch ${branchName} already exists`
    };
  }

  try {
    // Create and checkout new branch from main
    execSync(`git checkout -b ${branchName} main`, {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    return {
      success: true,
      branch: branchName,
      created: true,
      message: `Created branch ${branchName}`
    };
  } catch (err) {
    return {
      success: false,
      branch: branchName,
      created: false,
      message: `Failed to create branch: ${err.message}`
    };
  }
}

export default {
  generateBranchName,
  branchExists,
  createSDBranch
};
