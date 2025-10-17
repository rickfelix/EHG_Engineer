#!/usr/bin/env node

/**
 * Integration Test: Error-Triggered Sub-Agent Invocation
 *
 * Tests the full workflow of error detection → sub-agent invocation → resolution
 * with the orchestration system and circuit breaker.
 */

import { detectError, recommendSubAgent } from '../../lib/error-pattern-library.js';
import { invokeForError, monitorExecution, getInvocationStats, reset } from '../../lib/error-triggered-sub-agent-invoker.js';
import { spawn } from 'child_process';

// ============================================================================
// TEST UTILITIES
// ============================================================================

const results = {
  total: 0,
  passed: 0,
  failed: 0
};

function assert(condition, testName, details = '') {
  results.total++;
  if (condition) {
    results.passed++;
    console.log(`  ✅ ${testName}`);
  } else {
    results.failed++;
    console.error(`  ❌ ${testName}`);
    if (details) {
      console.error(`     Details: ${details}`);
    }
  }
}

function testGroup(name) {
  console.log(`\n📦 Integration Test Group: ${name}`);
  console.log('─'.repeat(60));
}

// ============================================================================
// TEST 1: ERROR DETECTION → RECOMMENDATION WORKFLOW
// ============================================================================

testGroup('Error Detection → Sub-Agent Recommendation');

{
  const errorMsg = 'PostgreSQL error: connection refused to localhost:5432';
  const errorInfo = detectError(errorMsg);

  assert(errorInfo !== null, 'Test 1.1: Error detected from message');
  assert(errorInfo.id === 'DB_CONNECTION_FAILED', 'Test 1.2: Correct error pattern identified');
  assert(errorInfo.confidence >= 70, 'Test 1.3: Confidence score acceptable');

  const recommendation = recommendSubAgent(errorInfo);

  assert(recommendation.recommended.length > 0, 'Test 1.4: Sub-agent recommendation provided');
  assert(recommendation.recommended[0].code === 'DATABASE', 'Test 1.5: Correct sub-agent recommended');
  assert(recommendation.recommended[0].autoInvoke === true, 'Test 1.6: Auto-invoke enabled for CRITICAL error');
}

{
  const errorMsg = 'Type error: Property "name" does not exist on type "User"';
  const errorInfo = detectError(errorMsg);
  const recommendation = recommendSubAgent(errorInfo);

  assert(errorInfo.severity === 'MEDIUM', 'Test 1.7: MEDIUM severity detected');
  assert(recommendation.recommended[0].autoInvoke === false, 'Test 1.8: Auto-invoke disabled for MEDIUM error');
}

// ============================================================================
// TEST 2: CIRCUIT BREAKER FUNCTIONALITY
// ============================================================================

testGroup('Circuit Breaker Protection');

{
  const testSdId = 'TEST-CIRCUIT-001';
  reset(testSdId); // Clear any previous state

  // Simulate database connection error (must match defined pattern)
  const errorMsg = 'ECONNREFUSED: connection refused to postgres://localhost:5432';
  const errorInfo = detectError(errorMsg);

  // First invocation - should succeed
  const result1 = await invokeForError(errorInfo, testSdId, { phase: 'TEST' });
  assert(result1.invoked === true, 'Test 2.1: First invocation succeeds');

  // Get stats
  const stats1 = getInvocationStats(testSdId);
  assert(stats1.totalInvocations === 1, 'Test 2.2: Invocation count = 1');

  // Second invocation - should succeed
  const result2 = await invokeForError(errorInfo, testSdId, { phase: 'TEST' });
  assert(result2.invoked === true, 'Test 2.3: Second invocation succeeds');

  const stats2 = getInvocationStats(testSdId);
  assert(stats2.totalInvocations === 2, 'Test 2.4: Invocation count = 2');

  // Third invocation - should succeed
  const result3 = await invokeForError(errorInfo, testSdId, { phase: 'TEST' });
  assert(result3.invoked === true, 'Test 2.5: Third invocation succeeds');

  const stats3 = getInvocationStats(testSdId);
  assert(stats3.totalInvocations === 3, 'Test 2.6: Invocation count = 3');

  // Fourth invocation - should be blocked by circuit breaker
  const result4 = await invokeForError(errorInfo, testSdId, { phase: 'TEST' });
  assert(result4.invoked === false, 'Test 2.7: Fourth invocation blocked by circuit breaker');
  assert(result4.reason === 'MAX_INVOCATIONS_REACHED', 'Test 2.8: Correct blocking reason');

  // Verify circuit breaker state
  const stats4 = getInvocationStats(testSdId);
  assert(stats4.circuitState === 'OPEN', 'Test 2.9: Circuit breaker is OPEN');

  // Clean up
  reset(testSdId);
}

// ============================================================================
// TEST 3: ESCALATION WORKFLOW
// ============================================================================

testGroup('Escalation Workflow');

