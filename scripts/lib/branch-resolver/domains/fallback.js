/**
 * Post-Merge Fallback Domain
 * Handles intelligent fallback when feature branch is merged/deleted
 *
 * @module branch-resolver/domains/fallback
 */

import { execSync } from 'child_process';
import { validateBranchContent } from './validation.js';

/**
 * Normalize path for cross-platform git compatibility
 * @param {string} inputPath - Path to normalize
 * @returns {string} Normalized path with forward slashes
 */
function normalizePath(inputPath) {
  return inputPath.replace(/\\/g, '/');
}

/**
 * Intelligent post-merge fallback check
 *
 * Determines if a feature branch was merged to main and validates
 * that the expected content exists on main before allowing fallback.
 *
 * Intelligence layers:
 * 1. SD Status Check - Is the SD marked as completed/approved/merged?
 * 2. Merge Commit Check - Can we find evidence the branch was merged?
 * 3. Content Validation - Do the expected files exist on main?
 * 4. PR Evidence - Was there a merged PR for this SD?
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - Strategic Directive record
 * @param {string} repoPath - Path to the repository
 * @param {string} sdId - Strategic Directive ID
 * @param {string} storedBranch - Previously stored branch name
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Promise<Object>} Fallback result
 */
export async function checkPostMergeFallback(supabase, sd, repoPath, sdId, storedBranch, verbose = false) {
  const log = verbose ? console.log.bind(console) : () => {};

  const result = {
    success: false,
    branch: null,
    reason: null,
    evidence: {},
    validated: false,
    shouldUpdateDb: false,
    contentValidation: null
  };

  // Layer 1: Check SD status
  log('   Checking SD status...');
  const sdStatus = sd.metadata?.status || sd.status;
  const completedStatuses = ['completed', 'approved', 'merged', 'done', 'shipped'];
  const isCompleted = completedStatuses.some(s =>
    sdStatus?.toLowerCase()?.includes(s)
  );

  result.evidence.sdStatus = sdStatus;
  result.evidence.isCompleted = isCompleted;

  // Layer 2: Check for merge evidence in git
  log('   Checking for merge evidence...');
  const mergeEvidence = checkMergeEvidence(repoPath, sdId, storedBranch, verbose);
  result.evidence.merge = mergeEvidence;

  // Layer 3: Check for PR merge (if we have a stored branch)
  if (storedBranch) {
    log('   Checking for PR merge evidence...');
    const prEvidence = await checkPRMergeEvidence(repoPath, storedBranch, sdId, verbose);
    result.evidence.pr = prEvidence;
  }

  // Decision logic - require at least one strong signal
  const hasStrongSignal =
    isCompleted ||
    mergeEvidence.foundMergeCommit ||
    mergeEvidence.branchInMainHistory ||
    result.evidence.pr?.merged;

  if (!hasStrongSignal) {
    result.reason = 'No evidence of merge - SD not completed and no merge commits found';
    log(`   ❌ ${result.reason}`);
    return result;
  }

  // Layer 4: Validate content exists on main
  log('   Validating content on main...');
  const contentValidation = validateBranchContent(repoPath, 'main', sdId, verbose);
  result.contentValidation = contentValidation;

  // For fallback to succeed, we need SOME relevant content on main
  const hasRelevantContent =
    contentValidation.hasTests ||
    contentValidation.hasImplementation ||
    contentValidation.sdSpecificTests?.length > 0;

  if (!hasRelevantContent) {
    result.reason = 'Main branch has no relevant content for this SD';
    log(`   ❌ ${result.reason}`);
    return result;
  }

  // Success - we have evidence of merge AND content on main
  result.success = true;
  result.branch = 'main';
  result.validated = true;
  result.shouldUpdateDb = storedBranch ? true : false;

  // Determine the specific reason for logging
  if (mergeEvidence.foundMergeCommit) {
    result.reason = `Found merge commit: ${mergeEvidence.mergeCommitShort}`;
  } else if (result.evidence.pr?.merged) {
    result.reason = `PR was merged: ${result.evidence.pr.prNumber}`;
  } else if (isCompleted) {
    result.reason = `SD status is ${sdStatus} and content exists on main`;
  } else if (mergeEvidence.branchInMainHistory) {
    result.reason = 'Branch commits found in main history';
  }

  return result;
}

