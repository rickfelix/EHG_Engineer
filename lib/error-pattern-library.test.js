#!/usr/bin/env node

/**
 * Test Suite for Error Pattern Library
 *
 * Tests error detection, sub-agent recommendation, and pattern matching
 */

import {
  ERROR_CATEGORIES,
  SEVERITY_LEVELS,
  ERROR_PATTERNS,
  SUB_AGENT_SPECIALTIES as _SUB_AGENT_SPECIALTIES,
  detectError,
  recommendSubAgent,
  getPatternsByCategory,
  getPatternsBySubAgent,
  getLibraryStats
} from './error-pattern-library.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  groups: {}
};

function assert(condition, testName, group = 'General', details = '') {
  results.total++;
  if (!results.groups[group]) {
    results.groups[group] = { total: 0, passed: 0, failed: 0 };
  }
  results.groups[group].total++;

  if (condition) {
    results.passed++;
    results.groups[group].passed++;
    console.log(`  ✅ ${testName}`);
  } else {
    results.failed++;
    results.groups[group].failed++;
    console.error(`  ❌ ${testName}`);
    if (details) {
      console.error(`     Details: ${details}`);
    }
  }
}

function testGroup(name) {
  console.log(`\n📦 Test Group: ${name}`);
  console.log('─'.repeat(60));
}

// ============================================================================
// TEST: DATABASE ERRORS
// ============================================================================

testGroup('DATABASE Errors');

{
  const errorMsg = 'Error: connection refused to postgres://localhost:5432';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 1.1: Database connection error detected', 'DATABASE');
  assert(result.id === 'DB_CONNECTION_FAILED', 'Test 1.2: Correct error ID (DB_CONNECTION_FAILED)', 'DATABASE');
  assert(result.category === ERROR_CATEGORIES.DATABASE, 'Test 1.3: Category is DATABASE', 'DATABASE');
  assert(result.severity === SEVERITY_LEVELS.CRITICAL, 'Test 1.4: Severity is CRITICAL', 'DATABASE');
  assert(result.subAgents.includes('DATABASE'), 'Test 1.5: Recommends DATABASE sub-agent', 'DATABASE');
}

{
  const errorMsg = 'PostgreSQL error: column "user_id" does not exist';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 1.6: SQL query error detected', 'DATABASE');
  assert(result.id === 'DB_QUERY_ERROR', 'Test 1.7: Correct error ID (DB_QUERY_ERROR)', 'DATABASE');
  assert(result.severity === SEVERITY_LEVELS.HIGH, 'Test 1.8: Severity is HIGH', 'DATABASE');
}

{
  const errorMsg = 'Error: new row violates row-level security policy for table "users"';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 1.9: RLS policy error detected', 'DATABASE');
  assert(result.id === 'DB_RLS_POLICY_ERROR', 'Test 1.10: Correct error ID (DB_RLS_POLICY_ERROR)', 'DATABASE');
  assert(result.subAgents.includes('DATABASE'), 'Test 1.11: Recommends DATABASE sub-agent', 'DATABASE');
  assert(result.subAgents.includes('SECURITY'), 'Test 1.12: Recommends SECURITY sub-agent', 'DATABASE');
}

{
  const errorMsg = 'Migration failed: migration 003 already applied';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 1.13: Migration error detected', 'DATABASE');
  assert(result.id === 'DB_MIGRATION_ERROR', 'Test 1.14: Correct error ID (DB_MIGRATION_ERROR)', 'DATABASE');
  assert(result.severity === SEVERITY_LEVELS.CRITICAL, 'Test 1.15: Severity is CRITICAL', 'DATABASE');
}

// ============================================================================
// TEST: SECURITY/AUTHENTICATION ERRORS
// ============================================================================

testGroup('SECURITY/AUTHENTICATION Errors');

{
  const errorMsg = 'Error: Authentication failed - invalid credentials';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 2.1: Authentication error detected', 'SECURITY');
  assert(result.id === 'AUTH_FAILED', 'Test 2.2: Correct error ID (AUTH_FAILED)', 'SECURITY');
  assert(result.category === ERROR_CATEGORIES.SECURITY, 'Test 2.3: Category is SECURITY', 'SECURITY');
  assert(result.subAgents.includes('SECURITY'), 'Test 2.4: Recommends SECURITY sub-agent', 'SECURITY');
}