{
  const testSdId = 'TEST-ESCALATE-001';
  reset(testSdId);

  // Use different error patterns to avoid per-pattern circuit breaker limit
  // This tests the escalation threshold (5 failures across all patterns)
  // All errors must be HIGH/CRITICAL severity to auto-invoke
  const errors = [
    'Build compilation failed',                      // HIGH - BUILD_COMPILATION_ERROR
    'Authentication failed - invalid credentials',   // HIGH - AUTH_FAILED
    'ECONNREFUSED: connection refused to postgres',  // CRITICAL - DB_CONNECTION_FAILED
    'Build compilation failed',                      // HIGH (repeat pattern)
    'Authentication failed - invalid credentials'    // HIGH (repeat pattern)
  ];

  // Simulate 5 failures across different error patterns
  for (let i = 0; i < errors.length; i++) {
    const errorInfo = detectError(errors[i]);
    await invokeForError(errorInfo, testSdId, { phase: 'TEST' });
  }

  const stats = getInvocationStats(testSdId);
  assert(stats.totalInvocations === 5, 'Test 3.1: 5 invocations recorded', `Expected 5, got ${stats.totalInvocations}`);

  // 6th invocation should escalate
  const errorInfo = detectError('Playwright test timeout exceeded');
  const result = await invokeForError(errorInfo, testSdId, { phase: 'TEST' });
  assert(result.escalate === true, 'Test 3.2: Escalation triggered after threshold');
  assert(result.reason === 'ESCALATION_REQUIRED', 'Test 3.3: Correct escalation reason');

  const finalStats = getInvocationStats(testSdId);
  assert(finalStats.shouldEscalate === true, 'Test 3.4: Escalation flag set in stats');

  reset(testSdId);
}

// ============================================================================
// TEST 4: MULTIPLE ERROR TYPES
// ============================================================================

testGroup('Multiple Error Types Handling');

{
  const testSdId = 'TEST-MULTI-001';
  reset(testSdId);

  const errors = [
    { msg: 'Query exceeded execution time limit', expectedAgent: 'DATABASE' },
    { msg: 'Authentication failed - invalid token', expectedAgent: 'SECURITY' },
    { msg: 'TypeScript compilation error', expectedAgent: 'VALIDATION' },
    { msg: 'Playwright test timeout exceeded', expectedAgent: 'TESTING' }
  ];

  for (let i = 0; i < errors.length; i++) {
    const errorInfo = detectError(errors[i].msg);
    const recommendation = recommendSubAgent(errorInfo);

    assert(
      recommendation.recommended.some(r => r.code === errors[i].expectedAgent),
      `Test 4.${i+1}: ${errors[i].expectedAgent} recommended for "${errors[i].msg}"`,
      `Expected ${errors[i].expectedAgent}, got ${recommendation.recommended.map(r => r.code).join(', ')}`
    );
  }

  reset(testSdId);
}

// ============================================================================
// TEST 5: REAL COMMAND EXECUTION MONITORING
// ============================================================================

testGroup('Command Execution Monitoring');

{
  console.log('  🔍 Testing real command execution with error monitoring...');

  // Test with a command that succeeds
  const result1 = await monitorExecution(
    'echo "Test successful"',
    'TEST-MONITOR-001',
    { phase: 'TEST' }
  );

  assert(result1.success === true, 'Test 5.1: Successful command returns success=true');
  assert(result1.exitCode === 0, 'Test 5.2: Successful command returns exitCode=0');

  // Test with a command that fails
  const result2 = await monitorExecution(
    'node -e "throw new Error(\'Test error\')"',
    'TEST-MONITOR-002',
    { phase: 'TEST' }
  );

  assert(result2.success === false, 'Test 5.3: Failed command returns success=false');
  assert(result2.exitCode !== 0, 'Test 5.4: Failed command returns non-zero exitCode');
  assert(result2.errors.length > 0, 'Test 5.5: Failed command captures error output');
}

// ============================================================================
// TEST 6: PATTERN SPECIFICITY
// ============================================================================

testGroup('Error Pattern Specificity');

{
  // Test that specific patterns match before generic ones
  const errorMsg1 = 'TypeError: Cannot read property "id" of undefined';
  const result1 = detectError(errorMsg1);
  assert(result1.id === 'RUNTIME_NULL_REFERENCE', 'Test 6.1: Runtime error detected (not BUILD_TYPE_ERROR)');
  assert(result1.category === 'RUNTIME', 'Test 6.2: Category is RUNTIME');

  const errorMsg2 = 'GitHub Actions: 15 tests failed in CI pipeline';
  const result2 = detectError(errorMsg2);
  assert(result2.id === 'CICD_TEST_FAILURE', 'Test 6.3: CI test failure detected');
  assert(result2.subAgents.includes('TESTING'), 'Test 6.4: TESTING sub-agent recommended');
  assert(result2.subAgents.includes('GITHUB'), 'Test 6.5: GITHUB sub-agent recommended');
}

// ============================================================================
// TEST 7: AUTO-RECOVERY PATTERN
// ============================================================================

