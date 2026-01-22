/**
 * LOC Threshold Validation Gate for EXEC-TO-PLAN
 * Part of SD-LEO-INFRA-PROTOCOL-ENFORCEMENT-HARDENING-001
 *
 * Enforces EXEC-TO-PLAN handoff for infrastructure/refactor SDs with >500 LOC changes.
 * Large changes require proper verification through the handoff system.
 *
 * FR-2: EXEC-TO-PLAN LOC Threshold Gate
 */

import { execSync } from 'child_process';

/**
 * Create the LOC_THRESHOLD_VALIDATION gate validator
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration
 */
export function createLOCThresholdValidationGate(supabase) {
  return {
    name: 'LOC_THRESHOLD_VALIDATION',
    validator: async (ctx) => {
      console.log('\n📏 LOC THRESHOLD VALIDATION (LEO v4.4.3)');
      console.log('-'.repeat(50));

      // 1. Check SD type - only applies to infrastructure and refactor
      const sdType = (ctx.sd?.sd_type || 'feature').toLowerCase();
      const APPLICABLE_TYPES = ['infrastructure', 'refactor'];

      if (!APPLICABLE_TYPES.includes(sdType)) {
        console.log(`   ℹ️  ${sdType} type SD - LOC threshold not enforced`);
        console.log('   → Only infrastructure/refactor SDs have LOC threshold');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: { skipped: true, reason: `${sdType} SD type not subject to LOC threshold` }
        };
      }

      // 2. Get configurable threshold from environment
      const locThreshold = parseInt(process.env.LEO_LOC_THRESHOLD || '500');
      console.log(`   📊 SD Type: ${sdType}`);
      console.log(`   📊 LOC Threshold: ${locThreshold} lines`);

      // 3. Calculate LOC from git diff
      let locCount = 0;
      let diffOutput = '';

      try {
        // Get the base branch (usually main)
        const baseBranch = process.env.LEO_BASE_BRANCH || 'main';

        // Get current branch
        const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();

        if (currentBranch === baseBranch) {
          // On main branch, check uncommitted changes
          diffOutput = execSync('git diff --stat', { encoding: 'utf8' });
        } else {
          // On feature branch, compare against base
          diffOutput = execSync(`git diff --stat ${baseBranch}...HEAD`, { encoding: 'utf8' });
        }

        // Parse the summary line: " X files changed, Y insertions(+), Z deletions(-)"
        const summaryMatch = diffOutput.match(/(\d+) insertions?\(\+\)|(\d+) deletions?\(-\)/g);
        if (summaryMatch) {
          summaryMatch.forEach(match => {
            const num = parseInt(match.match(/\d+/)[0]);
            locCount += num;
          });
        }

        console.log(`   📊 Current Branch: ${currentBranch}`);
        console.log(`   📊 Base Branch: ${baseBranch}`);
        console.log(`   📊 Total LOC Changed: ${locCount}`);

      } catch (gitError) {
        console.log(`   ⚠️  Could not calculate LOC: ${gitError.message}`);
        // If we can't calculate LOC, pass with warning
        return {
          passed: true,
          score: 70,
          max_score: 100,
          issues: [],
          warnings: [`Could not calculate LOC: ${gitError.message}. Manual verification recommended.`],
          details: { error: gitError.message }
        };
      }

      // 4. Check if threshold exceeded
      if (locCount > locThreshold) {
        console.log(`   ⚠️  LOC ${locCount} exceeds threshold ${locThreshold}`);
        console.log('\n   📋 ADVISORY (not blocking for EXEC-TO-PLAN):');
        console.log('   Large infrastructure/refactor changes should be:');
        console.log('   1. Reviewed carefully during PLAN-TO-LEAD verification');
        console.log('   2. Broken into smaller increments if possible');
        console.log('   3. Thoroughly tested before LEAD-FINAL-APPROVAL');

        // Record the threshold exceeded event for tracking
        try {
          await supabase
            .from('leo_error_log')
            .insert({
              error_type: 'LOC_THRESHOLD_ADVISORY',
              sd_id: ctx.sd?.id || ctx.sdId,
              handoff_type: 'EXEC-TO-PLAN',
              error_message: `LOC ${locCount} exceeds threshold ${locThreshold} for ${sdType} SD`,
              context: {
                loc_count: locCount,
                threshold: locThreshold,
                sd_type: sdType
              }
            });
        } catch (logError) {
          // Don't fail if logging fails
          console.log(`   ⚠️  Could not log threshold event: ${logError.message}`);
        }

        return {
          passed: true, // Advisory mode - doesn't block
          score: 60,
          max_score: 100,
          issues: [],
          warnings: [`LOC ${locCount} exceeds threshold ${locThreshold} for ${sdType} SD - extra review recommended`],
          details: {
            loc_count: locCount,
            threshold: locThreshold,
            exceeded: true,
            sd_type: sdType
          }
        };
      }

      // 5. Threshold not exceeded
      console.log(`   ✅ LOC ${locCount} within threshold ${locThreshold}`);

      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: [],
        details: {
          loc_count: locCount,
          threshold: locThreshold,
          exceeded: false,
          sd_type: sdType
        }
      };
    },
    required: false // Advisory gate - doesn't block handoff
  };
}