{
  const errorMsg = 'HTTP 403 Forbidden - permission denied for resource';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 2.5: Permission denied error detected', 'SECURITY');
  assert(result.id === 'PERMISSION_DENIED', 'Test 2.6: Correct error ID (PERMISSION_DENIED)', 'SECURITY');
  assert(result.severity === SEVERITY_LEVELS.HIGH, 'Test 2.7: Severity is HIGH', 'SECURITY');
}

{
  const errorMsg = 'Error: Session expired - please login again';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 2.8: Session expiration detected', 'SECURITY');
  assert(result.id === 'AUTH_FAILED', 'Test 2.9: Matches AUTH_FAILED pattern', 'SECURITY');
}

// ============================================================================
// TEST: BUILD/COMPILATION ERRORS
// ============================================================================

testGroup('BUILD/COMPILATION Errors');

{
  const errorMsg = 'TypeScript compilation failed: Property "name" does not exist on type "User"';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 3.1: Compilation error detected', 'BUILD');
  assert(result.id === 'BUILD_COMPILATION_ERROR', 'Test 3.2: Correct error ID (BUILD_COMPILATION_ERROR)', 'BUILD');
  assert(result.category === ERROR_CATEGORIES.BUILD, 'Test 3.3: Category is BUILD', 'BUILD');
  assert(result.subAgents.includes('VALIDATION'), 'Test 3.4: Recommends VALIDATION sub-agent', 'BUILD');
}

{
  const errorMsg = 'Type error: Argument of type "string" is not assignable to parameter of type "number"';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 3.5: Type error detected', 'BUILD');
  assert(result.id === 'BUILD_TYPE_ERROR', 'Test 3.6: Correct error ID (BUILD_TYPE_ERROR)', 'BUILD');
  assert(result.severity === SEVERITY_LEVELS.MEDIUM, 'Test 3.7: Severity is MEDIUM', 'BUILD');
}

{
  const errorMsg = 'npm ERR! Peer dependency "@types/react@^18.0.0" not found';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 3.8: Dependency error detected', 'BUILD');
  assert(result.id === 'BUILD_DEPENDENCY_ERROR', 'Test 3.9: Correct error ID (BUILD_DEPENDENCY_ERROR)', 'BUILD');
  assert(result.category === ERROR_CATEGORIES.DEPENDENCY, 'Test 3.10: Category is DEPENDENCY', 'BUILD');
  assert(result.autoRecovery === true, 'Test 3.11: Supports auto-recovery', 'BUILD');
}

// ============================================================================
// TEST: RUNTIME ERRORS
// ============================================================================

testGroup('RUNTIME Errors');

{
  const errorMsg = 'TypeError: Cannot read property "id" of undefined';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 4.1: Null reference error detected', 'RUNTIME');
  assert(result.id === 'RUNTIME_NULL_REFERENCE', 'Test 4.2: Correct error ID (RUNTIME_NULL_REFERENCE)', 'RUNTIME');
  assert(result.category === ERROR_CATEGORIES.RUNTIME, 'Test 4.3: Category is RUNTIME', 'RUNTIME');
}

{
  const errorMsg = 'Error: API request failed with status 500 Internal Server Error';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 4.4: API error detected', 'RUNTIME');
  assert(result.id === 'RUNTIME_API_ERROR', 'Test 4.5: Correct error ID (RUNTIME_API_ERROR)', 'RUNTIME');
  assert(result.category === ERROR_CATEGORIES.NETWORK, 'Test 4.6: Category is NETWORK', 'RUNTIME');
}

{
  const errorMsg = 'ReferenceError: Cannot access "user" before initialization';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 4.7: Initialization error detected', 'RUNTIME');
  assert(result.id === 'RUNTIME_NULL_REFERENCE', 'Test 4.8: Matches null reference pattern', 'RUNTIME');
}

// ============================================================================
// TEST: TEST ERRORS
// ============================================================================

testGroup('TEST Errors');

