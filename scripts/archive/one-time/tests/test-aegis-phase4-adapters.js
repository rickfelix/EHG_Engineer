#!/usr/bin/env node

/**
 * AEGIS Phase 4 Adapter Integration Test
 *
 * Tests that the Phase 4 adapters correctly wrap:
 * - Hard Halt Protocol
 * - Manifesto Mode
 * - Doctrine of Constraint
 *
 * @module scripts/test-aegis-phase4-adapters
 */

import dotenv from 'dotenv';
dotenv.config();

import { _HardHaltAdapter, getHardHaltAdapter } from '../lib/governance/aegis/adapters/HardHaltAdapter.js';
import { _ManifestoModeAdapter, getManifestoModeAdapter } from '../lib/governance/aegis/adapters/ManifestoModeAdapter.js';
import { _DoctrineAdapter, getDoctrineAdapter } from '../lib/governance/aegis/adapters/DoctrineAdapter.js';

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
  console.log('AEGIS PHASE 4 ADAPTER INTEGRATION TESTS');
  console.log('='.repeat(60) + '\n');

  // =========================================================================
  // TEST 1: HardHaltAdapter - Dead-Man Switch Validation
  // =========================================================================
  console.log('\n--- HardHaltAdapter Tests ---\n');

  const haltAdapter = getHardHaltAdapter();

  try {
    // Test dead-man switch - safe (under threshold)
    const result1 = await haltAdapter.validateDeadManSwitch({
      hoursSinceActivity: 10,
      warningThreshold: 48,
      haltThreshold: 72
    });

    logTest('HardHaltAdapter: Safe activity level',
      result1.valid && !result1.shouldWarn && !result1.shouldHalt,
      `Valid: ${result1.valid}, ShouldHalt: ${result1.shouldHalt}`);

    // Test dead-man switch - warning
    const result2 = await haltAdapter.validateDeadManSwitch({
      hoursSinceActivity: 50,
      warningThreshold: 48,
      haltThreshold: 72
    });

    logTest('HardHaltAdapter: Warning threshold',
      result2.shouldWarn && !result2.shouldHalt,
      `ShouldWarn: ${result2.shouldWarn}, HoursRemaining: ${result2.hoursRemaining?.toFixed(1)}`);

    // Test dead-man switch - should halt
    const result3 = await haltAdapter.validateDeadManSwitch({
      hoursSinceActivity: 80,
      warningThreshold: 48,
      haltThreshold: 72
    });

    logTest('HardHaltAdapter: Halt threshold exceeded',
      result3.shouldHalt && !result3.valid,
      `ShouldHalt: ${result3.shouldHalt}, Issues: ${result3.issues?.length}`);

    // Test operation allowed - L4 always allowed
    const result4 = await haltAdapter.validateOperationAllowed({
      agentLevel: 'L4_CREW',
      isHalted: true,
      operationType: 'task_completion'
    });

    logTest('HardHaltAdapter: L4 allowed during halt',
      result4.allowed,
      `Allowed: ${result4.allowed}`);

    // Test operation blocked - L2 during halt
    const result5 = await haltAdapter.validateOperationAllowed({
      agentLevel: 'L2_CEO',
      isHalted: true,
      operationType: 'budget_allocation'
    });

    logTest('HardHaltAdapter: L2 blocked during halt',
      !result5.allowed,
      `Allowed: ${result5.allowed}, Issues: ${result5.issues?.length}`);

    // Test halt authority - Chairman allowed
    const result6 = await haltAdapter.validateHaltAuthority({
      actorLevel: 'L0_CHAIRMAN',
      action: 'trigger'
    });

    logTest('HardHaltAdapter: Chairman can trigger halt',
      result6.authorized,
      `Authorized: ${result6.authorized}`);

    // Test halt authority - CEO not allowed
    const result7 = await haltAdapter.validateHaltAuthority({
      actorLevel: 'L2_CEO',
      action: 'trigger'
    });

    logTest('HardHaltAdapter: CEO cannot trigger halt',
      !result7.authorized,
      `Authorized: ${result7.authorized}`);

    // Test enforce throws
    let threw = false;
    try {
      await haltAdapter.enforceDeadManSwitch({
        hoursSinceActivity: 100,
        haltThreshold: 72
      });
    } catch (err) {
      threw = err.name === 'HardHaltViolation' || err.message.includes('HARD_HALT');
    }

    logTest('HardHaltAdapter: enforceDeadManSwitch throws',
      threw,
      'HardHaltViolation thrown for exceeded threshold');

  } catch (err) {
    logTest('HardHaltAdapter tests', false, err.message);
  }

  // =========================================================================
  // TEST 2: ManifestoModeAdapter - Authority Validation
  // =========================================================================
  console.log('\n--- ManifestoModeAdapter Tests ---\n');

  const manifestoAdapter = getManifestoModeAdapter();

  try {
    // Test activation authority - Chairman
    const result1 = await manifestoAdapter.validateActivationAuthority({
      authorityLevel: 'L0_CHAIRMAN',
      activatedBy: 'chairman-001'
    });

    logTest('ManifestoModeAdapter: Chairman can activate',
      result1.authorized,
      `Authorized: ${result1.authorized}`);

    // Test activation authority - CEO denied
    const result2 = await manifestoAdapter.validateActivationAuthority({
      authorityLevel: 'L2_CEO',
      activatedBy: 'ceo-001'
    });

    logTest('ManifestoModeAdapter: CEO cannot activate',
      !result2.authorized,
      `Authorized: ${result2.authorized}, Issues: ${result2.issues?.length}`);

    // Test L2+ operation - manifesto active
    const result3 = await manifestoAdapter.validateL2PlusOperation({
      operationType: 'venture_creation',
      agentId: 'agent-001',
      authorityLevel: 'L2_CEO',
      manifestoActive: true
    });

    logTest('ManifestoModeAdapter: L2+ operation requires oath enforcement',
      result3.requiresOathEnforcement,
      `RequiresOathEnforcement: ${result3.requiresOathEnforcement}`);

    // Test L2+ operation - manifesto inactive
    const result4 = await manifestoAdapter.validateL2PlusOperation({
      operationType: 'venture_creation',
      agentId: 'agent-001',
      authorityLevel: 'L2_CEO',
      manifestoActive: false
    });

    logTest('ManifestoModeAdapter: No oath enforcement when inactive',
      !result4.requiresOathEnforcement,
      `RequiresOathEnforcement: ${result4.requiresOathEnforcement}`);

    // Test deactivation - missing reason
    const result5 = await manifestoAdapter.validateDeactivation({
      authorityLevel: 'L0_CHAIRMAN',
      deactivatedBy: 'chairman-001',
      reason: null
    });

    logTest('ManifestoModeAdapter: Deactivation requires reason',
      !result5.authorized,
      `Authorized: ${result5.authorized}`);

    // Test deactivation - valid
    const result6 = await manifestoAdapter.validateDeactivation({
      authorityLevel: 'L0_CHAIRMAN',
      deactivatedBy: 'chairman-001',
      reason: 'Emergency maintenance'
    });

    logTest('ManifestoModeAdapter: Valid deactivation',
      result6.authorized,
      `Authorized: ${result6.authorized}`);

    // Test enforce throws
    let threw = false;
    try {
      await manifestoAdapter.enforceActivationAuthority({
        authorityLevel: 'L3_VP',
        activatedBy: 'vp-001'
      });
    } catch (err) {
      threw = err.name === 'ManifestoViolation' || err.message.includes('MANIFESTO');
    }

    logTest('ManifestoModeAdapter: enforceActivationAuthority throws',
      threw,
      'ManifestoViolation thrown for insufficient authority');

  } catch (err) {
    logTest('ManifestoModeAdapter tests', false, err.message);
  }

  // =========================================================================
  // TEST 3: DoctrineAdapter - Governance Operation Validation
  // =========================================================================
  console.log('\n--- DoctrineAdapter Tests ---\n');

  const doctrineAdapter = getDoctrineAdapter();

  try {
    // Test EXEC cannot create SD
    const result1 = await doctrineAdapter.validateGovernanceOperation({
      actorRole: 'EXEC',
      targetTable: 'strategic_directives_v2',
      operation: 'INSERT'
    });

    logTest('DoctrineAdapter: EXEC cannot create SD',
      !result1.allowed && result1.wouldTriggerDbViolation,
      `Allowed: ${result1.allowed}, WouldTriggerDB: ${result1.wouldTriggerDbViolation}`);

    // Test PLAN can create SD
    const result2 = await doctrineAdapter.validateGovernanceOperation({
      actorRole: 'PLAN',
      targetTable: 'strategic_directives_v2',
      operation: 'INSERT'
    });

    logTest('DoctrineAdapter: PLAN can create SD',
      result2.allowed,
      `Allowed: ${result2.allowed}`);

    // Test EXEC cannot modify PRD
    const result3 = await doctrineAdapter.validateGovernanceOperation({
      actorRole: 'EXEC',
      targetTable: 'product_requirements_v2',
      operation: 'UPDATE'
    });

    logTest('DoctrineAdapter: EXEC cannot modify PRD',
      !result3.allowed,
      `Allowed: ${result3.allowed}`);

    // Test EXEC cannot log governance events
    const result4 = await doctrineAdapter.validateEventLogging({
      actorRole: 'EXEC',
      eventType: 'SD_CREATED'
    });

    logTest('DoctrineAdapter: EXEC cannot log SD_CREATED',
      !result4.allowed && result4.wouldTriggerDbViolation,
      `Allowed: ${result4.allowed}`);

    // Test EXEC can log implementation events
    const result5 = await doctrineAdapter.validateEventLogging({
      actorRole: 'EXEC',
      eventType: 'TASK_COMPLETED'
    });

    logTest('DoctrineAdapter: EXEC can log TASK_COMPLETED',
      result5.allowed,
      `Allowed: ${result5.allowed}`);

    // Test EXEC cannot modify protocols
    const result6 = await doctrineAdapter.validateGovernanceOperation({
      actorRole: 'EXEC',
      targetTable: 'leo_protocols',
      operation: 'UPDATE'
    });

    logTest('DoctrineAdapter: EXEC cannot modify protocols',
      !result6.allowed,
      `Allowed: ${result6.allowed}`);

    // Test enforce throws
    let threw = false;
    try {
      await doctrineAdapter.enforceGovernanceOperation({
        actorRole: 'EXEC',
        targetTable: 'chairman_decisions',
        operation: 'INSERT'
      });
    } catch (err) {
      threw = err.name === 'DoctrineViolation' || err.message.includes('DOCTRINE');
    }

    logTest('DoctrineAdapter: enforceGovernanceOperation throws',
      threw,
      'DoctrineViolation thrown for EXEC governance attempt');

  } catch (err) {
    logTest('DoctrineAdapter tests', false, err.message);
  }

  // =========================================================================
  // TEST 4: Legacy Mode Fallback
  // =========================================================================
  console.log('\n--- Legacy Mode Fallback Tests ---\n');

  try {
    // Disable AEGIS for all adapters
    haltAdapter.setAegisMode(false);
    manifestoAdapter.setAegisMode(false);
    doctrineAdapter.setAegisMode(false);

    // Test Hard Halt legacy
    const result1 = await haltAdapter.validateDeadManSwitch({
      hoursSinceActivity: 80,
      haltThreshold: 72
    });

    logTest('HardHaltAdapter: Legacy mode works',
      result1.aegis_enabled === false && result1.shouldHalt,
      `AEGIS: ${result1.aegis_enabled}`);

    // Test Manifesto legacy
    const result2 = await manifestoAdapter.validateActivationAuthority({
      authorityLevel: 'L2_CEO',
      activatedBy: 'ceo-001'
    });

    logTest('ManifestoModeAdapter: Legacy mode works',
      result2.aegis_enabled === false && !result2.authorized,
      `AEGIS: ${result2.aegis_enabled}`);

    // Test Doctrine legacy
    const result3 = await doctrineAdapter.validateGovernanceOperation({
      actorRole: 'EXEC',
      targetTable: 'strategic_directives_v2',
      operation: 'INSERT'
    });

    logTest('DoctrineAdapter: Legacy mode works',
      result3.aegis_enabled === false && !result3.allowed,
      `AEGIS: ${result3.aegis_enabled}`);

    // Re-enable AEGIS
    haltAdapter.setAegisMode(true);
    manifestoAdapter.setAegisMode(true);
    doctrineAdapter.setAegisMode(true);

  } catch (err) {
    logTest('Legacy mode tests', false, err.message);
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
