/**
 * Multi-Repo Status Check
 *
 * Functions for checking uncommitted changes across multiple repositories.
 * Phase 2 Enhancement: Prevents shipping with uncommitted changes in related repos.
 *
 * Extracted from scripts/handoff.js for maintainability.
 * Part of SD-LEO-REFACTOR-HANDOFF-001
 */

import { checkUncommittedChanges, getAffectedRepos } from '../../../../lib/multi-repo/index.js';

/**
 * Check multi-repo status for SD-related work
 * Prevents shipping with uncommitted changes in related repos
 *
 * @param {Object|null} sdInfo - SD information for context (optional)
 * @returns {Object} - Check result with passed status and details
 */
export function checkMultiRepoStatus(sdInfo = null) {
  try {
    const status = checkUncommittedChanges(true);

    if (!status || !status.hasChanges) {
      return { passed: true, status: null };
    }

    // If SD info provided, check if changes are in affected repos
    let affectedRepos = ['ehg', 'EHG_Engineer']; // Default: both repos
    if (sdInfo) {
      try {
        affectedRepos = getAffectedRepos({
          title: sdInfo.title || '',
          description: sdInfo.description || '',
          sd_type: sdInfo.sd_type || 'feature'
        });
      } catch {
        // Keep default
      }
    }

    // Filter to only affected repos
    const relevantChanges = status.summary.filter(repo => {
      const repoName = repo.name.toLowerCase();
      return affectedRepos.some(ar => ar.toLowerCase() === repoName);
    });

    const hasRelevantChanges = relevantChanges.some(r =>
      r.uncommittedCount > 0 || r.unpushedCount > 0
    );

    return {
      passed: !hasRelevantChanges,
      status,
      relevantChanges,
      affectedRepos
    };
  } catch {
    // If multi-repo check fails, don't block
    return { passed: true, status: null, error: 'Could not check multi-repo status' };
  }
}

/**
 * Display multi-repo status for handoff context
 *
 * @param {Object} multiRepoResult - Result from checkMultiRepoStatus
 * @param {string} phaseName - Phase name for context (default: 'Handoff')
 */
export function displayMultiRepoStatus(multiRepoResult, phaseName = 'Handoff') {
  if (!multiRepoResult.status || multiRepoResult.passed) {
    console.log('   [OK] Multi-Repo Status: All repositories clean');
    return;
  }

  console.log('');
  console.log('[!] MULTI-REPO WARNING');
  console.log('-'.repeat(50));
  console.log('   Uncommitted changes found in related repositories:');
  console.log('');

  for (const repo of multiRepoResult.relevantChanges) {
    if (repo.uncommittedCount > 0 || repo.unpushedCount > 0) {
      const icon = repo.uncommittedCount > 0 ? '[M]' : '[P]';
      console.log(`   ${icon} ${repo.displayName} (${repo.branch})`);
      if (repo.uncommittedCount > 0) {
        console.log(`      ${repo.uncommittedCount} uncommitted change(s)`);
      }
      if (repo.unpushedCount > 0) {
        console.log(`      ${repo.unpushedCount} unpushed commit(s)`);
      }
    }
  }

  console.log('');
  console.log(`   Consider shipping changes in all repos before ${phaseName}`);
  console.log('   Run: node scripts/multi-repo-status.js for details');
  console.log('-'.repeat(50));
}
