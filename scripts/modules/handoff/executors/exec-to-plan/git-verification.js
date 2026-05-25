/**
 * Git Commit Verification for EXEC-TO-PLAN
 * Part of SD-LEO-REFACTOR-EXECTOPLAN-001
 *
 * Verifies git commits for SD
 */

/**
 * Verify git commits for SD
 *
 * @param {string} sdId - SD ID
 * @param {Object} sd - SD object
 * @param {Function} determineTargetRepository - Function to determine target repo
 * @returns {Object} Commit verification result
 */
export async function verifyGitCommits(sdId, sd, determineTargetRepository) {
  console.log('📝 Step 5: Git Commit Verification');
  console.log('-'.repeat(50));

  let commitVerification = null;
  const sdType = (sd?.sd_type || '').toLowerCase();

  // SD-TYPE-AWARE GIT COMMIT EXEMPTIONS
  const GIT_COMMIT_OPTIONAL = ['documentation', 'docs'];

  if (GIT_COMMIT_OPTIONAL.includes(sdType)) {
    console.log(`   ℹ️  ${sdType} type SD - Git commit check is OPTIONAL`);
    console.log('   → May only have markdown file changes');
    return { verdict: 'PASS', commit_count: 0, optional: true };
  }

  try {
    const { default: GitCommitVerifier } = await import('../../../../verify-git-commit-status.js');
    const appPath = determineTargetRepository(sd);
    // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-E: Pass sd_key for commit search
    const verifier = new GitCommitVerifier(sdId, appPath, { sdKey: sd?.sd_key });
    commitVerification = await verifier.verify();

    if (commitVerification.verdict === 'PASS') {
      console.log('   ✅ All changes committed');
      console.log(`   Commits: ${commitVerification.commit_count}`);
    } else {
      console.log('   ⚠️  Uncommitted changes detected');
    }
  } catch (error) {
    console.log(`   ⚠️  Git verification error: ${error.message}`);
  }

  return commitVerification;
}

/**
 * Run automated shipping (PR creation)
 *
 * @param {string} sdId - SD ID
 * @param {Object} sd - SD object
 * @param {Function} determineTargetRepository - Function to determine target repo
 * @returns {Object} Shipping result
 */
export async function runAutomatedShippingForSD(sdId, sd, determineTargetRepository) {
  let shippingResult = null;

  try {
    console.log('\n🚢 [AUTO-SHIP] PR Creation Decision');
    console.log('-'.repeat(50));

    const { runAutomatedShipping } = await import('../../../shipping/index.js');
    const repoPath = determineTargetRepository(sd);

    shippingResult = await runAutomatedShipping(
      sdId,
      repoPath,
      'EXEC-TO-PLAN',
      'PR_CREATION'
    );

    if (shippingResult.executionResult?.success) {
      console.log(`\n   ✅ PR Created: ${shippingResult.executionResult.prUrl}`);
    } else if (shippingResult.shouldEscalate) {
      console.log('\n   ⚠️  PR creation escalated to human - run /ship manually');
    } else if (shippingResult.executionResult?.deferred) {
      console.log('\n   ⏸️  PR creation deferred - fix issues first');
    }
  } catch (shippingError) {
    console.warn(`   ⚠️  Auto-shipping error (non-blocking): ${shippingError.message}`);
  }

  return shippingResult;
}