{
  const errorMsg = 'Playwright error: Test timeout of 30000ms exceeded';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 5.1: E2E timeout error detected', 'TEST');
  assert(result.id === 'TEST_E2E_TIMEOUT', 'Test 5.2: Correct error ID (TEST_E2E_TIMEOUT)', 'TEST');
  assert(result.category === ERROR_CATEGORIES.TEST, 'Test 5.3: Category is TEST', 'TEST');
  assert(result.subAgents.includes('TESTING'), 'Test 5.4: Recommends TESTING sub-agent', 'TEST');
  assert(result.subAgents.includes('PERFORMANCE'), 'Test 5.5: Recommends PERFORMANCE sub-agent', 'TEST');
}

{
  const errorMsg = 'Test failed: Expected "John Doe" but got "Jane Smith"';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 5.6: Assertion failure detected', 'TEST');
  assert(result.id === 'TEST_ASSERTION_FAILURE', 'Test 5.7: Correct error ID (TEST_ASSERTION_FAILURE)', 'TEST');
  assert(result.severity === SEVERITY_LEVELS.MEDIUM, 'Test 5.8: Severity is MEDIUM', 'TEST');
}

{
  const errorMsg = 'Playwright error: Selector "#submit-button" not found';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 5.9: Selector error detected', 'TEST');
  assert(result.id === 'TEST_SELECTOR_NOT_FOUND', 'Test 5.10: Correct error ID (TEST_SELECTOR_NOT_FOUND)', 'TEST');
  assert(result.subAgents.includes('TESTING'), 'Test 5.11: Recommends TESTING sub-agent', 'TEST');
  assert(result.subAgents.includes('DESIGN'), 'Test 5.12: Recommends DESIGN sub-agent', 'TEST');
}

// ============================================================================
// TEST: PERFORMANCE ERRORS
// ============================================================================

testGroup('PERFORMANCE Errors');

{
  const errorMsg = 'JavaScript heap out of memory';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 6.1: Memory leak error detected', 'PERFORMANCE');
  assert(result.id === 'PERFORMANCE_MEMORY_LEAK', 'Test 6.2: Correct error ID (PERFORMANCE_MEMORY_LEAK)', 'PERFORMANCE');
  assert(result.category === ERROR_CATEGORIES.PERFORMANCE, 'Test 6.3: Category is PERFORMANCE', 'PERFORMANCE');
  assert(result.severity === SEVERITY_LEVELS.HIGH, 'Test 6.4: Severity is HIGH', 'PERFORMANCE');
}

{
  const errorMsg = 'Database error: Query exceeded maximum execution time of 30 seconds';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 6.5: Slow query error detected', 'PERFORMANCE');
  assert(result.id === 'PERFORMANCE_SLOW_QUERY', 'Test 6.6: Correct error ID (PERFORMANCE_SLOW_QUERY)', 'PERFORMANCE');
  assert(result.subAgents.includes('PERFORMANCE'), 'Test 6.7: Recommends PERFORMANCE sub-agent', 'PERFORMANCE');
  assert(result.subAgents.includes('DATABASE'), 'Test 6.8: Recommends DATABASE sub-agent', 'PERFORMANCE');
}

// ============================================================================
// TEST: UI/COMPONENT ERRORS
// ============================================================================

testGroup('UI/COMPONENT Errors');

{
  const errorMsg = 'React hydration failed: Text content does not match server-rendered HTML';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 7.1: Hydration error detected', 'UI');
  assert(result.id === 'UI_HYDRATION_ERROR', 'Test 7.2: Correct error ID (UI_HYDRATION_ERROR)', 'UI');
  assert(result.category === ERROR_CATEGORIES.UI_COMPONENT, 'Test 7.3: Category is UI_COMPONENT', 'UI');
  assert(result.subAgents.includes('DESIGN'), 'Test 7.4: Recommends DESIGN sub-agent', 'UI');
}

{
  const errorMsg = 'React Error: Maximum update depth exceeded in component';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 7.5: Component error detected', 'UI');
  assert(result.id === 'UI_COMPONENT_ERROR', 'Test 7.6: Correct error ID (UI_COMPONENT_ERROR)', 'UI');
  assert(result.severity === SEVERITY_LEVELS.MEDIUM, 'Test 7.7: Severity is MEDIUM', 'UI');
}

{
  const errorMsg = 'React Error: Hook called conditionally - violates rules of hooks';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 7.8: Hook error detected', 'UI');
  assert(result.id === 'UI_COMPONENT_ERROR', 'Test 7.9: Matches component error pattern', 'UI');
}

// ============================================================================
// TEST: CI/CD ERRORS
// ============================================================================