/**
 * Check for merge evidence in git history
 * @param {string} repoPath - Path to the repository
 * @param {string} sdId - Strategic Directive ID
 * @param {string} storedBranch - Previously stored branch name
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Object} Merge evidence result
 */
export function checkMergeEvidence(repoPath, sdId, storedBranch, verbose = false) {
  const log = verbose ? console.log.bind(console) : () => {};
  const normalizedPath = normalizePath(repoPath);

  const result = {
    foundMergeCommit: false,
    mergeCommitHash: null,
    mergeCommitShort: null,
    branchInMainHistory: false,
    searchedPatterns: []
  };

  // Pattern 1: Look for merge commits mentioning the SD ID
  const sdPatterns = [
    sdId,
    sdId.replace('SD-', ''),
    sdId.toLowerCase(),
    storedBranch
  ].filter(Boolean);

  result.searchedPatterns = sdPatterns;

  for (const pattern of sdPatterns) {
    try {
      // Search for merge commits with this pattern
      const mergeCommit = execSync(
        `git -C "${normalizedPath}" log main --merges --grep="${pattern}" --format="%H %s" -1`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      ).trim();

      if (mergeCommit) {
        const [hash, ...messageParts] = mergeCommit.split(' ');
        result.foundMergeCommit = true;
        result.mergeCommitHash = hash;
        result.mergeCommitShort = hash.substring(0, 7);
        result.mergeMessage = messageParts.join(' ');
        log(`   Found merge commit: ${result.mergeCommitShort} - ${result.mergeMessage}`);
        break;
      }
    } catch (_e) {
      // Continue to next pattern
    }
  }

  // Pattern 2: If we have a stored branch, check if its tip is in main's history
  if (storedBranch && !result.foundMergeCommit) {
    try {
      // Get the last known commit of the branch from reflog or database
      // This is a heuristic - we search for commits with the branch name in the message
      const branchCommits = execSync(
        `git -C "${normalizedPath}" log main --format="%H" --grep="${storedBranch}" -1`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      ).trim();

      if (branchCommits) {
        result.branchInMainHistory = true;
        log('   Found branch reference in main history');
      }
    } catch (_e) {
      // Ignore errors
    }
  }

  return result;
}

/**
 * Check for PR merge evidence (searches commit messages for PR patterns)
 * @param {string} repoPath - Path to the repository
 * @param {string} storedBranch - Previously stored branch name
 * @param {string} sdId - Strategic Directive ID
 * @param {boolean} verbose - Enable verbose logging
 * @returns {Promise<Object>} PR evidence result
 */
export async function checkPRMergeEvidence(repoPath, storedBranch, sdId, verbose = false) {
  const log = verbose ? console.log.bind(console) : () => {};
  const normalizedPath = normalizePath(repoPath);

  const result = {
    merged: false,
    prNumber: null,
    mergeCommit: null
  };

  try {
    // Look for "Merge pull request #XXX from user/branch" pattern
    const branchPattern = storedBranch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prMerge = execSync(
      `git -C "${normalizedPath}" log main --format="%H %s" --grep="Merge pull request" --grep="${branchPattern}" --all-match -1`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();

    if (prMerge) {
      const prMatch = prMerge.match(/#(\d+)/);
      if (prMatch) {
        result.merged = true;
        result.prNumber = `#${prMatch[1]}`;
        result.mergeCommit = prMerge.split(' ')[0].substring(0, 7);
        log(`   Found merged PR: ${result.prNumber}`);
      }
    }

    // Also try searching by SD ID in PR title
    if (!result.merged) {
      const sdPrMerge = execSync(
        `git -C "${normalizedPath}" log main --format="%H %s" --grep="Merge pull request" --grep="${sdId}" --all-match -1`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      ).trim();

      if (sdPrMerge) {
        const prMatch = sdPrMerge.match(/#(\d+)/);
        if (prMatch) {
          result.merged = true;
          result.prNumber = `#${prMatch[1]}`;
          result.mergeCommit = sdPrMerge.split(' ')[0].substring(0, 7);
          log(`   Found merged PR by SD ID: ${result.prNumber}`);
        }
      }
    }
  } catch (_e) {
    // Ignore errors - PR evidence is optional
  }

  return result;
}

export default {
  checkPostMergeFallback,
  checkMergeEvidence,
  checkPRMergeEvidence
};
