/**
 * Branch Discovery Domain
 * Handles git branch discovery and selection
 *
 * @module branch-resolver/domains/discovery
 */

import { execSync } from 'child_process';
import { validateBranchExists } from './validation.js';

/**
 * Normalize path for cross-platform git compatibility
 * @param {string} inputPath - Path to normalize
 * @returns {string} Normalized path with forward slashes
 */
function normalizePath(inputPath) {
  return inputPath.replace(/\\/g, '/');
}

/**
 * Discover feature branches from git that match the SD ID
 * @param {string} repoPath - Path to the repository
 * @param {string} sdId - Strategic Directive ID to search for
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Object} Discovery result with matches
 */
export function discoverBranchFromGit(repoPath, sdId, verbose = false) {
  const log = verbose ? console.log.bind(console) : () => {};
  const normalizedPath = normalizePath(repoPath);

  const result = {
    found: false,
    matches: [],
    searchedPatterns: [],
    error: null
  };

  // Fetch latest from remote first
  try {
    execSync(`git -C "${normalizedPath}" fetch --all`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
  } catch (e) {
    log(`   ⚠️ Could not fetch from remote: ${e.message}`);
  }

  // Search patterns in order of specificity
  const searchPatterns = [
    sdId,                          // Exact SD ID
    sdId.replace('SD-', ''),       // Without SD- prefix
    sdId.toLowerCase(),            // Lowercase
    sdId.replace(/-/g, ''),        // Without hyphens
  ];

  result.searchedPatterns = searchPatterns;

  // Get all branches once
  let allBranches = [];
  try {
    const branchOutput = execSync(
      `git -C "${normalizedPath}" branch -a`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();

    if (branchOutput) {
      allBranches = branchOutput
        .split('\n')
        .map(b => b.trim().replace(/^\*?\s*/, '').replace('remotes/origin/', ''))
        .filter(b => b && !b.includes('HEAD'))
        .filter((b, i, arr) => arr.indexOf(b) === i); // Dedupe
    }
  } catch (e) {
    log(`   Error getting branches: ${e.message}`);
  }

  for (const pattern of searchPatterns) {
    try {
      // Filter branches matching pattern (case-insensitive)
      const patternLower = pattern.toLowerCase();
      const branchList = allBranches.filter(b =>
        b.toLowerCase().includes(patternLower)
      );

      if (branchList.length > 0) {
        log(`   Pattern "${pattern}" matched: ${branchList.join(', ')}`);
        result.found = true;
        result.matches = branchList;
        break;
      }
    } catch (e) {
      log(`   Pattern "${pattern}" error: ${e.message}`);
    }
  }

  if (!result.found) {
    result.error = `No branches found matching SD ID: ${sdId}`;
  }

  return result;
}

/**
 * Select the best branch from multiple matches (most recent commit wins)
 * @param {string} repoPath - Path to the repository
 * @param {Array<string>} branches - Array of branch names to select from
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Object} Selected branch with metadata
 */
export function selectBestBranch(repoPath, branches, verbose = false) {
  const log = verbose ? console.log.bind(console) : () => {};

  if (branches.length === 1) {
    const validation = validateBranchExists(repoPath, branches[0], verbose);
    return {
      branch: branches[0],
      commitHash: validation.commitHash,
      lastCommitDate: validation.lastCommitDate
    };
  }

  // Multiple branches - pick most recently updated
  const branchInfo = branches.map(branch => {
    const validation = validateBranchExists(repoPath, branch, verbose);
    return {
      branch,
      commitHash: validation.commitHash,
      lastCommitDate: validation.lastCommitDate,
      timestamp: validation.lastCommitDate ? new Date(validation.lastCommitDate).getTime() : 0
    };
  });

  // Sort by timestamp descending (most recent first)
  branchInfo.sort((a, b) => b.timestamp - a.timestamp);

  log('   Multiple branches found, selected most recent:');
  branchInfo.forEach((b, i) => {
    log(`     ${i === 0 ? '→' : ' '} ${b.branch} (${b.lastCommitDate || 'unknown'})`);
  });

  return branchInfo[0];
}

export default {
  discoverBranchFromGit,
  selectBestBranch
};
