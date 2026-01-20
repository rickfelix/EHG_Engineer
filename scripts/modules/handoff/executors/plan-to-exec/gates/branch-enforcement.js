/**
 * Branch Enforcement Gate
 * Part of SD-LEO-REFACTOR-PLANTOEXEC-001
 *
 * GATE6: Validates git branch for EXEC work
 */

/**
 * Create the GATE6_BRANCH_ENFORCEMENT gate validator
 *
 * @param {Object} sd - Strategic Directive object
 * @param {string} appPath - Target application path
 * @returns {Object} Gate configuration
 */
export function createBranchEnforcementGate(sd, appPath) {
  return {
    name: 'GATE6_BRANCH_ENFORCEMENT',
    validator: async (ctx) => {
      console.log('\n🔒 GATE 6: Git Branch Enforcement');
      console.log('-'.repeat(50));

      // Lazy load the verifier
      const { default: GitBranchVerifier } = await import('../../../../../verify-git-branch-status.js');

      const branchVerifier = new GitBranchVerifier(ctx.sdId, sd.title, appPath);
      const branchResults = await branchVerifier.verify();

      ctx._branchResults = branchResults;

      if (branchResults.verdict === 'FAIL') {
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: branchResults.blockers,
          warnings: []
        };
      }

      console.log('✅ GATE 6: On correct branch, ready for EXEC work');
      console.log(`   Branch: ${branchResults.expectedBranch}`);

      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [],
        details: branchResults
      };
    },
    required: true
  };
}
