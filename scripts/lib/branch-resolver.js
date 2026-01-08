/**
 * Branch Resolver - Intelligent Feature Branch Discovery & Validation
 *
 * Purpose: Resolve the correct feature branch for an SD with ground-truth validation.
 * No assumptions, no hallucinations - every branch is validated against actual git state.
 *
 * Flow:
 * 1. Check database for stored feature_branch
 * 2. Validate stored branch still exists in git
 * 3. If not found/invalid, discover from git
 * 4. Validate discovered branch
 * 5. Store validated branch in database
 * 6. Return branch info for test scanning
 *
 * Created: 2026-01-08
 * SD: SD-EVAL-MATRIX-001 (test scanner fix)
 */

import { execSync } from 'child_process';
import path from 'path';

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
    repoPath = '/mnt/c/_EHG/ehg',
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
      ? '/mnt/c/_EHG/EHG_Engineer'
      : '/mnt/c/_EHG/ehg';

    result.repoPath = actualRepoPath;
    result.details.targetApplication = targetApp;
    result.details.sdUuid = sd.id;

    log(`   Target application: ${targetApp}`);
    log(`   Repository path: ${actualRepoPath}`);

    // Check for stored branch in metadata
    const storedBranch = sd.metadata?.feature_branch;

    if (storedBranch) {
      log(`   Found stored branch: ${storedBranch}`);

      // Step 2: Validate stored branch exists in git
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

    // Step 3: Discover branch from git
    log('\n🔍 Step 2: Discovering branch from git...');

    const discovery = discoverBranchFromGit(actualRepoPath, sdId, verbose);

    if (!discovery.found) {
      result.error = discovery.error || `No branch found for ${sdId}`;
      result.details.searchedPatterns = discovery.searchedPatterns;
      result.details.suggestion = `Create a feature branch with: git checkout -b feat/${sdId}-description`;
      return result;
    }

    log(`   Found ${discovery.matches.length} matching branch(es)`);

    // Step 4: Select best match (most recent if multiple)
    const selectedBranch = selectBestBranch(actualRepoPath, discovery.matches, verbose);

    log(`   Selected: ${selectedBranch.branch}`);
    log(`   Last commit: ${selectedBranch.lastCommitDate}`);

    // Step 5: Validate selected branch has expected content
    const contentValidation = validateBranchContent(
      actualRepoPath,
      selectedBranch.branch,
      sdId,
      verbose
    );

    result.details.contentValidation = contentValidation;

    // Step 6: Store validated branch in database (if autoStore enabled)
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

/**
 * Validate a branch exists in git
 */
function validateBranchExists(repoPath, branchName, verbose = false) {
  const log = verbose ? console.log.bind(console) : () => {};

  try {
    // Try local branch first
    const localCheck = execSync(
      `cd "${repoPath}" && git rev-parse --verify "${branchName}" 2>/dev/null`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    if (localCheck) {
      const lastCommit = execSync(
        `cd "${repoPath}" && git log -1 --format="%ci" "${branchName}"`,
        { encoding: 'utf-8' }
      ).trim();

      return {
        exists: true,
        commitHash: localCheck,
        lastCommitDate: lastCommit,
        isLocal: true
      };
    }
  } catch (e) {
    // Local branch doesn't exist, try remote
  }

  try {
    // Try remote branch
    const remoteCheck = execSync(
      `cd "${repoPath}" && git rev-parse --verify "origin/${branchName}" 2>/dev/null`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    if (remoteCheck) {
      const lastCommit = execSync(
        `cd "${repoPath}" && git log -1 --format="%ci" "origin/${branchName}"`,
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
  } catch (e) {
    // Remote branch doesn't exist either
  }

  return { exists: false };
}

/**
 * Discover feature branches from git that match the SD ID
 */
function discoverBranchFromGit(repoPath, sdId, verbose = false) {
  const log = verbose ? console.log.bind(console) : () => {};

  const result = {
    found: false,
    matches: [],
    searchedPatterns: [],
    error: null
  };

  // Fetch latest from remote first
  try {
    execSync(`cd "${repoPath}" && git fetch --all 2>/dev/null`, { encoding: 'utf-8' });
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

  for (const pattern of searchPatterns) {
    try {
      // Search both local and remote branches
      const branches = execSync(
        `cd "${repoPath}" && git branch -a 2>/dev/null | grep -i "${pattern}" || true`,
        { encoding: 'utf-8' }
      ).trim();

      if (branches) {
        const branchList = branches
          .split('\n')
          .map(b => b.trim().replace(/^\*?\s*/, '').replace('remotes/origin/', ''))
          .filter(b => b && !b.includes('HEAD'))
          .filter((b, i, arr) => arr.indexOf(b) === i); // Dedupe

        if (branchList.length > 0) {
          log(`   Pattern "${pattern}" matched: ${branchList.join(', ')}`);
          result.found = true;
          result.matches = branchList;
          break;
        }
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
 */
function selectBestBranch(repoPath, branches, verbose = false) {
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

/**
 * Validate branch has expected content (tests, implementation files)
 */
function validateBranchContent(repoPath, branch, sdId, verbose = false) {
  const log = verbose ? console.log.bind(console) : () => {};

  const result = {
    hasTests: false,
    hasImplementation: false,
    testFiles: [],
    implementationFiles: [],
    warnings: []
  };

  try {
    // Check for test files
    const testFiles = execSync(
      `cd "${repoPath}" && git ls-tree -r --name-only "${branch}" 2>/dev/null | grep -E "\\.(spec|test)\\.(ts|tsx|js)$" | head -20 || true`,
      { encoding: 'utf-8' }
    ).trim();

    if (testFiles) {
      result.testFiles = testFiles.split('\n').filter(f => f);
      result.hasTests = result.testFiles.length > 0;
    }

    // Check for implementation files (components, pages, etc.)
    const implFiles = execSync(
      `cd "${repoPath}" && git ls-tree -r --name-only "${branch}" 2>/dev/null | grep -E "src/.*\\.(ts|tsx)$" | head -50 || true`,
      { encoding: 'utf-8' }
    ).trim();

    if (implFiles) {
      result.implementationFiles = implFiles.split('\n').filter(f => f);
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

/**
 * Store validated branch in database
 */
async function storeBranchInDatabase(supabase, sdUuid, branch, metadata = {}) {
  try {
    // Get current metadata
    const { data: current, error: fetchError } = await supabase
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('id', sdUuid)
      .single();

    if (fetchError) {
      return { success: false, error: fetchError.message };
    }

    // Merge new branch info into metadata
    const updatedMetadata = {
      ...(current?.metadata || {}),
      feature_branch: branch,
      branch_metadata: {
        ...metadata,
        storedAt: new Date().toISOString()
      }
    };

    // Update the record
    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({
        metadata: updatedMetadata,
        updated_at: new Date().toISOString()
      })
      .eq('id', sdUuid);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true };

  } catch (error) {
    return { success: false, error: error.message };
  }
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
    const content = execSync(
      `cd "${repoPath}" && git show "${branch}:${filePath}" 2>/dev/null`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 } // 10MB buffer
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
    const files = execSync(
      `cd "${repoPath}" && git ls-tree -r --name-only "${branch}" 2>/dev/null | grep -E "${pattern}" || true`,
      { encoding: 'utf-8' }
    ).trim();

    return files ? files.split('\n').filter(f => f) : [];

  } catch (error) {
    return [];
  }
}

/**
 * Check if a file exists on a specific branch
 */
export function fileExistsOnBranch(repoPath, branch, filePath) {
  try {
    execSync(
      `cd "${repoPath}" && git cat-file -e "${branch}:${filePath}" 2>/dev/null`,
      { encoding: 'utf-8' }
    );
    return true;
  } catch {
    return false;
  }
}

export default {
  resolveBranch,
  readFileFromBranch,
  listFilesFromBranch,
  fileExistsOnBranch
};
