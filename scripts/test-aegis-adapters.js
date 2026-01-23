#!/usr/bin/env node

/**
 * AEGIS Adapter Integration Test
 *
 * Tests that the adapters correctly wrap the legacy interfaces
 * and route through AEGIS for unified governance.
 *
 * @module scripts/test-aegis-adapters
 */

import dotenv from 'dotenv';
dotenv.config();

import { ConstitutionAdapter } from '../lib/governance/aegis/adapters/ConstitutionAdapter.js';
import { FourOathsAdapter, getFourOathsAdapter } from '../lib/governance/aegis/adapters/FourOathsAdapter.js';

// Test results tracking
const results = { passed: 0, failed: 0 };

function logTest(name, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${name}`);
  if (details) console.log(`   ${details}`);
  if (passed) results.passed++; else results.failed++;
}

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('AEGIS ADAPTER INTEGRATION TESTS');
  console.log('='.repeat(60) + '\n');

  // =========================================================================
  // TEST 1: ConstitutionAdapter - Basic Validation
  // =========================================================================
  console.log('\n--- ConstitutionAdapter Tests ---\n');

  const constitutionAdapter = new ConstitutionAdapter();

  try {
    // Test rule loading
    const rules = await constitutionAdapter.loadRules();
    logTest('ConstitutionAdapter: Load rules', rules.length === 9,
      `Loaded ${rules.length} rules`);

    // Test AEGIS mode validation - should fail for GOVERNED auto-apply
    const result1 = await constitutionAdapter.validate({
      risk_tier: 'GOVERNED',
      auto_applicable: true,
      target_table: 'protocol_improvement_queue'
    }, {});

    logTest('ConstitutionAdapter: Block GOVERNED auto-apply via AEGIS',
      !result1.passed && result1.violations.some(v => v.rule_code === 'CONST-001'),
      `AEGIS enabled: ${result1.aegis_enabled}, Violations: ${result1.violations.length}`);

    // Test valid improvement
    const result2 = await constitutionAdapter.validate({
      risk_tier: 'AUTO',
      auto_applicable: true,
      target_table: 'protocol_improvement_queue'
    }, {
      evaluator_model: 'gpt-4',
      proposer_model: 'claude-3-sonnet'
    });

    const passedAutoTier = !result2.violations.some(v =>
      v.rule_code === 'CONST-001' || v.rule_code === 'CONST-002' || v.rule_code === 'CONST-005'
    );
    logTest('ConstitutionAdapter: Allow valid AUTO improvement',
      passedAutoTier,
      `AEGIS enabled: ${result2.aegis_enabled}`);

    // Test legacy mode fallback
    constitutionAdapter.setAegisMode(false);
    const result3 = await constitutionAdapter.validate({
      risk_tier: 'GOVERNED',
      auto_applicable: true,
      target_table: 'protocol_improvement_queue'
    }, {});

    logTest('ConstitutionAdapter: Legacy fallback works',
      !result3.passed && result3.aegis_enabled === false,
      `AEGIS enabled: ${result3.aegis_enabled}`);

    // Re-enable AEGIS
    constitutionAdapter.setAegisMode(true);

  } catch (err) {
    logTest('ConstitutionAdapter tests', false, err.message);
  }

  // =========================================================================
  // TEST 2: FourOathsAdapter - Transparency Oath
  // =========================================================================
  console.log('\n--- FourOathsAdapter Tests ---\n');

  const oathsAdapter = getFourOathsAdapter();

  try {
    // Test OATH-1: Transparency - missing fields
    const result1 = await oathsAdapter.validateTransparency({
      input: 'test'
      // missing: reasoning, output, confidence
    });

    logTest('FourOathsAdapter: OATH-1 require fields',
      !result1.valid && result1.issues.length > 0,
      `Valid: ${result1.valid}, Issues: ${result1.issues.length}`);

    // Test OATH-1: Transparency - complete decision
    const result2 = await oathsAdapter.validateTransparency({
      input: 'test input',
      reasoning: 'This is adequate reasoning for the decision',
      output: 'test output',
      confidence: 0.85
    });

    logTest('FourOathsAdapter: OATH-1 allow complete decision',
      result2.valid,
      `Valid: ${result2.valid}`);

    // Test OATH-2: Boundaries - L4_CREW overspend
    const result3 = await oathsAdapter.validateBoundaries({
      agentLevel: 'L4_CREW',
      spendAmount: 100
    });

    logTest('FourOathsAdapter: OATH-2 block overspend',
      !result3.valid,
      `Valid: ${result3.valid}, Issues: ${result3.issues?.join(', ')}`);

    // Test OATH-3: Escalation - low confidence without escalation
    const result4 = await oathsAdapter.validateEscalationIntegrity({
      agentLevel: 'L4_CREW',
      confidence: 0.7,
      escalated: false
    });

    logTest('FourOathsAdapter: OATH-3 require escalation',
      !result4.valid,
      `Valid: ${result4.valid}`);

    // Test OATH-4: Non-deception - invalid confidence
    const result5 = await oathsAdapter.validateNonDeception({
      confidence: 1.5
    });

    logTest('FourOathsAdapter: OATH-4 block invalid confidence',
      !result5.valid,
      `Valid: ${result5.valid}`);

    // Test validateAllOaths
    const result6 = await oathsAdapter.validateAllOaths({
      decision: {
        input: 'test',
        reasoning: 'adequate reasoning here',
        output: 'result',
        confidence: 0.9,
        agentLevel: 'L3_VP',
        escalated: false
      },
      action: {
        agentLevel: 'L3_VP',
        spendAmount: 25
      },
      output: {
        confidence: 0.9,
        buckets: { facts: ['test'], unknowns: ['uncertainty'] }
      }
    });

    logTest('FourOathsAdapter: validateAllOaths',
      result6.valid !== undefined,
      `Valid: ${result6.valid}, AEGIS: ${result6.aegis_enabled}`);

    // Test enforce throws
    let threw = false;
    try {
      await oathsAdapter.enforceTransparency({
        input: 'test'
        // missing fields
      });
    } catch (err) {
      threw = err.name === 'TransparencyViolation' || err.message.includes('transparency');
    }

    logTest('FourOathsAdapter: enforceTransparency throws',
      threw,
      'TransparencyViolation thrown for missing fields');

  } catch (err) {
    logTest('FourOathsAdapter tests', false, err.message);
  }

  // =========================================================================
  // TEST 3: Legacy ConstitutionValidator with AEGIS
  // =========================================================================
  console.log('\n--- Legacy ConstitutionValidator AEGIS Integration ---\n');

  try {
    // Dynamic import to test the actual integration
    const { ConstitutionValidator } = await import('./modules/ai-quality-judge/constitution-validator.js');
    const { createClient } = await import('@supabase/supabase-js');

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const validator = new ConstitutionValidator(supabase);

    // Test legacy mode (default)
    const result1 = await validator.validate({
      risk_tier: 'GOVERNED',
      auto_applicable: true,
      target_table: 'test'
    }, {});

    logTest('Legacy ConstitutionValidator: Default mode works',
      !result1.passed,
      `AEGIS: ${result1.aegis_enabled || false}`);

    // Enable AEGIS mode
    validator.setAegisMode(true);

    const result2 = await validator.validate({
      risk_tier: 'GOVERNED',
      auto_applicable: true,
      target_table: 'protocol_improvement_queue'
    }, {});

    logTest('Legacy ConstitutionValidator: AEGIS mode works',
      !result2.passed && result2.aegis_enabled === true,
      `AEGIS: ${result2.aegis_enabled}, Violations: ${result2.violations?.length}`);

  } catch (err) {
    logTest('Legacy integration test', false, err.message);
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

  process.exit(results.failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
