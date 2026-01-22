/**
 * Dependency Chain Validator for AUTO-PROCEED
 *
 * Integrates child-sd-preflight.js into AUTO-PROCEED flow.
 * Validates dependencies before proceeding with child SDs.
 *
 * Created: 2026-01-22
 * SD: SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-D
 * Part of: AUTO-PROCEED Intelligence Enhancements
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Dependency validation result
 * @typedef {Object} DependencyValidationResult
 * @property {boolean} canProceed - Whether all dependencies are satisfied
 * @property {string[]} blockedBy - List of blocking dependency SD keys
 * @property {string} message - Human-readable status message
 * @property {Object[]} dependencyStatus - Status of each dependency
 */

/**
 * Validate that all dependencies for a child SD are complete.
 *
 * Used by AUTO-PROCEED to check before starting each child SD.
 *
 * @param {string} sdKey - The child SD key to validate
 * @returns {Promise<DependencyValidationResult>} Validation result
 */
export async function validateDependencyChain(sdKey) {
  console.log(`\n🔗 Validating dependency chain for: ${sdKey}`);

  // Fetch the SD
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, dependency_chain, parent_sd_id, status, progress')
    .eq('sd_key', sdKey)
    .single();

  if (sdError || !sd) {
    return {
      canProceed: false,
      blockedBy: [],
      message: `SD not found: ${sdKey}`,
      dependencyStatus: []
    };
  }

  // If no dependency_chain, can proceed
  if (!sd.dependency_chain || sd.dependency_chain.length === 0) {
    console.log('   ✅ No dependencies - can proceed');
    return {
      canProceed: true,
      blockedBy: [],
      message: 'No dependencies required',
      dependencyStatus: []
    };
  }

  // Fetch all dependencies
  const { data: dependencies, error: depError } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, status, progress')
    .in('sd_key', sd.dependency_chain);

  if (depError) {
    console.log(`   ⚠️  Error fetching dependencies: ${depError.message}`);
    return {
      canProceed: false,
      blockedBy: sd.dependency_chain,
      message: `Error fetching dependencies: ${depError.message}`,
      dependencyStatus: []
    };
  }

  // Check each dependency
  const dependencyStatus = [];
  const blockedBy = [];

  for (const dep of dependencies || []) {
    const isComplete = dep.status === 'completed' && dep.progress >= 100;
    dependencyStatus.push({
      sdKey: dep.sd_key,
      title: dep.title,
      status: dep.status,
      progress: dep.progress,
      isComplete
    });

    if (!isComplete) {
      blockedBy.push(dep.sd_key);
      console.log(`   🚫 BLOCKED by: ${dep.sd_key} (${dep.status}, ${dep.progress}%)`);
    } else {
      console.log(`   ✅ Dependency satisfied: ${dep.sd_key}`);
    }
  }

  // Check for missing dependencies (not found in database)
  const foundKeys = (dependencies || []).map(d => d.sd_key);
  const missingDeps = sd.dependency_chain.filter(key => !foundKeys.includes(key));
  for (const missing of missingDeps) {
    blockedBy.push(missing);
    dependencyStatus.push({
      sdKey: missing,
      title: 'NOT FOUND',
      status: 'missing',
      progress: 0,
      isComplete: false
    });
    console.log(`   🚫 BLOCKED by: ${missing} (NOT FOUND IN DATABASE)`);
  }

  const canProceed = blockedBy.length === 0;
  const message = canProceed
    ? `All ${sd.dependency_chain.length} dependencies satisfied`
    : `Blocked by ${blockedBy.length} incomplete dependency/dependencies: ${blockedBy.join(', ')}`;

  console.log(`   ${canProceed ? '✅' : '❌'} ${message}`);

  return {
    canProceed,
    blockedBy,
    message,
    dependencyStatus
  };
}

/**
 * Wait for a specific dependency to complete.
 * Polls the database until the dependency reaches completed status.
 *
 * @param {string} dependencySdKey - The SD key to wait for
 * @param {Object} options - Wait options
 * @param {number} options.pollIntervalMs - Polling interval in ms (default: 5000)
 * @param {number} options.maxWaitMs - Maximum wait time in ms (default: 300000 = 5 min)
 * @returns {Promise<boolean>} True if dependency completed, false if timeout
 */
