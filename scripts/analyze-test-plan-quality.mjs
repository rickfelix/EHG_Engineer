#!/usr/bin/env node
/**
 * Test Plan Quality Analysis Script
 *
 * Analyzes existing test plans for boilerplate test case usage.
 * Used to retroactively flag low-quality test plans.
 *
 * @see SD-CAPABILITY-LIFECYCLE-001
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validateTestPlanQuality } from './modules/test-plan-quality-validation.js';

// Load .env first, then .env.test.local for overrides
dotenv.config();
dotenv.config({ path: '.env.test.local' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeTestPlans() {
  console.log('='.repeat(70));
  console.log('TEST PLAN QUALITY ANALYSIS');
  console.log('SD-CAPABILITY-LIFECYCLE-001 - Boilerplate Detection');
  console.log('='.repeat(70));

  // Fetch all test plans
  const { data: testPlans, error } = await supabase
    .from('test_plans')
    .select(`
      id,
      sd_id,
      created_at,
      created_by,
      unit_test_strategy,
      e2e_test_strategy,
      integration_test_strategy,
      performance_test_strategy,
      test_data_requirements
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching test plans:', error.message);
    process.exit(1);
  }

  console.log(`\nFound ${testPlans.length} test plans\n`);

  const results = {
    total: testPlans.length,
    passing: 0,
    failing: 0,
    byScore: {
      excellent: 0,  // 90-100
      good: 0,       // 80-89
      acceptable: 0, // 70-79
      poor: 0        // <70
    },
    byBoilerplatePercent: {
      none: 0,       // 0%
      low: 0,        // 1-25%
      medium: 0,     // 26-50%
      high: 0,       // 51-75%
      critical: 0    // >75%
    },
    failingPlans: [],
    scoreDistribution: [],
    totalE2ETests: 0,
    totalUnitTests: 0,
    boilerplateE2ETests: 0
  };

  for (const testPlan of testPlans) {
    const result = validateTestPlanQuality(testPlan);
    results.scoreDistribution.push(result.score);

    // Count tests
    const e2eCount = testPlan.e2e_test_strategy?.test_cases?.length || 0;
    const unitCount = testPlan.unit_test_strategy?.test_cases?.length || 0;
    results.totalE2ETests += e2eCount;
    results.totalUnitTests += unitCount;
    results.boilerplateE2ETests += result.boilerplateDetails?.e2e_boilerplate_count || 0;

    // Score distribution
    if (result.score >= 90) results.byScore.excellent++;
    else if (result.score >= 80) results.byScore.good++;
    else if (result.score >= 70) results.byScore.acceptable++;
    else results.byScore.poor++;

    // Boilerplate percentage distribution
    const boilerplatePercent = result.boilerplateDetails?.e2e_boilerplate_percentage || 0;
    if (boilerplatePercent === 0) results.byBoilerplatePercent.none++;
    else if (boilerplatePercent <= 25) results.byBoilerplatePercent.low++;
    else if (boilerplatePercent <= 50) results.byBoilerplatePercent.medium++;
    else if (boilerplatePercent <= 75) results.byBoilerplatePercent.high++;
    else results.byBoilerplatePercent.critical++;

    // Pass/fail
    if (result.score >= 70 && boilerplatePercent <= 50) {
      results.passing++;
    } else {
      results.failing++;
      results.failingPlans.push({
        sd_id: testPlan.sd_id,
        score: result.score,
        boilerplate_percent: boilerplatePercent,
        e2e_tests: e2eCount,
        unit_tests: unitCount,
        issues: result.issues,
        warnings: result.warnings.slice(0, 3)
      });
    }
  }

  // Calculate average score
  const avgScore = results.scoreDistribution.length > 0
    ? Math.round(results.scoreDistribution.reduce((a, b) => a + b, 0) / results.scoreDistribution.length)
    : 0;

  // Print results
  console.log('=== SUMMARY ===');
  console.log(`Total Test Plans: ${results.total}`);
  console.log(`Average Quality Score: ${avgScore}%`);
  console.log(`Passing (score>=70, boilerplate<=50%): ${results.passing} (${results.total > 0 ? Math.round(results.passing / results.total * 100) : 0}%)`);
  console.log(`Failing: ${results.failing} (${results.total > 0 ? Math.round(results.failing / results.total * 100) : 0}%)`);

  console.log('\n=== TEST COUNTS ===');
  console.log(`Total E2E Tests: ${results.totalE2ETests}`);
  console.log(`Total Unit Tests: ${results.totalUnitTests}`);
  console.log(`Boilerplate E2E Tests: ${results.boilerplateE2ETests} (${results.totalE2ETests > 0 ? Math.round(results.boilerplateE2ETests / results.totalE2ETests * 100) : 0}%)`);

  console.log('\n=== SCORE DISTRIBUTION ===');
  console.log(`Excellent (90-100): ${results.byScore.excellent}`);
  console.log(`Good (80-89): ${results.byScore.good}`);
  console.log(`Acceptable (70-79): ${results.byScore.acceptable}`);
  console.log(`Poor (<70): ${results.byScore.poor}`);

  console.log('\n=== BOILERPLATE PERCENTAGE DISTRIBUTION ===');
  console.log(`None (0%): ${results.byBoilerplatePercent.none}`);
  console.log(`Low (1-25%): ${results.byBoilerplatePercent.low}`);
  console.log(`Medium (26-50%): ${results.byBoilerplatePercent.medium}`);
  console.log(`High (51-75%): ${results.byBoilerplatePercent.high}`);
  console.log(`Critical (>75%): ${results.byBoilerplatePercent.critical}`);

  if (results.failingPlans.length > 0) {
    console.log('\n=== TEST PLANS THAT WOULD FAIL NEW VALIDATION ===');
    // Sort by score (worst first)
    results.failingPlans.sort((a, b) => a.score - b.score);

    for (const plan of results.failingPlans.slice(0, 10)) {
      console.log(`\n${plan.sd_id}: ${plan.score}% (${plan.boilerplate_percent}% boilerplate)`);
      console.log(`  E2E Tests: ${plan.e2e_tests}, Unit Tests: ${plan.unit_tests}`);
      if (plan.issues.length > 0) {
        console.log(`  Issues:`);
        for (const issue of plan.issues.slice(0, 2)) {
          console.log(`    - ${issue}`);
        }
      }
    }

    if (results.failingPlans.length > 10) {
      console.log(`\n... and ${results.failingPlans.length - 10} more failing test plans`);
    }
  }

  console.log('\n=== COMMON BOILERPLATE PATTERNS FOUND ===');
  console.log('1. user_actions: ["Navigate to feature", "Interact with UI", "Verify behavior"]');
  console.log('2. expected_outcomes: ["Feature works as expected", "No errors occur", "Data is correct"]');
  console.log('3. descriptions: "E2E test validating acceptance criteria for user story..."');
  console.log('4. Empty test_data: {}');

  console.log('\n=== RECOMMENDATION ===');
  if (results.failing > results.total * 0.2) {
    console.log('WARNING: >20% of test plans would fail new validation.');
    console.log('Consider:');
    console.log('  1. Updating TESTING sub-agent to generate specific user_actions and expected_outcomes');
    console.log('  2. Replace generic patterns with UI selectors and specific assertions');
    console.log('  3. Add test_data with concrete input values');
  } else {
    console.log('Quality level acceptable. New validation will block future boilerplate test plans.');
  }

  console.log('\n' + '='.repeat(70));
}

analyzeTestPlans().catch(console.error);
