/**
 * Branch Resolver - Intelligent Feature Branch Discovery & Validation
 *
 * Purpose: Resolve the correct feature branch for an SD with ground-truth validation.
 * No assumptions, no hallucinations - every branch is validated against actual git state.
 *
 * REFACTORED: This file is a thin wrapper that delegates to domain modules.
 * Domain modules located in ./branch-resolver/domains/:
 * - validation.js - Branch existence and content validation
 * - discovery.js - Git branch discovery and selection
 * - fallback.js - Post-merge fallback logic
 * - db-operations.js - Database storage operations
 * - file-operations.js - Git file operations
 *
 * Flow:
 * 1. Check database for stored feature_branch
 * 2. Validate stored branch still exists in git
 * 3. If not found/invalid, discover from git
 * 4. If no branch found, check for POST-MERGE FALLBACK
 * 5. Validate discovered branch
 * 6. Store validated branch in database
 * 7. Return branch info for test scanning
 *
 * Created: 2026-01-08
 * SD: SD-EVAL-MATRIX-001 (test scanner fix)
 */

import path from 'path';
import { fileURLToPath } from 'url';

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_EHG_PATH = path.resolve(__dirname, '../../ehg');

// Import domain modules
import {
  validateBranchExists,
  validateBranchContent
} from './branch-resolver/domains/validation.js';

import {
  discoverBranchFromGit,
  selectBestBranch
} from './branch-resolver/domains/discovery.js';

import {
  checkPostMergeFallback
} from './branch-resolver/domains/fallback.js';

import {
  storeBranchInDatabase,
  updateBranchAsMerged
} from './branch-resolver/domains/db-operations.js';

import {
  readFileFromBranch,
  listFilesFromBranch,
  fileExistsOnBranch
} from './branch-resolver/domains/file-operations.js';

/**
 * Resolve the feature branch for an SD with full validation
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - Strategic Directive ID (e.g., SD-EVAL-MATRIX-001)
 * @param {Object} options - Options
 * @param {string} options.repoPath - Path to the target repository
 * @param {boolean} options.autoStore - Auto-store discovered branch in database (default: true)
 * @param {boolean} options.verbose - Enable verbose logging (default: false)
 * @returns {Promise<Object>} Branch resolution result
 */
