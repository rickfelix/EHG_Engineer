/**
 * Cross-Repo Consumer Impact Advisory Gate for LEAD-TO-PLAN
 * SD: SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-048
 * Pattern: PAT-XREPO-CONS-001
 *
 * Advisory-only (never blocks). Warns when an SD's key_changes might
 * affect consumers in other repositories (e.g., backend data contract
 * changes that break frontend consumers).
 *
 * Uses lib/multi-repo to detect cross-repo impact.
 */

import { getAffectedRepos, getPrimaryRepos } from '../../../../../../lib/multi-repo/index.js';

/**
 * Check whether the SD's scope spans multiple repos and warn about
 * potential consumer impact.
 *
 * @param {Object} sd - Strategic Directive
 * @returns {Object} Gate result (always passes, may include warnings)
 */
export function validateCrossRepoConsumerImpact(sd) {
  const warnings = [];

  try {
    const affectedRepos = getAffectedRepos(sd);

    // Single-repo SDs have no cross-repo risk
    if (affectedRepos.length <= 1) {
      console.log(`   Single-repo SD (${affectedRepos[0] || 'unknown'}) - no cross-repo risk`);
      return { pass: true, score: 100, max_score: 100, issues: [], warnings: [] };
    }

    // Multi-repo SD detected
    console.log(`   Affected repos: ${affectedRepos.join(', ')}`);
    warnings.push(`Cross-repo SD detected: affects ${affectedRepos.join(' + ')}. Verify consumers of changed data contracts in all repos.`);

    // Check key_changes for data-contract-related terms
    const keyChanges = sd.key_changes || [];
    const contractKeywords = ['contract', 'schema', 'artifact', 'config', 'type', 'interface', 'map', 'constant', 'enum'];
    const contractChanges = keyChanges.filter(kc => {
      const text = `${kc.change || ''} ${kc.impact || ''}`.toLowerCase();
      return contractKeywords.some(kw => text.includes(kw));
    });

    if (contractChanges.length > 0) {
      warnings.push(
        `${contractChanges.length} key_change(s) may involve data contracts. ` +
        `Search ALL repos for consumers before approving.`
      );
      contractChanges.forEach(kc => {
        warnings.push(`  - "${(kc.change || '').substring(0, 80)}"`);
      });
    }

    // Check if all affected repos are available locally
    const primaryRepos = getPrimaryRepos();
    for (const repoName of affectedRepos) {
      if (!primaryRepos[repoName]) {
        warnings.push(`Repo '${repoName}' not found locally - cannot verify consumer impact`);
      }
    }
  } catch (error) {
    // Never block on errors - just warn
    warnings.push(`Cross-repo check error: ${error.message}`);
  }

  return {
    pass: true,
    score: warnings.length > 0 ? 90 : 100,
    max_score: 100,
    issues: [],
    warnings,
  };
}

/**
 * Factory: create the Cross-Repo Consumer Impact Gate.
 *
 * @returns {Object} Gate definition
 */
export function createCrossRepoConsumerImpactGate() {
  return {
    name: 'CROSS_REPO_CONSUMER_IMPACT',
    validator: async (ctx) => {
      console.log('\n🌐 GATE: Cross-Repo Consumer Impact (Advisory)');
      console.log('-'.repeat(50));
      return validateCrossRepoConsumerImpact(ctx.sd);
    },
    required: false,
    weight: 0.5,
    remediation: 'Search all affected repos for consumers of changed data contracts. Use: grep -r "<contract_name>" in each repo.',
  };
}
