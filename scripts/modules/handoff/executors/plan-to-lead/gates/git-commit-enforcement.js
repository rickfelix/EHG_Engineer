/**
 * Git Commit Enforcement Gate for PLAN-TO-LEAD
 * Part of SD-LEO-REFACTOR-PLANTOLEAD-001
 *
 * GATE5: Validates git commit status for LEAD final approval
 */

import { isInfrastructureSDSync } from '../../../../sd-type-checker.js';

/**
 * Create the GATE5_GIT_COMMIT_ENFORCEMENT gate validator
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - Strategic Directive object
 * @param {string} appPath - Target application path
 * @returns {Object} Gate configuration
 */
export function createGitCommitEnforcementGate(supabase, sd, appPath) {
  const isNonCodeSD = isInfrastructureSDSync(sd);
  const sdType = (sd.sd_type || '').toLowerCase();
  const isBugfixSD = sdType === 'bugfix' || sdType === 'bug_fix';

  // Documentation/Infrastructure/Bugfix SDs get relaxed enforcement
  if (isNonCodeSD || isBugfixSD) {
    const sdTypeLabel = isBugfixSD ? 'Bugfix' : 'Documentation/Infrastructure';
    return {
      name: 'GATE5_GIT_COMMIT_ENFORCEMENT',
      validator: async () => {
        console.log('\n🔒 GATE 5: Git Commit Enforcement');
        console.log('-'.repeat(50));
        console.log(`   ℹ️  ${sdTypeLabel} SD detected (sd_type=${sdType})`);
        console.log('   ✅ Skipping strict commit enforcement');
        console.log(`   📝 ${sdTypeLabel} SDs use relaxed git enforcement`);

        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [`${sdTypeLabel} SD - commit enforcement relaxed`],
          details: {
            is_relaxed_sd: true,
            sd_type: sd.sd_type,
            workflow_modification: `Commit enforcement skipped for ${sdTypeLabel} SDs`
          }
        };
      },
      required: true
    };
  }

  // Standard SDs get full commit enforcement
  return {
    name: 'GATE5_GIT_COMMIT_ENFORCEMENT',
    validator: async (ctx) => {
      console.log('\n🔒 GATE 5: Git Commit Enforcement');
      console.log('-'.repeat(50));

      // PARENT SD DETECTION
      const sdUuid = ctx.sd?.id || ctx.sdId;
      const { data: childSDs } = await supabase
        .from('strategic_directives_v2')
        .select('id, legacy_id, status')
        .eq('parent_sd_id', sdUuid);

      if (childSDs && childSDs.length > 0) {
        const completedChildren = childSDs.filter(c => c.status === 'completed');
        console.log(`   ℹ️  Parent orchestrator SD detected with ${childSDs.length} children`);
        console.log(`   ✅ Completed children: ${completedChildren.length}/${childSDs.length}`);
        console.log('   📝 Skipping commit enforcement - children have their own commits');

        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: ['Parent orchestrator SD - commits tracked via children'],
          details: {
            is_parent_sd: true,
            child_count: childSDs.length,
            completed_children: completedChildren.length,
            workflow_modification: 'Commit enforcement via children, not parent'
          }
        };
      }

      console.log(`   Target repository: ${appPath}`);

      // Lazy load verifier
      const { default: GitCommitVerifier } = await import('../../../../../verify-git-commit-status.js');

      const verifier = new GitCommitVerifier(ctx.sdId, appPath, { legacyId: ctx.sd?.legacy_id });
      const result = await verifier.verify();
      ctx._gitResults = result;

      if (result.verdict === 'FAIL') {
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: result.blockers,
          warnings: []
        };
      }

      console.log('✅ GATE 5: Git status clean, all commits pushed');
      console.log(`   Commits found: ${result.commitCount}`);

      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [],
        details: result
      };
    },
    required: true
  };
}
