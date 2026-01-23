/**
 * Branch Enforcement Gate
 * Part of SD-LEO-REFACTOR-PLANTOEXEC-001
 * Enhanced: SD-LEO-INFRA-PROACTIVE-BRANCH-ENFORCEMENT-001
 *
 * GATE6: Validates git branch for EXEC work
 *
 * PROACTIVE ENFORCEMENT (v2):
 * - Detects if on another SD's branch (not just main/master)
 * - Provides clear error when attempting to mix SD work
 * - Auto-creates correct branch if missing
 * - Auto-switches with stash preservation
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Extract SD-ID from a branch name if present
 * @param {string} branchName - Git branch name
 * @returns {string|null} Extracted SD-ID or null
 */
function extractSDFromBranch(branchName) {
  if (!branchName) return null;

  // Match SD-ID pattern: SD-<segments>
  // Examples: feat/SD-LEO-5-failure-handling, fix/SD-AUTH-001-login
  const match = branchName.match(/SD-[A-Z0-9]+([-][A-Z0-9]+)*/i);
  return match ? match[0].toUpperCase() : null;
}

/**
 * Check if current branch belongs to a different SD
 * @param {string} currentBranch - Current git branch
 * @param {string} targetSdId - Target SD ID
 * @returns {Object} Analysis result
 */
function analyzeCurrentBranch(currentBranch, targetSdId) {
  const result = {
    isProtectedBranch: false,
    isOtherSDBranch: false,
    otherSDId: null,
    isCorrectBranch: false
  };

  if (!currentBranch) return result;

  // Check for protected branches
  if (currentBranch === 'main' || currentBranch === 'master') {
    result.isProtectedBranch = true;
    return result;
  }

  // Extract SD from current branch
  const currentSD = extractSDFromBranch(currentBranch);

  if (currentSD) {
    // Normalize for comparison (handle case differences)
    const normalizedCurrent = currentSD.toUpperCase();
    const normalizedTarget = targetSdId.toUpperCase();

    if (normalizedCurrent === normalizedTarget) {
      result.isCorrectBranch = true;
    } else {
      result.isOtherSDBranch = true;
      result.otherSDId = currentSD;
    }
  }

  return result;
}

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
      console.log('\n🔒 GATE 6: Git Branch Enforcement (Proactive v2)');
      console.log('-'.repeat(50));

      // Pre-check: Detect if on another SD's branch BEFORE running full verifier
      try {
        const { stdout } = await execAsync('git branch --show-current', { cwd: appPath });
        const currentBranch = stdout.trim();

        const branchAnalysis = analyzeCurrentBranch(currentBranch, ctx.sdId);

        if (branchAnalysis.isOtherSDBranch) {
          console.log('\n⚠️  CROSS-SD BRANCH DETECTION');
          console.log('━'.repeat(50));
          console.log(`   Current branch: ${currentBranch}`);
          console.log(`   Branch belongs to: ${branchAnalysis.otherSDId}`);
          console.log(`   Target SD: ${ctx.sdId}`);
          console.log('');
          console.log('   🚨 WARNING: You are on a branch for a DIFFERENT SD!');
          console.log('   This typically happens when:');
          console.log('   1. Multiple SDs created in same session');
          console.log('   2. Work started before running proper handoffs');
          console.log('');
          console.log('   📋 RESOLUTION OPTIONS:');
          console.log('   a) Let this gate auto-switch to correct branch (recommended)');
          console.log('   b) Manually commit work on current branch first');
          console.log('   c) Stash changes: git stash push -m "WIP for ' + branchAnalysis.otherSDId + '"');
          console.log('━'.repeat(50));
        }
      } catch (preCheckError) {
        console.log(`   ⚠️  Pre-check warning: ${preCheckError.message}`);
        // Continue with normal verification
      }

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
          warnings: branchResults.warnings || []
        };
      }

      // Log success with branch info
      console.log('');
      console.log('✅ GATE 6: On correct branch, ready for EXEC work');
      console.log(`   Branch: ${branchResults.expectedBranch}`);

      if (branchResults.branchCreated) {
        console.log('   📝 Note: Branch was auto-created for this SD');
      }
      if (branchResults.branchSwitched) {
        console.log('   🔄 Note: Auto-switched from previous branch');
      }

      return {
        passed: true,
        score: 100,
        max_score: 100,
        issues: [],
        warnings: branchResults.warnings || [],
        details: {
          ...branchResults,
          proactiveEnforcement: true,
          autoCreated: branchResults.branchCreated,
          autoSwitched: branchResults.branchSwitched
        }
      };
    },
    required: true
  };
}
