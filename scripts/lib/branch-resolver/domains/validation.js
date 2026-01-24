/**
 * Branch Validation Domain
 * Handles branch existence and content validation in git
 *
 * @module branch-resolver/domains/validation
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
 * Validate a branch exists in git
 * @param {string} repoPath - Path to the repository
 * @param {string} branchName - Branch name to validate
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Object} Validation result with exists flag and metadata
 */
export function validateBranchExists(repoPath, branchName, verbose = false) {
  const _log = verbose ? console.log.bind(console) : () => {};
  const normalizedPath = normalizePath(repoPath);

  try {
    // Try local branch first
    const localCheck = execSync(
      `git -C "${normalizedPath}" rev-parse --verify "${branchName}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();

    if (localCheck) {
      const lastCommit = execSync(
        `git -C "${normalizedPath}" log -1 --format="%ci" "${branchName}"`,
        { encoding: 'utf-8' }
      ).trim();

      return {
        exists: true,
        commitHash: localCheck,
        lastCommitDate: lastCommit,
        isLocal: true
      };
    }
  } catch (_e) {
    // Local branch doesn't exist, try remote
  }

  try {
    // Try remote branch
    const remoteCheck = execSync(
      `git -C "${normalizedPath}" rev-parse --verify "origin/${branchName}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();

    if (remoteCheck) {
      const lastCommit = execSync(
        `git -C "${normalizedPath}" log -1 --format="%ci" "origin/${branchName}"`,
        { encoding: 'utf-8' }
      ).trim();

      return {
        exists: true,
        commitHash: remoteCheck,
        lastCommitDate: lastCommit,
        isLocal: false,
        isRemote: true
      };
    }
  } catch (_e) {
    // Remote branch doesn't exist either
  }

  return { exists: false };
}

/**
 * Validate branch has expected content (tests, implementation files)
 * @param {string} repoPath - Path to the repository
 * @param {string} branch - Branch name to validate
 * @param {string} sdId - Strategic Directive ID for SD-specific checks
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Object} Content validation result
 */
export function validateBranchContent(repoPath, branch, sdId, verbose = false) {
  const log = verbose ? console.log.bind(console) : () => {};
  const normalizedPath = normalizePath(repoPath);

  const result = {
    hasTests: false,
    hasImplementation: false,
    testFiles: [],
    implementationFiles: [],
    warnings: []
  };

  try {
    // Get all files from branch
    const allFiles = execSync(
      `git -C "${normalizedPath}" ls-tree -r --name-only "${branch}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();

    if (allFiles) {
      const fileList = allFiles.split('\n').filter(f => f);

      // Filter test files using JavaScript regex
      result.testFiles = fileList
        .filter(f => /\.(spec|test)\.(ts|tsx|js)$/.test(f))
        .slice(0, 20);
      result.hasTests = result.testFiles.length > 0;

      // Filter implementation files using JavaScript regex
      result.implementationFiles = fileList
        .filter(f => /^src\/.*\.(ts|tsx)$/.test(f))
        .slice(0, 50);
      result.hasImplementation = result.implementationFiles.length > 0;
    }

    // Check for SD-specific files
    const sdIdLower = sdId.toLowerCase();
    const sdSpecificTests = result.testFiles.filter(f =>
      f.toLowerCase().includes(sdIdLower) ||
      f.toLowerCase().includes(sdIdLower.replace('sd-', ''))
    );

    result.sdSpecificTests = sdSpecificTests;

    if (!result.hasTests) {
      result.warnings.push('No test files found on branch');
    }

    if (sdSpecificTests.length === 0 && result.hasTests) {
      result.warnings.push(`Test files exist but none match SD ID pattern: ${sdId}`);
    }

    log('   Content validation:');
    log(`     Test files: ${result.testFiles.length}`);
    log(`     Implementation files: ${result.implementationFiles.length}`);
    log(`     SD-specific tests: ${sdSpecificTests.length}`);

  } catch (error) {
    result.error = error.message;
  }

  return result;
}

export default {
  validateBranchExists,
  validateBranchContent
};
