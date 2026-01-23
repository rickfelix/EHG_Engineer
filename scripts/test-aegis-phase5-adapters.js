#!/usr/bin/env node

/**
 * Test Suite for AEGIS Phase 5 Adapters
 *
 * Tests CrewGovernanceAdapter and ComplianceAdapter
 *
 * Run: node scripts/test-aegis-phase5-adapters.js
 *
 * @implements SD-AEGIS-GOVERNANCE-001
 */

import {
  CrewGovernanceAdapter,
  CrewGovernanceViolation,
  getCrewGovernanceAdapter
} from '../lib/governance/aegis/adapters/CrewGovernanceAdapter.js';

import {
  ComplianceAdapter,
  ComplianceViolation,
  getComplianceAdapter
} from '../lib/governance/aegis/adapters/ComplianceAdapter.js';

// =============================================================================
// TEST UTILITIES
// =============================================================================

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
    testsFailed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
    testsFailed++;
  }
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${expected}, got ${actual}`);
  }
}

function assertTrue(condition, message = '') {
  if (!condition) {
    throw new Error(`${message} Expected true, got false`);
  }
}

function assertFalse(condition, message = '') {
  if (condition) {
    throw new Error(`${message} Expected false, got true`);
  }
}

function assertThrows(fn, expectedType, message = '') {
  try {
    fn();
    throw new Error(`${message} Expected error to be thrown`);
  } catch (error) {
    if (expectedType && !(error instanceof expectedType)) {
      throw new Error(`${message} Expected ${expectedType.name}, got ${error.constructor.name}`);
    }
  }
}

async function assertThrowsAsync(fn, expectedType, message = '') {
  try {
    await fn();
    throw new Error(`${message} Expected error to be thrown`);
  } catch (error) {
    if (error.message.includes('Expected error to be thrown')) {
      throw error;
    }
    if (expectedType && !(error instanceof expectedType)) {
      throw new Error(`${message} Expected ${expectedType.name}, got ${error.constructor.name}`);
    }
  }
}

// =============================================================================
// CREW GOVERNANCE ADAPTER TESTS
// =============================================================================

console.log('\n📋 AEGIS Phase 5: Crew Governance Adapter Tests\n');

console.log('--- CrewGovernanceAdapter Instantiation ---');

test('Can create CrewGovernanceAdapter instance', () => {
  const adapter = new CrewGovernanceAdapter();
  assertTrue(adapter instanceof CrewGovernanceAdapter);
});

test('Singleton factory returns same instance', () => {
  const a1 = getCrewGovernanceAdapter();
  const a2 = getCrewGovernanceAdapter();
  assertEqual(a1, a2);
});

test('Adapter has correct default config', () => {
  const adapter = new CrewGovernanceAdapter();
  assertTrue(adapter.config.requirePrdId);
  assertTrue(adapter.config.encourageSdId);
  assertEqual(adapter.config.budgetKillThreshold, 0);
  assertEqual(adapter.config.budgetWarningThreshold, 0.2);
});

test('AEGIS mode defaults to false (legacy mode)', () => {
  const adapter = new CrewGovernanceAdapter();
  assertFalse(adapter.useAegis);
});

test('Can toggle AEGIS mode', () => {
  const adapter = new CrewGovernanceAdapter();
  adapter.setAegisMode(true);
  assertTrue(adapter.useAegis);
  adapter.setAegisMode(false);
  assertFalse(adapter.useAegis);
});

console.log('\n--- Venture ID Validation (CREW-001) ---');

await testAsync('Valid: Venture ID provided', async () => {
  const adapter = new CrewGovernanceAdapter();
  const result = await adapter.validateVentureRequired({
    ventureId: 'venture-123',
    executionId: 'exec-456'
  });
  assertTrue(result.valid);
  assertEqual(result.issues.length, 0);
});

await testAsync('Invalid: Venture ID missing', async () => {
  const adapter = new CrewGovernanceAdapter();
  const result = await adapter.validateVentureRequired({
    ventureId: null,
    executionId: 'exec-456'
  });
  assertFalse(result.valid);
  assertTrue(result.issues.length > 0);
  assertTrue(result.issues[0].includes('venture_id'));
});

await testAsync('Enforce throws on missing venture ID', async () => {
  const adapter = new CrewGovernanceAdapter();
  await assertThrowsAsync(
    () => adapter.enforceVentureRequired({ ventureId: null }),
    CrewGovernanceViolation
  );
});

console.log('\n--- PRD ID Validation (CREW-002) ---');

await testAsync('Valid: PRD ID provided for normal operation', async () => {
  const adapter = new CrewGovernanceAdapter();
  const result = await adapter.validatePrdRequired({
    prdId: 'prd-123',
    operationType: 'crew_kickoff',
    ventureId: 'venture-123'
  });
  assertTrue(result.valid);
  assertFalse(result.isMetaOperation);
});

await testAsync('Invalid: PRD ID missing for normal operation', async () => {
  const adapter = new CrewGovernanceAdapter();
  const result = await adapter.validatePrdRequired({
    prdId: null,
    operationType: 'crew_kickoff',
    ventureId: 'venture-123'
  });
  assertFalse(result.valid);
  assertTrue(result.issues.length > 0);
});

await testAsync('Valid: PRD ID not required for meta operation (health_check)', async () => {
  const adapter = new CrewGovernanceAdapter();
  const result = await adapter.validatePrdRequired({
    prdId: null,
    operationType: 'health_check',
    ventureId: 'venture-123'
  });
  assertTrue(result.valid);
  assertTrue(result.isMetaOperation);
});

await testAsync('Valid: PRD ID not required for meta operation (eva_scan)', async () => {
  const adapter = new CrewGovernanceAdapter();
  const result = await adapter.validatePrdRequired({
    prdId: null,
    operationType: 'eva_scan',
    ventureId: 'venture-123'
  });
  assertTrue(result.valid);
  assertTrue(result.isMetaOperation);
});

console.log('\n--- Budget Validation (CREW-003) ---');

await testAsync('Valid: Budget has remaining tokens', async () => {
  const adapter = new CrewGovernanceAdapter();
  const result = await adapter.validateBudget({
    ventureId: 'venture-123',
    budgetRemaining: 5000,
    budgetAllocated: 10000
  });
  assertTrue(result.valid);
  assertFalse(result.budgetExhausted);
  assertFalse(result.shouldWarn);
  assertEqual(result.budgetPercentage, 0.5);
});

await testAsync('Invalid: Budget exhausted', async () => {
  const adapter = new CrewGovernanceAdapter();
  const result = await adapter.validateBudget({
    ventureId: 'venture-123',
    budgetRemaining: 0,
    budgetAllocated: 10000
  });
  assertFalse(result.valid);
  assertTrue(result.budgetExhausted);
});

await testAsync('Warning: Budget below threshold', async () => {
  const adapter = new CrewGovernanceAdapter();
  const result = await adapter.validateBudget({
    ventureId: 'venture-123',
    budgetRemaining: 1000,
    budgetAllocated: 10000
  });
  assertTrue(result.valid); // Still valid but should warn
  assertFalse(result.budgetExhausted);
  assertTrue(result.shouldWarn);
  assertEqual(result.budgetPercentage, 0.1);
});

console.log('\n--- SD ID Encouragement ---');

await testAsync('SD ID present: no warning', async () => {
  const adapter = new CrewGovernanceAdapter();
  const result = await adapter.validateSdEncouraged({
    sdId: 'SD-TEST-001',
    executionId: 'exec-123'
  });
  assertTrue(result.valid);
  assertTrue(result.hasSdId);
  assertEqual(result.warnings.length, 0);
});

await testAsync('SD ID missing: warning generated', async () => {
  const adapter = new CrewGovernanceAdapter();
  const result = await adapter.validateSdEncouraged({
    sdId: null,
    executionId: 'exec-123'
  });
  assertTrue(result.valid); // Still valid (encouragement only)
  assertFalse(result.hasSdId);
  assertTrue(result.warnings.length > 0);
});

// =============================================================================
// COMPLIANCE ADAPTER TESTS
// =============================================================================

console.log('\n\n📋 AEGIS Phase 5: Compliance Adapter Tests\n');

console.log('--- ComplianceAdapter Instantiation ---');

test('Can create ComplianceAdapter instance', () => {
  const adapter = new ComplianceAdapter();
  assertTrue(adapter instanceof ComplianceAdapter);
});

test('Singleton factory returns same instance', () => {
  // Reset for testing
  const a1 = getComplianceAdapter();
  const a2 = getComplianceAdapter();
  assertEqual(a1, a2);
});

test('Adapter has correct policy config', () => {
  const adapter = new ComplianceAdapter();
  assertEqual(adapter.policies.retention.audit_logs, 365);
  assertEqual(adapter.policies.retention.execution_logs, 90);
  assertTrue(adapter.policies.piiPatterns.includes('email'));
  assertTrue(adapter.policies.requiredAuditFields.includes('actor'));
});

console.log('\n--- Data Retention Validation (COMP-001) ---');

await testAsync('Valid: Retention meets minimum for audit_logs', async () => {
  const adapter = new ComplianceAdapter();
  const result = await adapter.validateDataRetention({
    dataType: 'audit_logs',
    retentionDays: 400
  });
  assertTrue(result.valid);
  assertEqual(result.requiredDays, 365);
});

await testAsync('Invalid: Retention below minimum for audit_logs', async () => {
  const adapter = new ComplianceAdapter();
  const result = await adapter.validateDataRetention({
    dataType: 'audit_logs',
    retentionDays: 100
  });
  assertFalse(result.valid);
  assertTrue(result.issues[0].includes('365'));
});

await testAsync('Valid: Retention meets minimum for execution_logs', async () => {
  const adapter = new ComplianceAdapter();
  const result = await adapter.validateDataRetention({
    dataType: 'execution_logs',
    retentionDays: 90
  });
  assertTrue(result.valid);
  assertEqual(result.requiredDays, 90);
});

console.log('\n--- PII Handling Validation (COMP-002) ---');

await testAsync('Valid: No PII in data', async () => {
  const adapter = new ComplianceAdapter();
  const result = await adapter.validatePiiHandling({
    data: { name: 'Test', value: 123 },
    operation: 'log',
    encrypted: false,
    masked: false
  });
  assertTrue(result.valid);
  assertEqual(result.piiDetected.length, 0);
});

await testAsync('Invalid: PII logged without masking', async () => {
  const adapter = new ComplianceAdapter();
  const result = await adapter.validatePiiHandling({
    data: { user_email: 'test@example.com', password: 'secret123' },
    operation: 'log',
    encrypted: false,
    masked: false
  });
  assertFalse(result.valid);
  assertTrue(result.piiDetected.length > 0);
  assertTrue(result.piiDetected.includes('user_email') || result.piiDetected.includes('password'));
});

await testAsync('Valid: PII logged with masking', async () => {
  const adapter = new ComplianceAdapter();
  const result = await adapter.validatePiiHandling({
    data: { user_email: '***@***.com' },
    operation: 'log',
    encrypted: false,
    masked: true
  });
  assertTrue(result.valid);
});

await testAsync('Invalid: PII transmitted without encryption', async () => {
  const adapter = new ComplianceAdapter();
  const result = await adapter.validatePiiHandling({
    data: { credit_card: '4111-1111-1111-1111' },
    operation: 'transmit',
    encrypted: false,
    masked: false
  });
  assertFalse(result.valid);
  assertTrue(result.issues[0].includes('encryption'));
});

await testAsync('Detects nested PII fields', async () => {
  const adapter = new ComplianceAdapter();
  const result = await adapter.validatePiiHandling({
    data: {
      user: {
        profile: {
          email: 'test@example.com'
        }
      }
    },
    operation: 'store',
    encrypted: false,
    masked: false
  });
  assertFalse(result.valid);
  assertTrue(result.piiDetected.some(p => p.includes('email')));
});

console.log('\n--- Audit Logging Validation (COMP-003) ---');

await testAsync('Valid: All required audit fields present', async () => {
  const adapter = new ComplianceAdapter();
  const result = await adapter.validateAuditLogging({
    auditEntry: {
      actor: 'user-123',
      action: 'UPDATE',
      timestamp: new Date().toISOString(),
      resource_type: 'strategic_directive',
      resource_id: 'SD-TEST-001'
    }
  });
  assertTrue(result.valid);
  assertEqual(result.missingFields.length, 0);
});

await testAsync('Invalid: Missing required audit fields', async () => {
  const adapter = new ComplianceAdapter();
  const result = await adapter.validateAuditLogging({
    auditEntry: {
      actor: 'user-123',
      action: 'UPDATE'
      // Missing: timestamp, resource_type, resource_id
    }
  });
  assertFalse(result.valid);
  assertTrue(result.missingFields.length === 3);
  assertTrue(result.missingFields.includes('timestamp'));
  assertTrue(result.missingFields.includes('resource_type'));
  assertTrue(result.missingFields.includes('resource_id'));
});

console.log('\n--- Change Management Validation (COMP-006) ---');

await testAsync('Valid: Schema change with approval', async () => {
  const adapter = new ComplianceAdapter();
  const result = await adapter.validateChangeManagement({
    changeType: 'schema_change',
    hasApproval: true,
    approvedBy: 'chairman-123',
    changeReason: 'Adding new table for AEGIS violations'
  });
  assertTrue(result.valid);
  assertTrue(result.requiresApproval);
});

await testAsync('Invalid: Schema change without approval', async () => {
  const adapter = new ComplianceAdapter();
  const result = await adapter.validateChangeManagement({
    changeType: 'schema_change',
    hasApproval: false,
    approvedBy: null,
    changeReason: 'Adding new table'
  });
  assertFalse(result.valid);
  assertTrue(result.requiresApproval);
  assertTrue(result.issues[0].includes('approval'));
});

await testAsync('Invalid: RLS policy change without reason', async () => {
  const adapter = new ComplianceAdapter();
  const result = await adapter.validateChangeManagement({
    changeType: 'rls_policy_change',
    hasApproval: true,
    approvedBy: 'chairman-123',
    changeReason: null
  });
  assertFalse(result.valid);
  assertTrue(result.issues[0].includes('reason'));
});

await testAsync('Valid: Non-restricted change without approval', async () => {
  const adapter = new ComplianceAdapter();
  const result = await adapter.validateChangeManagement({
    changeType: 'documentation_update',
    hasApproval: false,
    approvedBy: null,
    changeReason: null
  });
  assertTrue(result.valid);
  assertFalse(result.requiresApproval);
});

console.log('\n--- Enforcement Methods ---');

await testAsync('enforceDataRetention throws on violation', async () => {
  const adapter = new ComplianceAdapter();
  await assertThrowsAsync(
    () => adapter.enforceDataRetention({ dataType: 'audit_logs', retentionDays: 30 }),
    ComplianceViolation
  );
});

await testAsync('enforcePiiHandling throws on violation', async () => {
  const adapter = new ComplianceAdapter();
  await assertThrowsAsync(
    () => adapter.enforcePiiHandling({
      data: { password: 'secret' },
      operation: 'log',
      encrypted: false,
      masked: false
    }),
    ComplianceViolation
  );
});

await testAsync('enforceChangeManagement throws on violation', async () => {
  const adapter = new ComplianceAdapter();
  await assertThrowsAsync(
    () => adapter.enforceChangeManagement({
      changeType: 'trigger_modification',
      hasApproval: false
    }),
    ComplianceViolation
  );
});

// =============================================================================
// SUMMARY
// =============================================================================

console.log('\n' + '='.repeat(60));
console.log('📊 Phase 5 Adapter Tests Summary');
console.log('='.repeat(60));
console.log(`  ✅ Passed: ${testsPassed}`);
console.log(`  ❌ Failed: ${testsFailed}`);
console.log(`  📦 Total:  ${testsPassed + testsFailed}`);
console.log('='.repeat(60));

if (testsFailed > 0) {
  console.log('\n⚠️  Some tests failed. Review the errors above.');
  process.exit(1);
} else {
  console.log('\n✨ All Phase 5 adapter tests passed!');
  process.exit(0);
}
