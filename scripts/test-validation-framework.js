#!/usr/bin/env node

/**
 * Validation Framework Test Script
 *
 * Tests the intelligent validation framework with individual gates or full flows.
 *
 * Usage:
 *   node scripts/test-validation-framework.js gate1 SD-2025-001
 *   node scripts/test-validation-framework.js gate2 SD-2025-001
 *   node scripts/test-validation-framework.js gate3 SD-2025-001
 *   node scripts/test-validation-framework.js gate4 SD-2025-001
 *   node scripts/test-validation-framework.js all SD-2025-001
 *
 * Created: 2025-10-28
 * Part of: SD-INTELLIGENT-THRESHOLDS-006
 */

import { createClient } from '@supabase/supabase-js';
import { validateGate1PlanToExec, shouldValidateDesignDatabase } from './modules/design-database-gates-validation.js';
import { validateGate2ExecToPlan } from './modules/implementation-fidelity-validation.js';
import { validateGate3PlanToLead } from './modules/traceability-validation.js';
import { validateGate4LeadFinal } from './modules/workflow-roi-validation.js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Display validation results in readable format
 */
function displayResults(gateNumber, results) {
  console.log('\n' + '='.repeat(70));
  console.log(`📊 GATE ${gateNumber} VALIDATION RESULTS`);
  console.log('='.repeat(70));

  // Status
  const statusIcon = results.passed ? '✅' : '❌';
  console.log(`\n${statusIcon} Status: ${results.passed ? 'PASSED' : 'FAILED'}`);

  // Score
  console.log(`\n📈 Score: ${results.score}/${results.max_score} points (${Math.round(results.score)}%)`);

  // Adaptive Threshold
  if (results.details?.adaptive_threshold) {
    const threshold = results.details.adaptive_threshold;
    console.log(`\n🎯 Adaptive Threshold: ${threshold.finalThreshold.toFixed(1)}%`);
    console.log(`   Reasoning: ${threshold.reasoning}`);
    console.log('   Breakdown:');
    console.log(`   - Base: ${threshold.breakdown.baseThreshold}%`);
    console.log(`   - Performance Modifier: ${threshold.breakdown.performanceMod > 0 ? '+' : ''}${threshold.breakdown.performanceMod}%`);
    console.log(`   - Maturity Modifier: ${threshold.breakdown.maturityMod > 0 ? '+' : ''}${threshold.breakdown.maturityMod}%`);
    console.log(`   - Special Case Minimum: ${threshold.breakdown.specialCaseMinimum}%`);
  }

  // Pattern Stats
  if (results.details?.adaptive_threshold?.patternStats) {
    const pattern = results.details.adaptive_threshold.patternStats;
    console.log('\n📊 Pattern Statistics:');
    console.log(`   - Pattern: ${pattern.patternSignature || 'N/A'}`);
    console.log(`   - Historical SDs: ${pattern.sdCount || 0}`);
    console.log(`   - Average ROI: ${pattern.avgROI || 0}%`);
    if (pattern.sdCount > 10 && pattern.avgROI > 85) {
      console.log('   🎖️  Maturity bonus active (+5%)');
    }
  }

  // Issues
  if (results.issues && results.issues.length > 0) {
    console.log(`\n❌ Blocking Issues (${results.issues.length}):`);
    results.issues.forEach((issue, idx) => {
      console.log(`   ${idx + 1}. ${issue}`);
    });
  }

  // Warnings
  if (results.warnings && results.warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${results.warnings.length}):`);
    results.warnings.forEach((warning, idx) => {
      console.log(`   ${idx + 1}. ${warning}`);
    });
  }

  // Failed Gates
  if (results.failed_gates && results.failed_gates.length > 0) {
    console.log('\n🚫 Failed Gate Checks:');
    results.failed_gates.forEach(gate => console.log(`   - ${gate}`));
  }

  // Gate Scores Breakdown
  if (results.gate_scores && Object.keys(results.gate_scores).length > 0) {
    console.log('\n📋 Score Breakdown:');
    Object.entries(results.gate_scores).forEach(([check, score]) => {
      console.log(`   - ${check}: ${score}`);
    });
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

/**
 * Test Gate 1 (PLAN→EXEC)
 */
async function testGate1(sdId) {
  console.log('\n🧪 Testing Gate 1: DESIGN→DATABASE Workflow Validation');
  console.log(`   SD: ${sdId}`);

  // Check if validation applies
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  if (!sd) {
    console.error(`❌ SD not found: ${sdId}`);
    return;
  }

  const shouldValidate = shouldValidateDesignDatabase(sd);
  console.log(`   Validation Required: ${shouldValidate ? 'Yes' : 'No'}`);

  if (!shouldValidate) {
    console.log('   ℹ️  Gate 1 does not apply to this SD');
    return;
  }

  const results = await validateGate1PlanToExec(sdId, supabase);
  displayResults(1, results);
  return results;
}

/**
 * Test Gate 2 (EXEC→PLAN)
 */
async function testGate2(sdId) {
  console.log('\n🧪 Testing Gate 2: Implementation Fidelity Validation');
  console.log(`   SD: ${sdId}`);

  const results = await validateGate2ExecToPlan(sdId, supabase);
  displayResults(2, results);
  return results;
}

/**
 * Test Gate 3 (PLAN→LEAD)
 */
async function testGate3(sdId) {
  console.log('\n🧪 Testing Gate 3: End-to-End Traceability Validation');
  console.log(`   SD: ${sdId}`);

  const results = await validateGate3PlanToLead(sdId, supabase);
  displayResults(3, results);
  return results;
}

/**
 * Test Gate 4 (LEAD Final)
 */
async function testGate4(sdId) {
  console.log('\n🧪 Testing Gate 4: Workflow ROI & Pattern Effectiveness');
  console.log(`   SD: ${sdId}`);

  // Gather all prior gate results
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('handoff_type, metadata')
    .eq('sd_id', sdId);

  const allGateResults = {};
  if (handoffs) {
    handoffs.forEach(handoff => {
      if (handoff.handoff_type === 'PLAN-TO-EXEC' && handoff.metadata?.gate1_validation) {
        allGateResults.gate1 = handoff.metadata.gate1_validation;
      }
      if (handoff.handoff_type === 'EXEC-TO-PLAN' && handoff.metadata?.gate2_validation) {
        allGateResults.gate2 = handoff.metadata.gate2_validation;
      }
      if (handoff.handoff_type === 'PLAN-TO-LEAD' && handoff.metadata?.gate3_validation) {
        allGateResults.gate3 = handoff.metadata.gate3_validation;
      }
    });
  }

  const results = await validateGate4LeadFinal(sdId, supabase, allGateResults);
  displayResults(4, results);
  return results;
}

/**
 * Test all gates in sequence
 */
async function testAllGates(sdId) {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 TESTING ALL VALIDATION GATES');
  console.log('='.repeat(70));
  console.log(`   SD: ${sdId}`);

  const allResults = {
    gate1: null,
    gate2: null,
    gate3: null,
    gate4: null
  };

  try {
    allResults.gate1 = await testGate1(sdId);
    allResults.gate2 = await testGate2(sdId);
    allResults.gate3 = await testGate3(sdId);
    allResults.gate4 = await testGate4(sdId);

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 VALIDATION SUMMARY');
    console.log('='.repeat(70));

    const gates = [
      { num: 1, name: 'DESIGN→DATABASE', result: allResults.gate1 },
      { num: 2, name: 'Implementation Fidelity', result: allResults.gate2 },
      { num: 3, name: 'Traceability', result: allResults.gate3 },
      { num: 4, name: 'Workflow ROI', result: allResults.gate4 }
    ];

    gates.forEach(gate => {
      if (!gate.result) {
        console.log(`\nGate ${gate.num} (${gate.name}): ⚪ NOT RUN`);
        return;
      }

      const icon = gate.result.passed ? '✅' : '❌';
      const score = gate.result.score || 0;
      const maxScore = gate.result.max_score || 100;
      const threshold = gate.result.details?.adaptive_threshold?.finalThreshold || 80;

      console.log(`\nGate ${gate.num} (${gate.name}): ${icon} ${gate.result.passed ? 'PASSED' : 'FAILED'}`);
      console.log(`   Score: ${score}/${maxScore} (${Math.round(score)}%)`);
      console.log(`   Threshold: ${threshold.toFixed(1)}%`);
      console.log(`   Issues: ${gate.result.issues?.length || 0}`);
      console.log(`   Warnings: ${gate.result.warnings?.length || 0}`);
    });

    const allPassed = gates.every(g => !g.result || g.result.passed);
    console.log('\n' + '='.repeat(70));
    console.log(allPassed ? '✅ ALL GATES PASSED' : '❌ SOME GATES FAILED');
    console.log('='.repeat(70) + '\n');

  } catch (error) {
    console.error('\n❌ Error during validation:', error.message);
    console.error(error.stack);
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Validation Framework Test Script

Usage:
  node scripts/test-validation-framework.js <gate> <sd-id>

Gates:
  gate1    Test Gate 1 (DESIGN→DATABASE workflow)
  gate2    Test Gate 2 (Implementation fidelity)
  gate3    Test Gate 3 (End-to-end traceability)
  gate4    Test Gate 4 (Workflow ROI & pattern effectiveness)
  all      Test all gates in sequence

Example:
  node scripts/test-validation-framework.js gate2 SD-2025-001
  node scripts/test-validation-framework.js all SD-2025-001
    `);
    process.exit(1);
  }

  const [gate, sdId] = args;

  console.log('\n🚀 Validation Framework Test Suite');
  console.log('='.repeat(70));

  try {
    switch (gate.toLowerCase()) {
      case 'gate1':
        await testGate1(sdId);
        break;
      case 'gate2':
        await testGate2(sdId);
        break;
      case 'gate3':
        await testGate3(sdId);
        break;
      case 'gate4':
        await testGate4(sdId);
        break;
      case 'all':
        await testAllGates(sdId);
        break;
      default:
        console.error(`❌ Unknown gate: ${gate}`);
        console.log('   Valid gates: gate1, gate2, gate3, gate4, all');
        process.exit(1);
    }

    console.log('✅ Test completed successfully\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
