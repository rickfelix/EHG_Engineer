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

  // Documentation/Infrastructure/Bugfix SDs get relaxed enforcement.
  // Also self-skip when the target repo has no usable git (e.g. EHG consolidated repo) —
  // this is type-agnostic and covers refactor/database/security/etc. on EHG target.
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

  // Standard SDs get full commit enforcement, UNLESS the target repo has no usable git.
  return {
    name: 'GATE5_GIT_COMMIT_ENFORCEMENT',
    validator: async (ctx) => {
      // Self-skip when the target repo has no usable git (e.g. EHG consolidated repo).
      // This fires for any sd_type (refactor/database/security/feature/…) targeting EHG.
      const { isGitCapableRepo, isVentureRepo } = await import('../../../../../../lib/repo-paths.js');
      const isGitIncapableTarget = sd && sd.target_application && !isGitCapableRepo(sd.target_application);
      if (isGitIncapableTarget) {
        // SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 FR-4 (SECURITY VB-4): a not-git-capable target
        // is a legitimate skip ONLY for PLATFORM repos — EHG is locked to detached HEAD, so its
        // branch/commit ops are genuinely N/A and its commits live in the EHG_Engineer worktree.
        // For a VENTURE repo, "not git-capable" means it is not locally cloned / has no branch;
        // silently free-passing commit enforcement there is the exact gate-self-skip this SD closes.
        if (isVentureRepo(sd.target_application)) {
          console.log('\n🔒 GATE 5: Git Commit Enforcement');
          console.log('-'.repeat(50));
          console.log(`   ⛔ venture target_application='${sd.target_application}' is not locally git-capable`);
          console.log('   ❌ FAIL-CLOSED: cannot verify venture build commits (no local clone/branch)');
          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [
              `GATE5 FAIL-CLOSED: venture repo '${sd.target_application}' is not locally git-capable, so commit status `
              + `cannot be verified. Free-pass removed per SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 FR-4 / SECURITY VB-4. `
              + `Clone the venture repo (or route via the bridge with a git-capable checkout) before this handoff.`
            ],
            warnings: [],
            details: { fail_closed_venture_repo: true, target_application: sd.target_application }
          };
        }
        // Platform repo (EHG) — legitimate N/A skip (detached HEAD; commits in EHG_Engineer worktree).
        console.log('\n🔒 GATE 5: Git Commit Enforcement');
        console.log('-'.repeat(50));
        console.log(`   ℹ️  platform target_application='${sd.target_application}' has no usable git repository (detached HEAD)`);
        console.log('   ✅ Skipping strict commit enforcement (git-incapable platform target)');
        console.log('   📝 Branch isolation handled via worktree; commits live in EHG_Engineer');

        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [`GATE5 N/A: platform target_application='${sd.target_application}' has no usable git repository; commit enforcement skipped`],
          details: {
            skipped_not_applicable: true,
            target_application: sd.target_application,
            workflow_modification: 'Commit enforcement skipped — platform target repo is not git-capable'
          }
        };
      }

      console.log('\n🔒 GATE 5: Git Commit Enforcement');
      console.log('-'.repeat(50));

      // PARENT SD DETECTION
      const sdUuid = ctx.sd?.id || ctx.sdId;
      const { data: childSDs } = await supabase
        .from('strategic_directives_v2')
        .select('id, sd_key, status')
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

      const verifier = new GitCommitVerifier(ctx.sdId, appPath, { sdKey: ctx.sd?.sd_key });
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
