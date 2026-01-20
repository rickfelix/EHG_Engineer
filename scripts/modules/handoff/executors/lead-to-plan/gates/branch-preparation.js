/**
 * Branch Preparation Gate for LEAD-TO-PLAN (DISABLED)
 * Part of SD-LEO-REFACTOR-LEADTOPLAN-001
 *
 * LEO v4.4.1: Proactive Branch Creation
 *
 * DISABLED (2026-01-09): Removed proactive branch creation at LEAD-TO-PLAN
 * Root cause analysis found this created 192+ orphaned branches because:
 * - SDs that never proceed to EXEC still get branches
 * - Infrastructure SDs create branches in wrong repo (EHG vs EHG_Engineer)
 * - Ship command already has just-in-time branch creation (Step 3)
 *
 * Branches are now created on-demand when /ship is invoked.
 * See: scripts/branch-cleanup-intelligent.js for orphan cleanup.
 *
 * This code is preserved for reference/potential future use.
 */

import { createSDBranch, branchExists, generateBranchName } from '../../../../create-sd-branch.js';
import { getRepoPath } from '../utils.js';

/**
 * Ensure SD branch exists BEFORE implementation starts (at LEAD approval)
 *
 * This addresses the gap where:
 * - Branch creation was only validated at PLAN-TO-EXEC (too late)
 * - Developers might start work before running handoff
 * - No explicit trigger point for branch creation existed
 *
 * @param {Object} sd - Strategic Directive
 * @param {Object} supabase - Supabase client
 * @returns {Object} Validation result with branch details
 */
export async function ensureSDBranchExists(sd, supabase) {
  const issues = [];
  const warnings = [];
  let branchName = null;
  let created = false;

  try {
    const sdId = sd.id || sd.sd_key;
    const title = sd.title || '';
    const targetApp = sd.target_application || 'EHG';

    // Determine repo path (cross-platform)
    const repoPath = targetApp.toLowerCase().includes('engineer')
      ? getRepoPath('EHG_Engineer')
      : getRepoPath('EHG');

    if (!repoPath) {
      warnings.push(`Unknown target_application: ${targetApp} - skipping branch creation`);
      console.log(`   ⚠️  Unknown target_application: ${targetApp}`);
      return { pass: true, score: 80, issues: [], warnings };
    }

    // Generate expected branch name
    branchName = generateBranchName(sdId, title);
    console.log(`   Target Application: ${targetApp}`);
    console.log(`   Repository: ${repoPath}`);
    console.log(`   Expected Branch: ${branchName}`);

    // Check if branch already exists
    const existsResult = await branchExists(branchName, repoPath);

    if (existsResult.exists) {
      console.log(`   ✅ Branch already exists (${existsResult.location})`);

      // Update database with branch name if not already set
      if (!sd.branch_name) {
        try {
          await supabase
            .from('strategic_directives_v2')
            .update({ branch_name: branchName })
            .eq('id', sd.id);
          console.log('   ✅ Branch name recorded in database');
        } catch {
          // Non-critical - continue
        }
      }

      return {
        pass: true,
        score: 100,
        issues: [],
        warnings: [],
        details: { branchName, exists: true, created: false }
      };
    }

    // Branch doesn't exist - create it proactively
    console.log('   ℹ️  Branch does not exist - creating proactively...');

    try {
      const result = await createSDBranch({
        sdId,
        title,
        app: targetApp,
        autoStash: true, // Automatically handle uncommitted changes
        noSwitch: false  // Switch to the new branch
      });

      if (result.success) {
        created = true;
        branchName = result.branchName;
        console.log(`   ✅ Branch created: ${branchName}`);

        return {
          pass: true,
          score: 100,
          issues: [],
          warnings: [],
          details: { branchName, exists: true, created: true }
        };
      } else {
        warnings.push('Branch creation returned unsuccessful - may need manual creation');
        console.log('   ⚠️  Branch creation did not complete successfully');
      }
    } catch (createError) {
      warnings.push(`Branch creation failed: ${createError.message}`);
      console.log(`   ⚠️  Could not create branch: ${createError.message}`);
      console.log('   📋 Manual command: npm run sd:branch ' + sdId);
    }

  } catch (error) {
    warnings.push(`Branch preparation error: ${error.message}`);
    console.log(`   ⚠️  Error: ${error.message}`);
  }

  // Even if branch creation failed, don't block handoff (soft gate)
  const passed = issues.length === 0;
  const score = passed ? (warnings.length > 0 ? 70 : 100) : 0;

  console.log(`   Result: ${passed ? '✅ PASS' : '❌ FAIL'} ${warnings.length > 0 ? '(with warnings)' : ''}`);

  return {
    pass: passed,
    score,
    max_score: 100,
    issues,
    warnings,
    details: { branchName, created }
  };
}

/**
 * Create the branch preparation gate (DISABLED)
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - Strategic Directive
 * @returns {Object} Gate configuration
 */
export function createBranchPreparationGate(supabase, sd) {
  return {
    name: 'SD_BRANCH_PREPARATION',
    validator: async (ctx) => ensureSDBranchExists(ctx.sd, supabase),
    required: false,
    weight: 0.9,
    remediation: 'Branch creation failed. Run manually: npm run sd:branch ' + (sd?.id || '<SD-ID>')
  };
}