testGroup('CI/CD Errors');

{
  const errorMsg = 'GitHub Actions: Build failed in workflow "CI Pipeline"';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 8.1: CI/CD build error detected', 'CICD');
  assert(result.id === 'CICD_BUILD_FAILURE', 'Test 8.2: Correct error ID (CICD_BUILD_FAILURE)', 'CICD');
  assert(result.category === ERROR_CATEGORIES.BUILD, 'Test 8.3: Category is BUILD', 'CICD');
  assert(result.subAgents.includes('GITHUB'), 'Test 8.4: Recommends GITHUB sub-agent', 'CICD');
}

{
  const errorMsg = 'GitHub Actions: 15 tests failed in CI pipeline';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 8.5: CI test failure detected', 'CICD');
  assert(result.id === 'CICD_TEST_FAILURE', 'Test 8.6: Correct error ID (CICD_TEST_FAILURE)', 'CICD');
  assert(result.subAgents.includes('TESTING'), 'Test 8.7: Recommends TESTING sub-agent', 'CICD');
  assert(result.subAgents.includes('GITHUB'), 'Test 8.8: Recommends GITHUB sub-agent', 'CICD');
}

// ============================================================================
// TEST: SUB-AGENT RECOMMENDATIONS
// ============================================================================

testGroup('Sub-Agent Recommendations');

{
  const errorMsg = 'PostgreSQL connection refused';
  const errorInfo = detectError(errorMsg);
  const recommendation = recommendSubAgent(errorInfo);

  assert(recommendation.recommended.length > 0, 'Test 9.1: Recommendation provided', 'RECOMMENDATIONS');
  assert(recommendation.recommended[0].code === 'DATABASE', 'Test 9.2: Recommends DATABASE agent', 'RECOMMENDATIONS');
  assert(recommendation.severity === SEVERITY_LEVELS.CRITICAL, 'Test 9.3: Severity preserved', 'RECOMMENDATIONS');
  assert(recommendation.autoRecovery === false, 'Test 9.4: Auto-recovery flag correct', 'RECOMMENDATIONS');
  assert(recommendation.recommended[0].autoInvoke === true, 'Test 9.5: Auto-invoke enabled for CRITICAL', 'RECOMMENDATIONS');
}

{
  const errorMsg = 'npm ERR! Peer dependency missing';
  const errorInfo = detectError(errorMsg);
  const recommendation = recommendSubAgent(errorInfo);

  assert(recommendation.autoRecovery === true, 'Test 9.6: Auto-recovery available', 'RECOMMENDATIONS');
  assert(recommendation.autoRecoverySteps.length > 0, 'Test 9.7: Auto-recovery steps provided', 'RECOMMENDATIONS');
  assert(recommendation.autoRecoverySteps[0] === 'npm install', 'Test 9.8: Correct recovery step', 'RECOMMENDATIONS');
}

{
  const errorMsg = 'Playwright timeout exceeded';
  const errorInfo = detectError(errorMsg);
  const recommendation = recommendSubAgent(errorInfo);

  assert(recommendation.recommended.length === 2, 'Test 9.9: Multiple sub-agents recommended', 'RECOMMENDATIONS');
  const agentCodes = recommendation.recommended.map(r => r.code);
  assert(agentCodes.includes('TESTING'), 'Test 9.10: TESTING agent recommended', 'RECOMMENDATIONS');
  assert(agentCodes.includes('PERFORMANCE'), 'Test 9.11: PERFORMANCE agent recommended', 'RECOMMENDATIONS');
}

// ============================================================================
// TEST: UTILITY FUNCTIONS
// ============================================================================

testGroup('Utility Functions');

{
  const dbPatterns = getPatternsByCategory(ERROR_CATEGORIES.DATABASE);
  assert(dbPatterns.length > 0, 'Test 10.1: getPatternsByCategory returns results', 'UTILITIES');
  assert(dbPatterns.every(p => p.category === ERROR_CATEGORIES.DATABASE), 'Test 10.2: All patterns are DATABASE category', 'UTILITIES');
}

{
  const dbAgentPatterns = getPatternsBySubAgent('DATABASE');
  assert(dbAgentPatterns.length > 0, 'Test 10.3: getPatternsBySubAgent returns results', 'UTILITIES');
  assert(dbAgentPatterns.every(p => p.subAgents.includes('DATABASE')), 'Test 10.4: All patterns recommend DATABASE', 'UTILITIES');
}

