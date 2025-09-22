#!/usr/bin/env node

/**
 * Gate 2D: NFR & Test Plan
 * 
 * Validates:
 * - nfrBudgetsPresent: Performance/bundle budgets within limits
 * - coverageTargetSet: ≥80% coverage target
 * - testPlanMatrices: All 5 test types covered
 */

import { exit } from 'node:process';
import { getDb } from './lib/db';
import { scoreGate, formatGateResults, Check } from './lib/score';
import { getRulesForGate, getPRDDetails, storeGateReview } from './lib/rules';
import { areNFRBudgetsValid, hasAllTestMatrices, safeJsonParse } from './lib/evidence';

(async () => {
  const prdId = process.env.PRD_ID;
  if (!prdId) {
    console.error('❌ PRD_ID environment variable is required');
    exit(2);
  }

  console.log('🔍 Running Gate 2D: NFR & Test Plan');
  console.log(`PRD: ${prdId}`);

  // Get PRD details
  const prdDetails = await getPRDDetails(prdId);
  if (!prdDetails) {
    console.error(`❌ PRD ${prdId} not found in database`);
    exit(2);
  }

  console.log(`Title: ${prdDetails.title}`);
  console.log(`SD: ${prdDetails.sd_id || 'None'}`);
  console.log('');

  const db = await getDb();
  const rules = await getRulesForGate('2D');

  // Define checks for each rule
  const checks: Record<string, Check> = {
    async nfrBudgetsPresent() {
      // Check NFR requirements
      const { data: nfr, error } = await db
        .from('leo_nfr_requirements')
        .select('perf_budget_ms, bundle_kb')
        .eq('prd_id', prdId)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
        console.error('  Failed to check NFR requirements:', error.message);
        return false;
      }
      
      if (!nfr) {
        console.log('  No NFR requirements defined');
        return false;
      }
      
      // Get criteria from rule (if any)
      const rule = rules.find(r => r.rule_name === 'nfrBudgetsPresent');
      const criteria = safeJsonParse(rule?.criteria) || {
        perf_p95_ms: { max: 3000 },
        bundle_kb: { max: 500 }
      };
      
      console.log(`  Performance budget: ${nfr.perf_budget_ms ?? 'Not set'}ms (max: ${criteria.perf_p95_ms?.max}ms)`);
      console.log(`  Bundle size budget: ${nfr.bundle_kb ?? 'Not set'}KB (max: ${criteria.bundle_kb?.max}KB)`);
      
      // Check if budgets are set and within limits
      const hasPerf = nfr.perf_budget_ms !== null && nfr.perf_budget_ms > 0;
      const hasBundle = nfr.bundle_kb !== null && nfr.bundle_kb > 0;
      
      if (!hasPerf || !hasBundle) {
        console.log('  Missing budget definitions');
        return false;
      }
      
      return areNFRBudgetsValid(nfr, criteria);
    },

    async coverageTargetSet() {
      // Check test plan coverage target
      const { data: testPlan, error } = await db
        .from('leo_test_plans')
        .select('coverage_target')
        .eq('prd_id', prdId)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
        console.error('  Failed to check test plan:', error.message);
        return false;
      }
      
      if (!testPlan) {
        console.log('  No test plan defined');
        return false;
      }
      
      const target = testPlan.coverage_target ?? 0;
      console.log(`  Coverage target: ${target}%`);
      
      return target >= 80;
    },

    async testPlanMatrices() {
      // Check test plan matrices
      const { data: testPlan, error } = await db
        .from('leo_test_plans')
        .select('matrices')
        .eq('prd_id', prdId)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
        console.error('  Failed to check test plan:', error.message);
        return false;
      }
      
      if (!testPlan) {
        console.log('  No test plan defined');
        return false;
      }
      
      const matrices = safeJsonParse(testPlan.matrices);
      const required = ['unit', 'integration', 'e2e', 'a11y', 'perf'];
      
      console.log('  Test matrices:');
      required.forEach(matrix => {
        const exists = matrices && matrices[matrix];
        console.log(`    - ${matrix}: ${exists ? '✓' : '✗'}`);
      });
      
      return hasAllTestMatrices(matrices, required);
    },
  };

  // Score the gate
  const { score, results } = await scoreGate(rules, checks);

  // Format and display results
  console.log(formatGateResults('2D', { score, results }));

  // Store review in database
  await storeGateReview(prdId, '2D', score, results);

  // Exit with appropriate code
  if (score < 85) {
    console.log(`\n❌ Gate 2D failed: ${score}% < 85%`);
    exit(1);
  } else {
    console.log(`\n✅ Gate 2D passed: ${score}%`);
    exit(0);
  }
})().catch((error) => {
  console.error('❌ Gate runner failed:', error);
  exit(2);
});