export async function resolveBranch(supabase, sdId, options = {}) {
  const {
    repoPath = DEFAULT_EHG_PATH,
    autoStore = true,
    verbose = false
  } = options;

  const log = verbose ? console.log.bind(console) : () => {};

  const result = {
    success: false,
    branch: null,
    source: null, // 'database', 'discovered', 'fallback'
    validated: false,
    repoPath,
    sdId,
    error: null,
    details: {}
  };

  try {
    // Step 1: Check database for stored feature_branch
    log(`\n🔍 Step 1: Checking database for SD ${sdId}...`);

    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, legacy_id, title, target_application, metadata')
      .or(`id.eq.${sdId},legacy_id.eq.${sdId}`)
      .single();

    if (sdError) {
      result.error = `SD not found: ${sdError.message}`;
      return result;
    }

    // Determine target repo path based on target_application
    const targetApp = sd.target_application || 'EHG';
    const actualRepoPath = targetApp === 'EHG_Engineer'
      ? path.resolve(__dirname, '..')
      : DEFAULT_EHG_PATH;

    result.repoPath = actualRepoPath;
    result.details.targetApplication = targetApp;
    result.details.sdUuid = sd.id;

    log(`   Target application: ${targetApp}`);
    log(`   Repository path: ${actualRepoPath}`);

    // Check for stored branch in metadata
    const storedBranch = sd.metadata?.feature_branch;

    if (storedBranch) {
      log(`   Found stored branch: ${storedBranch}`);

      // Step 2: Validate stored branch exists in git (delegated to domain)
      const validation = validateBranchExists(actualRepoPath, storedBranch, verbose);

      if (validation.exists) {
        log('   ✅ Stored branch validated in git');
        result.success = true;
        result.branch = storedBranch;
        result.source = 'database';
        result.validated = true;
        result.details.commitHash = validation.commitHash;
        result.details.lastCommitDate = validation.lastCommitDate;
        return result;
      } else {
        log('   ⚠️ Stored branch no longer exists in git, will discover...');
        result.details.staleStoredBranch = storedBranch;
      }
    } else {
      log('   No branch stored in database');
    }

    // Step 3: Discover branch from git (delegated to domain)
    log('\n🔍 Step 2: Discovering branch from git...');

    const discovery = discoverBranchFromGit(actualRepoPath, sdId, verbose);

    if (!discovery.found) {
      // Step 3b: Intelligent fallback - check if branch was merged to main
      log('\n🔍 Step 2b: No feature branch found, checking for post-merge fallback...');

      const fallbackResult = await checkPostMergeFallback(
        supabase,
        sd,
        actualRepoPath,
        sdId,
        storedBranch,
        verbose
      );

      if (fallbackResult.success) {
        log(`   ✅ Fallback to ${fallbackResult.branch}: ${fallbackResult.reason}`);
        result.success = true;
        result.branch = fallbackResult.branch;
        result.source = 'fallback';
        result.validated = fallbackResult.validated;
        result.details.fallbackReason = fallbackResult.reason;
        result.details.mergeEvidence = fallbackResult.evidence;
        result.details.contentValidation = fallbackResult.contentValidation;

        // Update database to reflect merged state (delegated to domain)
        if (autoStore && fallbackResult.shouldUpdateDb) {
          await updateBranchAsMerged(supabase, sd.id, storedBranch, fallbackResult);
        }

        return result;
      }

      // No fallback possible
      result.error = discovery.error || `No branch found for ${sdId}`;
      result.details.searchedPatterns = discovery.searchedPatterns;
      result.details.fallbackAttempted = true;
      result.details.fallbackFailReason = fallbackResult.reason;
      result.details.suggestion = `Create a feature branch with: git checkout -b feat/${sdId}-description`;
      return result;
    }

    log(`   Found ${discovery.matches.length} matching branch(es)`);

    // Step 4: Select best match (most recent if multiple) (delegated to domain)
    const selectedBranch = selectBestBranch(actualRepoPath, discovery.matches, verbose);

    log(`   Selected: ${selectedBranch.branch}`);
    log(`   Last commit: ${selectedBranch.lastCommitDate}`);

    // Step 5: Validate selected branch has expected content (delegated to domain)
    const contentValidation = validateBranchContent(
      actualRepoPath,
      selectedBranch.branch,
      sdId,
      verbose
    );

    result.details.contentValidation = contentValidation;

    // Step 6: Store validated branch in database (if autoStore enabled) (delegated to domain)
    if (autoStore) {
      log('\n🔍 Step 3: Storing validated branch in database...');

      const storeResult = await storeBranchInDatabase(
        supabase,
        sd.id,
        selectedBranch.branch,
        {
          discoveredAt: new Date().toISOString(),
          commitHash: selectedBranch.commitHash,
          validated: true,
          contentValidation
        }
      );

      if (storeResult.success) {
        log('   ✅ Branch stored in database');
      } else {
        log(`   ⚠️ Failed to store: ${storeResult.error}`);
      }

      result.details.stored = storeResult.success;
    }

    result.success = true;
    result.branch = selectedBranch.branch;
    result.source = 'discovered';
    result.validated = true;
    result.details.commitHash = selectedBranch.commitHash;
    result.details.lastCommitDate = selectedBranch.lastCommitDate;
    result.details.allMatches = discovery.matches;

    return result;

  } catch (error) {
    result.error = `Branch resolution failed: ${error.message}`;
    result.details.stack = error.stack;
    return result;
  }
}

export default {
  resolveBranch,
  readFileFromBranch,
  listFilesFromBranch,
  fileExistsOnBranch
};

// Re-export domain functions for direct access if needed
export {
  validateBranchExists,
  validateBranchContent,
  discoverBranchFromGit,
  selectBestBranch,
  checkPostMergeFallback,
  storeBranchInDatabase,
  updateBranchAsMerged,
  readFileFromBranch,
  listFilesFromBranch,
  fileExistsOnBranch
};