testGroup('Auto-Recovery Pattern');

{
  const errorMsg = 'npm ERR! Peer dependency @types/react not found';
  const errorInfo = detectError(errorMsg);
  const recommendation = recommendSubAgent(errorInfo);

  assert(errorInfo.id === 'BUILD_DEPENDENCY_ERROR', 'Test 7.1: Dependency error detected');
  assert(recommendation.autoRecovery === true, 'Test 7.2: Auto-recovery available');
  assert(recommendation.autoRecoverySteps.length > 0, 'Test 7.3: Auto-recovery steps provided');
  assert(recommendation.autoRecoverySteps[0] === 'npm install', 'Test 7.4: Correct recovery step');
}

// ============================================================================
// TEST 8: CONFIDENCE SCORING
// ============================================================================

testGroup('Confidence Scoring Validation');

{
  // High confidence pattern (multiple keywords)
  const errorMsg1 = 'PostgreSQL connection refused to database server timeout';
  const result1 = detectError(errorMsg1);
  assert(result1.confidence >= 80, 'Test 8.1: High confidence for multi-keyword match');

  // Lower confidence pattern (fewer keywords but still matches pattern)
  const errorMsg2 = 'Column "name" does not exist in table';
  const result2 = detectError(errorMsg2);
  assert(result2.confidence >= 70, 'Test 8.2: Base confidence for single-keyword match');

  // Unknown error (lowest confidence)
  const errorMsg3 = 'Something weird happened';
  const result3 = detectError(errorMsg3);
  assert(result3.id === 'UNKNOWN_ERROR', 'Test 8.3: Unknown error detected');
  assert(result3.confidence < 50, 'Test 8.4: Low confidence for unknown errors');
}

// ============================================================================
// TEST 9: INVOCATION HISTORY PERSISTENCE
// ============================================================================

testGroup('Invocation History Persistence');

{
  const testSdId = 'TEST-HISTORY-001';
  reset(testSdId);

  // Record multiple invocations (use realistic error message)
  const errorInfo = detectError('PostgreSQL error: connection refused to database server');

  await invokeForError(errorInfo, testSdId, { phase: 'TEST' });
  await invokeForError(errorInfo, testSdId, { phase: 'TEST' });

  const stats = getInvocationStats(testSdId);

  assert(stats.totalInvocations === 2, 'Test 9.1: History tracks all invocations');
  assert(stats.bySubAgent['DATABASE'] === 2, 'Test 9.2: Sub-agent count tracked');
  assert(stats.byError['DB_CONNECTION_FAILED'] === 2, 'Test 9.3: Error pattern count tracked');

  // Reset and verify
  reset(testSdId);
  const statsAfterReset = getInvocationStats(testSdId);
  assert(statsAfterReset.totalInvocations === 0, 'Test 9.4: Reset clears history');
}

// ============================================================================
// TEST 10: SEVERITY-BASED AUTO-INVOKE
// ============================================================================

testGroup('Severity-Based Auto-Invoke Logic');

{
  const testSdId = 'TEST-SEVERITY-001';

  // CRITICAL severity - should auto-invoke
  const criticalError = detectError('Migration failed - database unavailable');
  const criticalResult = await invokeForError(criticalError, testSdId, { phase: 'TEST' });
  assert(criticalResult.invoked === true, 'Test 10.1: CRITICAL error auto-invokes');

  reset(testSdId);

  // HIGH severity - should auto-invoke
  const highError = detectError('Authentication failed - invalid credentials');
  const highResult = await invokeForError(highError, testSdId, { phase: 'TEST' });
  assert(highResult.invoked === true, 'Test 10.2: HIGH error auto-invokes');

  reset(testSdId);

  // MEDIUM severity - should NOT auto-invoke
  const mediumError = detectError('TypeScript type error: Property "id" does not exist on type "User"');
  const mediumResult = await invokeForError(mediumError, testSdId, { phase: 'TEST' });
  assert(mediumResult.invoked === false, 'Test 10.3: MEDIUM error requires manual review');
  assert(mediumResult.reason === 'MANUAL_INTERVENTION_REQUIRED', 'Test 10.4: Correct reason for MEDIUM severity');

  reset(testSdId);
}

// ============================================================================
// TEST SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log('📊 INTEGRATION TEST SUMMARY');
console.log('='.repeat(60));
console.log(`Total Tests: ${results.total}`);
console.log(`✅ Passed: ${results.passed} (${Math.round(results.passed / results.total * 100)}%)`);
console.log(`❌ Failed: ${results.failed}`);
console.log('');

if (results.failed === 0) {
  console.log('🎉 ALL INTEGRATION TESTS PASSED!');
  console.log('✅ Pattern 5 is ready for production deployment.');
} else {
  console.error('⚠️  SOME INTEGRATION TESTS FAILED');
  console.error('❌ Review failures before production deployment.');
}

console.log('');

// Exit with appropriate code
process.exit(results.failed > 0 ? 1 : 0);