{
  const stats = getLibraryStats();
  assert(stats.totalPatterns > 0, 'Test 10.5: Library has patterns', 'UTILITIES');
  assert(stats.totalPatterns === ERROR_PATTERNS.length, 'Test 10.6: Total patterns count correct', 'UTILITIES');
  assert(Object.keys(stats.byCategory).length > 0, 'Test 10.7: Category breakdown exists', 'UTILITIES');
  assert(Object.keys(stats.bySeverity).length > 0, 'Test 10.8: Severity breakdown exists', 'UTILITIES');
  assert(Object.keys(stats.bySubAgent).length > 0, 'Test 10.9: Sub-agent breakdown exists', 'UTILITIES');
  assert(typeof stats.autoRecoverableCount === 'number', 'Test 10.10: Auto-recoverable count exists', 'UTILITIES');
}

// ============================================================================
// TEST: UNKNOWN ERRORS
// ============================================================================

testGroup('Unknown Error Handling');

{
  const errorMsg = 'Some completely unknown error that does not match any pattern';
  const result = detectError(errorMsg);
  assert(result !== null, 'Test 11.1: Unknown error returns result', 'UNKNOWN');
  assert(result.id === 'UNKNOWN_ERROR', 'Test 11.2: Error ID is UNKNOWN_ERROR', 'UNKNOWN');
  assert(result.subAgents.includes('VALIDATION'), 'Test 11.3: Defaults to VALIDATION agent', 'UNKNOWN');
  assert(result.confidence < 50, 'Test 11.4: Low confidence for unknown errors', 'UNKNOWN');
}

{
  const result = detectError(null);
  assert(result === null, 'Test 11.5: Null input returns null', 'UNKNOWN');
}

{
  const result = detectError('');
  assert(result === null, 'Test 11.6: Empty string returns null', 'UNKNOWN');
}

// ============================================================================
// TEST: CONFIDENCE SCORING
// ============================================================================

testGroup('Confidence Scoring');

{
  const errorMsg = 'PostgreSQL connection refused to database server timeout';
  const result = detectError(errorMsg);
  assert(result.confidence >= 70, 'Test 12.1: Base confidence is 70+', 'CONFIDENCE');
  assert(result.confidence <= 100, 'Test 12.2: Confidence capped at 100', 'CONFIDENCE');
}

{
  const criticalError = 'Migration failed - database unavailable';
  const result1 = detectError(criticalError);
  const mediumError = 'Type error in function signature';
  const result2 = detectError(mediumError);

  assert(result1.severity === SEVERITY_LEVELS.CRITICAL, 'Test 12.3: First error is CRITICAL', 'CONFIDENCE');
  assert(result2.severity === SEVERITY_LEVELS.MEDIUM, 'Test 12.4: Second error is MEDIUM', 'CONFIDENCE');
  assert(result1.confidence >= result2.confidence, 'Test 12.5: CRITICAL has higher/equal confidence', 'CONFIDENCE');
}

// ============================================================================
// TEST SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log('📊 TEST SUMMARY');
console.log('='.repeat(60));
console.log(`Total Tests: ${results.total}`);
console.log(`✅ Passed: ${results.passed} (${Math.round(results.passed / results.total * 100)}%)`);
console.log(`❌ Failed: ${results.failed}`);
console.log('');

console.log('By Test Group:');
Object.entries(results.groups).forEach(([group, stats]) => {
  const percentage = Math.round(stats.passed / stats.total * 100);
  const status = stats.failed === 0 ? '✅' : '❌';
  console.log(`  ${status} ${group}: ${stats.passed}/${stats.total} (${percentage}%)`);
});

console.log('');
console.log('Library Statistics:');
const stats = getLibraryStats();
console.log(`  Total Patterns: ${stats.totalPatterns}`);
console.log(`  Auto-Recoverable: ${stats.autoRecoverableCount}`);
console.log('  By Category:', JSON.stringify(stats.byCategory, null, 2).replace(/\n/g, '\n    '));
console.log('  By Severity:', JSON.stringify(stats.bySeverity, null, 2).replace(/\n/g, '\n    '));
console.log('');

// Exit with appropriate code
process.exit(results.failed > 0 ? 1 : 0);
