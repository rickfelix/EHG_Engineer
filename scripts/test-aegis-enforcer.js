#!/usr/bin/env node

/**
 * AEGIS Enforcement Engine Test Script
 *
 * Tests the AegisEnforcer against various contexts to verify:
 * 1. Rule loading from database
 * 2. Validation logic for each validator type
 * 3. Violation recording
 * 4. Enforcement (blocking vs warning)
 *
 * @module scripts/test-aegis-enforcer
 */

import dotenv from 'dotenv';
dotenv.config();

import {
  AegisEnforcer,
  AegisRuleLoader,
  AegisViolationRecorder,
  AEGIS_CONSTITUTIONS
} from '../lib/governance/aegis/index.js';

// Test results tracking
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${name}`);
  if (details) {
    console.log(`   ${details}`);
  }
  results.tests.push({ name, passed, details });
  if (passed) results.passed++;
  else results.failed++;
}

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('AEGIS ENFORCEMENT ENGINE TEST SUITE');
  console.log('='.repeat(60) + '\n');

  const enforcer = new AegisEnforcer();
  const ruleLoader = new AegisRuleLoader();

  // =========================================================================
  // TEST 1: Rule Loading
  // =========================================================================
  console.log('\n--- Test 1: Rule Loading ---\n');

  try {
    const constitutions = await ruleLoader.loadConstitutions();
    logTest('Load constitutions', constitutions.length === 7,
      `Found ${constitutions.length} constitutions`);

    const allRules = await ruleLoader.loadRules();
    logTest('Load all rules', allRules.length >= 20,
      `Found ${allRules.length} rules`);

    const protocolRules = await ruleLoader.loadRulesForConstitution('PROTOCOL');
    logTest('Load PROTOCOL rules', protocolRules.length === 9,
      `Found ${protocolRules.length} PROTOCOL rules`);

    const oathRules = await ruleLoader.loadRulesForConstitution('FOUR_OATHS');
    logTest('Load FOUR_OATHS rules', oathRules.length === 9,
      `Found ${oathRules.length} FOUR_OATHS rules`);

  } catch (err) {
    logTest('Rule loading', false, err.message);
  }

  // =========================================================================
  // TEST 2: PROTOCOL Constitution - CONST-001 (GOVERNED tier approval)
  // =========================================================================
  console.log('\n--- Test 2: CONST-001 - GOVERNED Tier Approval ---\n');

  try {
    // Should FAIL: GOVERNED tier with auto_applicable=true
    // Include required fields from CONST-003 to isolate CONST-001 test
    const result1 = await enforcer.validate('PROTOCOL', {
      risk_tier: 'GOVERNED',
      auto_applicable: true,
      target_table: 'protocol_improvement_queue',
      actor: 'test',
      timestamp: new Date().toISOString(),
      payload: { test: true }
    }, { recordViolations: false, incrementStats: false });

    logTest('CONST-001: Block GOVERNED auto-apply',
      !result1.passed && result1.violations.some(v => v.rule_code === 'CONST-001'),
      result1.violations.length > 0 ? result1.violations[0].message : 'No violation');

    // Should PASS: AUTO tier with auto_applicable=true
    const result2 = await enforcer.validate('PROTOCOL', {
      risk_tier: 'AUTO',
      auto_applicable: true,
      target_table: 'protocol_improvement_queue'
    }, { recordViolations: false, incrementStats: false });

    // Note: May still fail due to CONST-007 (velocity limit) - that's expected
    const const001Passed = !result2.violations.some(v => v.rule_code === 'CONST-001');
    logTest('CONST-001: Allow AUTO tier', const001Passed,
      'AUTO tier not blocked by CONST-001');

  } catch (err) {
    logTest('CONST-001 tests', false, err.message);
  }

  // =========================================================================
  // TEST 3: PROTOCOL Constitution - CONST-002 (Self-approval prevention)
  // =========================================================================
  console.log('\n--- Test 3: CONST-002 - Self-Approval Prevention ---\n');

  try {
    // Should FAIL: Same model family evaluating own proposal
    const result1 = await enforcer.validate('PROTOCOL', {
      evaluator_model: 'claude-3-sonnet',
      proposer_model: 'claude-3-opus',
      target_table: 'protocol_improvement_queue'
    }, { recordViolations: false, incrementStats: false });

    logTest('CONST-002: Block same family evaluation',
      result1.violations.some(v => v.rule_code === 'CONST-002'),
      'Same model family (anthropic) blocked');

    // Should PASS: Different model families
    const result2 = await enforcer.validate('PROTOCOL', {
      evaluator_model: 'gpt-4',
      proposer_model: 'claude-3-opus',
      target_table: 'protocol_improvement_queue'
    }, { recordViolations: false, incrementStats: false });

    const const002Passed = !result2.violations.some(v => v.rule_code === 'CONST-002');
    logTest('CONST-002: Allow different families', const002Passed,
      'Different model families (openai/anthropic) allowed');

  } catch (err) {
    logTest('CONST-002 tests', false, err.message);
  }

  // =========================================================================
  // TEST 4: PROTOCOL Constitution - CONST-005 (Database-first)
  // =========================================================================
  console.log('\n--- Test 4: CONST-005 - Database First ---\n');

  try {
    // Should FAIL: Missing target_table
    const result1 = await enforcer.validate('PROTOCOL', {
      risk_tier: 'AUTO'
    }, { recordViolations: false, incrementStats: false });

    logTest('CONST-005: Require target_table',
      result1.violations.some(v => v.rule_code === 'CONST-005'),
      'Missing target_table blocked');

    // Should FAIL: Targeting markdown file
    const result2 = await enforcer.validate('PROTOCOL', {
      target_table: 'CLAUDE.md',
      risk_tier: 'AUTO'
    }, { recordViolations: false, incrementStats: false });

    logTest('CONST-005: Block markdown targets',
      result2.violations.some(v => v.rule_code === 'CONST-005'),
      'Markdown file target blocked');

    // Should PASS: Valid database table
    const result3 = await enforcer.validate('PROTOCOL', {
      target_table: 'protocol_improvement_queue',
      risk_tier: 'AUTO'
    }, { recordViolations: false, incrementStats: false });

    const const005Passed = !result3.violations.some(v => v.rule_code === 'CONST-005');
    logTest('CONST-005: Allow database table', const005Passed,
      'Database table target allowed');

  } catch (err) {
    logTest('CONST-005 tests', false, err.message);
  }

  // =========================================================================
  // TEST 5: FOUR_OATHS - OATH-1 (Transparency)
  // =========================================================================
  console.log('\n--- Test 5: OATH-1 - Transparency ---\n');

  try {
    // Should FAIL: Missing required fields
    const result1 = await enforcer.validate('FOUR_OATHS', {
      input: 'test input'
      // missing: reasoning, output, confidence
    }, { recordViolations: false, incrementStats: false });

    logTest('OATH-1: Require decision fields',
      result1.violations.some(v => v.rule_code === 'OATH-1'),
      'Missing reasoning/output/confidence blocked');

    // Should FAIL: Reasoning too short
    const result2 = await enforcer.validate('FOUR_OATHS', {
      input: 'test input',
      reasoning: 'short',
      output: 'test output',
      confidence: 0.8
    }, { recordViolations: false, incrementStats: false });

    logTest('OATH-1: Require min reasoning length',
      result2.violations.some(v => v.rule_code === 'OATH-1'),
      'Short reasoning blocked (min 10 chars)');

    // Should PASS: All fields present with adequate reasoning
    const result3 = await enforcer.validate('FOUR_OATHS', {
      input: 'test input',
      reasoning: 'This is adequate reasoning for the decision made',
      output: 'test output',
      confidence: 0.8
    }, { recordViolations: false, incrementStats: false });

    const oath1Passed = !result3.violations.some(v => v.rule_code === 'OATH-1');
    logTest('OATH-1: Allow complete decision', oath1Passed,
      'Complete decision with adequate reasoning allowed');

  } catch (err) {
    logTest('OATH-1 tests', false, err.message);
  }

  // =========================================================================
  // TEST 6: FOUR_OATHS - OATH-2 (Boundaries/Authority)
  // =========================================================================
  console.log('\n--- Test 6: OATH-2 - Boundaries ---\n');

  try {
    // Should FAIL: L4_CREW exceeding spend limit
    const result1 = await enforcer.validate('FOUR_OATHS', {
      agentLevel: 'L4_CREW',
      spendAmount: 100,
      input: 'test', reasoning: 'test reasoning here', output: 'test', confidence: 0.95
    }, { recordViolations: false, incrementStats: false });

    logTest('OATH-2: Block L4_CREW overspend',
      result1.violations.some(v => v.rule_code === 'OATH-2'),
      'L4_CREW spending $100 blocked (limit $0)');

    // Should PASS: L3_VP within spend limit
    const result2 = await enforcer.validate('FOUR_OATHS', {
      agentLevel: 'L3_VP',
      spendAmount: 25,
      input: 'test', reasoning: 'test reasoning here', output: 'test', confidence: 0.85
    }, { recordViolations: false, incrementStats: false });

    const oath2Passed = !result2.violations.some(v => v.rule_code === 'OATH-2');
    logTest('OATH-2: Allow L3_VP within limit', oath2Passed,
      'L3_VP spending $25 allowed (limit $50)');

  } catch (err) {
    logTest('OATH-2 tests', false, err.message);
  }

  // =========================================================================
  // TEST 7: FOUR_OATHS - OATH-3 (Escalation Integrity)
  // =========================================================================
  console.log('\n--- Test 7: OATH-3 - Escalation Integrity ---\n');

  try {
    // Should FAIL: L4_CREW with low confidence, no escalation
    const result1 = await enforcer.validate('FOUR_OATHS', {
      agentLevel: 'L4_CREW',
      confidence: 0.7,
      escalated: false,
      input: 'test', reasoning: 'test reasoning here', output: 'test'
    }, { recordViolations: false, incrementStats: false });

    logTest('OATH-3: Require escalation for low confidence',
      result1.violations.some(v => v.rule_code === 'OATH-3'),
      'L4_CREW at 0.7 confidence without escalation blocked');

    // Should PASS: L4_CREW with high confidence
    const result2 = await enforcer.validate('FOUR_OATHS', {
      agentLevel: 'L4_CREW',
      confidence: 0.96,
      escalated: false,
      input: 'test', reasoning: 'test reasoning here', output: 'test'
    }, { recordViolations: false, incrementStats: false });

    const oath3Passed = !result2.violations.some(v => v.rule_code === 'OATH-3');
    logTest('OATH-3: Allow high confidence without escalation', oath3Passed,
      'L4_CREW at 0.96 confidence allowed (threshold 0.95)');

  } catch (err) {
    logTest('OATH-3 tests', false, err.message);
  }

  // =========================================================================
  // TEST 8: FOUR_OATHS - OATH-4 (Non-Deception)
  // =========================================================================
  console.log('\n--- Test 8: OATH-4 - Non-Deception ---\n');

  try {
    // Should FAIL: Confidence out of bounds
    const result1 = await enforcer.validate('FOUR_OATHS', {
      confidence: 1.5,
      input: 'test', reasoning: 'test reasoning here', output: 'test'
    }, { recordViolations: false, incrementStats: false });

    logTest('OATH-4: Block invalid confidence',
      result1.violations.some(v => v.rule_code === 'OATH-4'),
      'Confidence 1.5 blocked (max 1.0)');

    // Should PASS: Valid confidence
    const result2 = await enforcer.validate('FOUR_OATHS', {
      confidence: 0.85,
      input: 'test', reasoning: 'test reasoning here', output: 'test'
    }, { recordViolations: false, incrementStats: false });

    const oath4Passed = !result2.violations.some(v => v.rule_code === 'OATH-4');
    logTest('OATH-4: Allow valid confidence', oath4Passed,
      'Confidence 0.85 allowed');

  } catch (err) {
    logTest('OATH-4 tests', false, err.message);
  }

  // =========================================================================
  // TEST 9: DOCTRINE - LAW-1 (Venture Protection)
  // =========================================================================
  console.log('\n--- Test 9: LAW-1 - Doctrine of Constraint ---\n');

  try {
    // Should FAIL: Non-chairman trying to delete venture
    const result1 = await enforcer.validate('DOCTRINE', {
      actor_role: 'L1_EVA',
      operation_type: 'DELETE',
      target_table: 'ventures'
    }, { recordViolations: false, incrementStats: false });

    logTest('LAW-1: Block non-chairman venture deletion',
      result1.violations.some(v => v.rule_code === 'LAW-1'),
      'L1_EVA deleting ventures blocked');

    // Should PASS: Chairman deleting venture
    const result2 = await enforcer.validate('DOCTRINE', {
      actor_role: 'chairman',
      operation_type: 'DELETE',
      target_table: 'ventures'
    }, { recordViolations: false, incrementStats: false });

    const law1Passed = !result2.violations.some(v => v.rule_code === 'LAW-1');
    logTest('LAW-1: Allow chairman venture deletion', law1Passed,
      'Chairman deleting ventures allowed');

  } catch (err) {
    logTest('LAW-1 tests', false, err.message);
  }

  // =========================================================================
  // TEST 10: Enforcement (throws on blocking violations)
  // =========================================================================
  console.log('\n--- Test 10: Enforcement Mode ---\n');

  try {
    // Should throw AegisViolationError
    let threw = false;
    try {
      await enforcer.enforce('PROTOCOL', {
        risk_tier: 'GOVERNED',
        auto_applicable: true
      }, { recordViolations: false, incrementStats: false });
    } catch (err) {
      threw = err.name === 'AegisViolationError';
    }

    logTest('enforce() throws on blocking violation', threw,
      'AegisViolationError thrown for GOVERNED auto-apply');

  } catch (err) {
    logTest('Enforcement mode test', false, err.message);
  }

  // =========================================================================
  // TEST 11: Violation Recording
  // =========================================================================
  console.log('\n--- Test 11: Violation Recording ---\n');

  try {
    const recorder = new AegisViolationRecorder();

    // Get rule and constitution IDs
    const rule = await ruleLoader.loadRule('PROTOCOL', 'CONST-001');
    const constitution = await ruleLoader.getConstitution('PROTOCOL');

    if (!rule || !constitution) {
      logTest('Get rule and constitution', false,
        `Rule: ${rule ? 'found' : 'not found'}, Constitution: ${constitution ? 'found' : 'not found'}`);
    } else {
      logTest('Get rule and constitution', true,
        `Rule ID: ${rule.id.slice(0, 8)}..., Constitution ID: ${constitution.id.slice(0, 8)}...`);
    }

    // Record a test violation
    const testViolation = await recorder.recordViolation({
      rule_id: rule?.id,
      constitution_id: constitution?.id,
      violation_type: 'custom',
      severity: 'HIGH',
      message: 'Test violation from enforcement engine test',
      actor_role: 'TEST',
      actor_id: 'test-aegis-enforcer.js',
      sd_key: 'SD-AEGIS-TEST-001'
    });

    logTest('Record violation', testViolation.recorded,
      testViolation.recorded ? `Violation ID: ${testViolation.id}` : testViolation.error);

    // Verify it appears in open violations
    const violations = await recorder.getViolations({ status: 'open', limit: 5 });
    const found = violations.some(v => v.id === testViolation.id);
    logTest('Retrieve recorded violation', found,
      `Found ${violations.length} open violations`);

    // Mark as false positive (cleanup)
    if (testViolation.id) {
      const cleanup = await recorder.markFalsePositive(
        testViolation.id,
        'Test violation - cleanup',
        'test-script'
      );
      logTest('Mark violation as false positive', cleanup.success,
        'Test violation cleaned up');
    }

  } catch (err) {
    logTest('Violation recording tests', false, err.message);
  }

  // =========================================================================
  // TEST 12: ValidateAll (multiple constitutions)
  // =========================================================================
  console.log('\n--- Test 12: ValidateAll (Multiple Constitutions) ---\n');

  try {
    const result = await enforcer.validateAll({
      risk_tier: 'AUTO',
      target_table: 'protocol_improvement_queue',
      agentLevel: 'L3_VP',
      confidence: 0.9,
      input: 'test',
      reasoning: 'adequate test reasoning here',
      output: 'test result'
    }, { recordViolations: false, incrementStats: false });

    logTest('validateAll() runs multiple constitutions',
      result.constitutionsChecked >= 4,
      `Checked ${result.constitutionsChecked} constitutions, ${result.totalViolations} violations, ${result.totalWarnings} warnings`);

  } catch (err) {
    logTest('ValidateAll test', false, err.message);
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`\nTotal: ${results.passed + results.failed} tests`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`\nResult: ${results.failed === 0 ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  console.log('');

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
