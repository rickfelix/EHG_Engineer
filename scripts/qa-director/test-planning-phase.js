/**
 * QA Engineering Director - Test Planning Phase
 * Test tier selection, infrastructure discovery, test plan generation
 */

import { selectTestTier } from '../modules/qa/test-tier-selector.js';
import { discoverAndRecommend } from '../modules/qa/infrastructure-discovery.js';
import { generateTestPlan, storeTestPlan } from '../modules/qa/test-plan-generator.js';

/**
 * Execute test planning phase
 * @param {Object} supabase - Supabase client
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} sd - Strategic Directive object
 * @param {Object} options - Execution options
 * @returns {Promise<Object>} Test planning results
 */
export async function executeTestPlanningPhase(supabase, sd_id, sd, options) {
  const { targetApp, skipTestPlanGeneration } = options;
  const testPlanResults = {};

  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 PHASE 2: SMART TEST PLANNING');
  console.log('───────────────────────────────────────────────────────────\n');

  // 2.0: BMAD Enhancement - Generate Comprehensive Test Plan
  if (!skipTestPlanGeneration) {
    console.log('📋 BMAD Enhancement: Generating comprehensive test plan...');
    try {
      const testPlan = await generateTestPlan(sd_id, supabase, {});

      // Store test plan in database
      const { id: testPlanId } = await storeTestPlan(testPlan, supabase);

      testPlanResults.test_plan = {
        id: testPlanId,
        unit_tests: testPlan.unit_test_strategy.test_cases.length,
        e2e_tests: testPlan.e2e_test_strategy.test_cases.length,
        integration_tests: testPlan.integration_test_strategy.test_cases.length,
        performance_tests: testPlan.performance_test_strategy.test_cases.length,
        user_story_mapping: testPlan.e2e_test_strategy.user_story_mapping.length,
        coverage_requirement: testPlan.e2e_test_strategy.coverage_requirement
      };

      console.log('   ✅ Test plan generated and stored');
      console.log(`   Unit Tests: ${testPlan.unit_test_strategy.test_cases.length} cases`);
      console.log(`   E2E Tests: ${testPlan.e2e_test_strategy.test_cases.length} cases`);
      console.log(`   User Story Coverage: ${testPlan.e2e_test_strategy.user_story_mapping.length} stories\n`);
    } catch (error) {
      console.error(`   ⚠️  Test plan generation failed: ${error.message}`);
      console.log('   Continuing with legacy test tier selection...\n');
    }
  }

  // 2.1: Test Tier Selection
  console.log('🎯 Selecting appropriate test tier...');
  const tierResult = await selectTestTier(sd);
  testPlanResults.tier_selection = tierResult;

  console.log(`   Primary Tier: ${tierResult.primary_tier.name}`);
  console.log(`   Estimated Time: ${tierResult.total_estimated_time_display}`);
  console.log(`   Rationale: ${tierResult.rationale}\n`);

  // 2.2: Infrastructure Discovery
  console.log('🔍 Discovering test infrastructure...');
  const infraResult = await discoverAndRecommend(targetApp);
  testPlanResults.infrastructure = infraResult;

  console.log(`   Auth Helpers: ${infraResult.summary.auth_available ? '✅ Available' : '❌ Missing'}`);
  console.log(`   Test Helpers: ${infraResult.summary.helpers_count} found`);
  console.log(`   Fixtures: ${infraResult.summary.fixtures_count} found`);
  console.log(`   E2E Examples: ${infraResult.summary.e2e_examples} found`);
  console.log(`   Recommendations: ${infraResult.recommendations.length}\n`);

  // MCP Testing Suggestion
  console.log('💡 PLAYWRIGHT MCP AVAILABLE FOR INTERACTIVE TESTING');
  console.log('───────────────────────────────────────────────────────────');
  console.log('   Before running the full automated suite, consider:');
  console.log('   • Interactive browser control via Playwright MCP');
  console.log('   • Instant visual feedback (see what\'s happening)');
  console.log('   • Screenshot evidence capture');
  console.log('   • Fast iteration for debugging failing tests');
  console.log('');
  console.log('   📚 Use MCP Test Suggester to generate commands:');
  console.log('      node scripts/modules/qa/mcp-test-suggester.js <SD-ID>');
  console.log('');
  console.log('   🎯 MCP is ideal for EXEC phase iteration');
  console.log('   ⚙️  Automated suite (below) is for PLAN verification');
  console.log('───────────────────────────────────────────────────────────\n');

  return testPlanResults;
}
