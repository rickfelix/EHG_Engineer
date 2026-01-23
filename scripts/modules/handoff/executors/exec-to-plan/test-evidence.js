/**
 * Test Evidence Validation for EXEC-TO-PLAN
 * Part of SD-LEO-REFACTOR-EXECTOPLAN-001
 *
 * LEO v4.3.4: Unified Test Evidence Validation
 */

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';

// Get project root from current file location dynamically
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Walk up until we find package.json or use a known anchor
// From: scripts/modules/handoff/executors/exec-to-plan/test-evidence.js
// To project root: exec-to-plan(1) → executors(2) → handoff(3) → modules(4) → scripts(5) → PROJECT_ROOT
const PROJECT_ROOT = resolve(__dirname, '..', '..', '..', '..', '..');

// External functions (will be lazy loaded)
let getStoryTestCoverage;
let mapE2ETestsToUserStories;
let validateE2ECoverage;

/**
 * Validate test evidence for SD
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD ID
 * @param {Object} sd - SD object
 * @param {Object} prd - PRD object
 * @returns {Object} Test evidence result
 */
export async function validateTestEvidence(supabase, sdId, sd, prd) {
  let testEvidenceResult = null;

  // SD-TYPE-AWARE E2E EXEMPTIONS
  const sdType = (sd?.sd_type || '').toLowerCase();
  const EXEMPT_FROM_E2E = ['orchestrator', 'documentation', 'docs'];
  const E2E_OPTIONAL = ['infrastructure'];

  if (EXEMPT_FROM_E2E.includes(sdType)) {
    console.log(`   ℹ️  ${sdType} type SD - E2E test validation SKIPPED`);
    console.log(`   → Reason: ${sdType === 'orchestrator' ? 'Children handle testing' : 'No code to test'}`);
    return {
      skipped: true,
      reason: `${sdType} type SD - exempt from E2E testing`,
      total_stories: 0,
      passing_count: 0,
      all_passing: true
    };
  }

  if (E2E_OPTIONAL.includes(sdType)) {
    console.log(`   ℹ️  ${sdType} type SD - E2E testing is OPTIONAL`);
    console.log('   → Unit tests may suffice for infrastructure changes');
  }

  // Load test evidence functions
  if (!getStoryTestCoverage) {
    const testEvidencePath = resolve(PROJECT_ROOT, 'lib', 'test-evidence-ingest.js');
    const testEvidenceUrl = pathToFileURL(testEvidencePath).href;
    const testEvidence = await import(testEvidenceUrl);
    getStoryTestCoverage = testEvidence.getStoryTestCoverage;
  }

  try {
    // Query v_story_test_coverage view for comprehensive test evidence
    testEvidenceResult = await getStoryTestCoverage(sdId);

    if (testEvidenceResult.total_stories === 0) {
      console.log('   ℹ️  No user stories to validate');
    } else if (testEvidenceResult.all_passing) {
      console.log(`   ✅ All ${testEvidenceResult.passing_count}/${testEvidenceResult.total_stories} stories have passing tests`);
      console.log(`   📊 Latest test run: ${testEvidenceResult.latest_run_at || 'N/A'}`);
    } else {
      console.log(`   ⚠️  Test coverage: ${testEvidenceResult.passing_count}/${testEvidenceResult.total_stories} stories passing`);
      if (testEvidenceResult.failing_stories?.length > 0) {
        console.log('   ❌ Failing stories:');
        testEvidenceResult.failing_stories.slice(0, 5).forEach(story => {
          console.log(`      - ${story.story_key}: ${story.latest_test_status || 'No test evidence'}`);
        });
      }
    }

    return testEvidenceResult;
  } catch (error) {
    console.log(`   ⚠️  Test evidence query error: ${error.message}`);
    console.log('   → Falling back to legacy E2E mapping');

    // Fallback to legacy E2E mapping
    return fallbackToLegacyE2EMapping(supabase, sdId, prd);
  }
}

/**
 * Fallback to legacy E2E mapping if unified schema not available
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD ID
 * @param {Object} prd - PRD object
 * @returns {Object} Legacy test evidence result
 */
async function fallbackToLegacyE2EMapping(supabase, sdId, prd) {
  if (!prd) {
    return null;
  }

  // Load legacy functions
  if (!mapE2ETestsToUserStories) {
    const e2e = await import('../map-e2e-tests-to-stories.js');
    mapE2ETestsToUserStories = e2e.mapE2ETestsToUserStories;
    validateE2ECoverage = e2e.validateE2ECoverage;
  }

  try {
    const { data: userStories } = await supabase
      .from('user_stories')
      .select('id, story_id, title, status')
      .eq('prd_id', prd.id);

    if (userStories && userStories.length > 0) {
      const e2eMapping = await mapE2ETestsToUserStories(sdId, supabase);
      const coverageResult = await validateE2ECoverage(sdId, supabase);

      if (!coverageResult.passed) {
        console.log(`   ⚠️  E2E coverage: ${coverageResult.mapped_count}/${coverageResult.total_stories} stories mapped`);
      } else {
        console.log(`   ✅ E2E test mapping complete: ${coverageResult.mapped_count} stories covered`);
      }
      return { legacy: true, e2eMapping, coverageResult };
    }
  } catch (legacyError) {
    console.log(`   ⚠️  Legacy E2E mapping error: ${legacyError.message}`);
  }

  return null;
}

/**
 * Auto-validate user stories
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD ID
 */
export async function autoValidateStories(supabase, sdId) {
  console.log('\n📋 Step 3: Auto-Validate User Stories');
  console.log('-'.repeat(50));

  try {
    const { autoValidateUserStories } = await import('../../../auto-validate-user-stories-on-exec-complete.js');
    const validationResult = await autoValidateUserStories(sdId, supabase);
    if (validationResult.success) {
      console.log(`   ✅ Validated ${validationResult.validated_count} user stories`);
    }
  } catch (error) {
    console.log(`   ⚠️  User story validation error: ${error.message}`);
  }
}

/**
 * Auto-complete deliverables
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD ID
 * @returns {Object} Deliverables status
 */
export async function autoCompleteDeliverablesForSD(supabase, sdId) {
  console.log('\n📦 Step 4: Auto-Complete Deliverables Verification');
  console.log('-'.repeat(50));

  try {
    const { autoCompleteDeliverables, checkDeliverablesNeedCompletion } = await import('../auto-complete-deliverables.js');

    const needsCompletion = await checkDeliverablesNeedCompletion(sdId, supabase);
    if (needsCompletion.needs_completion) {
      const completeResult = await autoCompleteDeliverables(sdId, supabase);
      console.log(`   ✅ Auto-completed ${completeResult.completed_count || 0} deliverables`);
      return completeResult;
    } else {
      console.log('   ℹ️  Deliverables already complete or verified by database trigger');
      return null;
    }
  } catch (error) {
    console.log(`   ⚠️  Deliverables completion error: ${error.message}`);
    return null;
  }
}