export async function waitForDependency(dependencySdKey, options = {}) {
  const pollIntervalMs = options.pollIntervalMs || 5000;
  const maxWaitMs = options.maxWaitMs || 300000;

  console.log(`\n⏳ Waiting for dependency: ${dependencySdKey}`);
  console.log(`   Poll interval: ${pollIntervalMs / 1000}s, Max wait: ${maxWaitMs / 1000}s`);

  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const { data: dep, error } = await supabase
      .from('strategic_directives_v2')
      .select('status, progress')
      .eq('sd_key', dependencySdKey)
      .single();

    if (error) {
      console.log(`   ⚠️  Error checking dependency: ${error.message}`);
      await sleep(pollIntervalMs);
      continue;
    }

    if (dep.status === 'completed' && dep.progress >= 100) {
      console.log(`   ✅ Dependency ${dependencySdKey} is now complete!`);
      return true;
    }

    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    console.log(`   ⏳ ${dependencySdKey}: ${dep.status} (${dep.progress}%) - waiting ${elapsedSec}s...`);

    await sleep(pollIntervalMs);
  }

  console.log(`   ❌ Timeout waiting for ${dependencySdKey}`);
  return false;
}

/**
 * AUTO-PROCEED dependency check.
 * Validates dependencies and optionally waits for them.
 *
 * @param {string} childSdKey - The child SD to check dependencies for
 * @param {Object} options - Options
 * @param {boolean} options.waitForBlocking - Whether to wait for blocking deps (default: false)
 * @returns {Promise<{canProceed: boolean, waited: boolean, message: string}>}
 */
export async function autoProceedDependencyCheck(childSdKey, options = {}) {
  const waitForBlocking = options.waitForBlocking || false;

  // Initial validation
  const result = await validateDependencyChain(childSdKey);

  if (result.canProceed) {
    return {
      canProceed: true,
      waited: false,
      message: result.message
    };
  }

  // If not waiting, return blocked result
  if (!waitForBlocking) {
    return {
      canProceed: false,
      waited: false,
      message: `BLOCKED: ${result.message}`
    };
  }

  // Wait for each blocking dependency
  console.log(`\n🔄 AUTO-PROCEED: Waiting for ${result.blockedBy.length} blocking dependencies...`);

  for (const blockingKey of result.blockedBy) {
    const completed = await waitForDependency(blockingKey);
    if (!completed) {
      return {
        canProceed: false,
        waited: true,
        message: `Timeout waiting for dependency: ${blockingKey}`
      };
    }
  }

  // Re-validate after waiting
  const revalidation = await validateDependencyChain(childSdKey);

  return {
    canProceed: revalidation.canProceed,
    waited: true,
    message: revalidation.canProceed
      ? 'All dependencies satisfied after waiting'
      : `Still blocked: ${revalidation.message}`
  };
}

/**
 * Get dependency status for display.
 *
 * @param {string} sdKey - The SD key to get dependency status for
 * @returns {Promise<string>} Formatted dependency status string
 */
export async function getDependencyStatusDisplay(sdKey) {
  const result = await validateDependencyChain(sdKey);

  if (!result.dependencyStatus || result.dependencyStatus.length === 0) {
    return 'No dependencies';
  }

  const lines = ['DEPENDENCY STATUS:'];
  for (const dep of result.dependencyStatus) {
    const status = dep.isComplete ? '✅' : '🚫';
    lines.push(`  ${status} ${dep.sdKey}: ${dep.status} (${dep.progress}%)`);
  }
  lines.push(`\n${result.canProceed ? '✅ CAN PROCEED' : '❌ BLOCKED'}`);

  return lines.join('\n');
}

// Helper sleep function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export all functions
export default {
  validateDependencyChain,
  waitForDependency,
  autoProceedDependencyCheck,
  getDependencyStatusDisplay
};
