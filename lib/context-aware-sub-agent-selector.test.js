/**
 * Comprehensive Test Suite for Context-Aware Sub-Agent Selector
 *
 * Tests all 9 domain keyword mappings, exclusion patterns, coordination groups,
 * confidence scoring, and edge cases.
 *
 * Run: node lib/context-aware-sub-agent-selector.test.js
 */

import {
  selectSubAgents,
  DOMAIN_KEYWORDS as _DOMAIN_KEYWORDS,
  COORDINATION_GROUPS as _COORDINATION_GROUPS
} from './context-aware-sub-agent-selector.js';

// Test utilities
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, expected, actual) {
  totalTests++;
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passedTests++;
    return true;
  } else {
    console.log(`❌ FAIL: ${testName}`);
    console.log(`   Expected: ${JSON.stringify(expected)}`);
    console.log(`   Actual: ${JSON.stringify(actual)}`);
    failedTests++;
    return false;
  }
}

function createMockSD(title, description, technicalNotes = '') {
  return {
    id: 'TEST-001',
    title,
    description,
    business_value: '',
    acceptance_criteria: '',
    technical_notes: technicalNotes,
    status: 'draft'
  };
}

// Test Suite
console.log('\n🧪 CONTEXT-AWARE SUB-AGENT SELECTOR - COMPREHENSIVE TEST SUITE\n');
console.log('=' .repeat(80));

// ============================================================================
// TEST GROUP 1: DATABASE DOMAIN
// ============================================================================
console.log('\n📊 TEST GROUP 1: DATABASE DOMAIN');
console.log('-'.repeat(80));

// Test 1.1: Strong database signals
{
  const sd = createMockSD(
    'Database Migration for User Tables',
    'Create migration scripts for user authentication tables with RLS policies'
  );
  const result = selectSubAgents(sd);
  const hasDatabase = result.recommended.some(r => r.code === 'DATABASE');
  assert(
    hasDatabase,
    'Test 1.1: Strong database signals trigger DATABASE agent',
    'DATABASE agent recommended',
    hasDatabase ? 'DATABASE agent recommended' : 'No DATABASE agent'
  );
}

// Test 1.2: Exclusion pattern - UI table component
{
  const sd = createMockSD(
    'Data Table Component',
    'Create a responsive HTML table component for displaying user data in the UI'
  );
  const result = selectSubAgents(sd);
  const hasDatabase = result.recommended.some(r => r.code === 'DATABASE');
  assert(
    !hasDatabase,
    'Test 1.2: UI table component does NOT trigger DATABASE agent (exclusion)',
    'No DATABASE agent',
    hasDatabase ? 'DATABASE agent (WRONG)' : 'No DATABASE agent'
  );
}

// Test 1.3: PostgreSQL specific keywords
{
  const sd = createMockSD(
    'Optimize PostgreSQL Queries',
    'Add indexes and optimize slow queries in Supabase PostgreSQL database'
  );
  const result = selectSubAgents(sd);
  const hasDatabase = result.recommended.some(r => r.code === 'DATABASE');
  assert(
    hasDatabase,
    'Test 1.3: PostgreSQL/Supabase keywords trigger DATABASE agent',
    'DATABASE agent recommended',
    hasDatabase ? 'DATABASE agent recommended' : 'No DATABASE agent'
  );
}

// ============================================================================
// TEST GROUP 2: SECURITY DOMAIN
// ============================================================================
console.log('\n🔒 TEST GROUP 2: SECURITY DOMAIN');
console.log('-'.repeat(80));

// Test 2.1: Authentication feature
{
  const sd = createMockSD(
    'User Authentication System',
    'Implement login, logout, session management, and password reset functionality'
  );
  const result = selectSubAgents(sd);
  const hasSecurity = result.recommended.some(r => r.code === 'SECURITY');
  assert(
    hasSecurity,
    'Test 2.1: Authentication keywords trigger SECURITY agent',
    'SECURITY agent recommended',
    hasSecurity ? 'SECURITY agent recommended' : 'No SECURITY agent'
  );
}

// Test 2.2: RLS policies
{
  const sd = createMockSD(
    'Row Level Security Implementation',
    'Add RLS policies to restrict data access based on user roles and permissions'
  );
  const result = selectSubAgents(sd);
  const hasSecurity = result.recommended.some(r => r.code === 'SECURITY');
  assert(
    hasSecurity,
    'Test 2.2: RLS policy keywords trigger SECURITY agent',
    'SECURITY agent recommended',
    hasSecurity ? 'SECURITY agent recommended' : 'No SECURITY agent'
  );
}

// Test 2.3: Exclusion - "security deposit" should not trigger
{
  const sd = createMockSD(
    'Property Security Deposit',
    'Handle security deposit refunds and job security for employees'
  );
  const result = selectSubAgents(sd);
  const hasSecurity = result.recommended.some(r => r.code === 'SECURITY');
  assert(
    !hasSecurity,
    'Test 2.3: Exclusion pattern prevents false positive (security deposit)',
    'No SECURITY agent',
    hasSecurity ? 'SECURITY agent (WRONG)' : 'No SECURITY agent'
  );
}

// ============================================================================
// TEST GROUP 3: DESIGN DOMAIN
// ============================================================================
console.log('\n🎨 TEST GROUP 3: DESIGN DOMAIN');
console.log('-'.repeat(80));

// Test 3.1: Responsive UI component
{
  const sd = createMockSD(
    'Responsive Navigation Menu',
    'Design and implement a mobile-responsive navigation menu with accessibility features'
  );
  const result = selectSubAgents(sd);
  const hasDesign = result.recommended.some(r => r.code === 'DESIGN');
  assert(
    hasDesign,
    'Test 3.1: UI/UX keywords trigger DESIGN agent',
    'DESIGN agent recommended',
    hasDesign ? 'DESIGN agent recommended' : 'No DESIGN agent'
  );
}

// Test 3.2: Accessibility (a11y) focus
{
  const sd = createMockSD(
    'Improve Form Accessibility',
    'Enhance form accessibility with ARIA labels, keyboard navigation, and screen reader support'
  );
  const result = selectSubAgents(sd);
  const hasDesign = result.recommended.some(r => r.code === 'DESIGN');
  assert(
    hasDesign,
    'Test 3.2: Accessibility keywords trigger DESIGN agent',
    'DESIGN agent recommended',
    hasDesign ? 'DESIGN agent recommended' : 'No DESIGN agent'
  );
}

// Test 3.3: Exclusion - TypeScript interface should not trigger
{
  const sd = createMockSD(
    'TypeScript Interface Definitions',
    'Define TypeScript interfaces for API responses and component props'
  );
  const result = selectSubAgents(sd);
  const hasDesign = result.recommended.some(r => r.code === 'DESIGN');
  assert(
    !hasDesign,
    'Test 3.3: TypeScript interface does NOT trigger DESIGN agent (exclusion)',
    'No DESIGN agent',
    hasDesign ? 'DESIGN agent (WRONG)' : 'No DESIGN agent'
  );
}

// ============================================================================
// TEST GROUP 4: PERFORMANCE DOMAIN
// ============================================================================
console.log('\n⚡ TEST GROUP 4: PERFORMANCE DOMAIN');
console.log('-'.repeat(80));

// Test 4.1: Performance optimization
{
  const sd = createMockSD(
    'Optimize Page Load Performance',
    'Improve page load speed by optimizing bundle size, lazy loading, and caching strategies'
  );
  const result = selectSubAgents(sd);
  const hasPerformance = result.recommended.some(r => r.code === 'PERFORMANCE');
  assert(
    hasPerformance,
    'Test 4.1: Performance keywords trigger PERFORMANCE agent',
    'PERFORMANCE agent recommended',
    hasPerformance ? 'PERFORMANCE agent recommended' : 'No PERFORMANCE agent'
  );
}

// Test 4.2: Scalability concerns
{
  const sd = createMockSD(
    'Scale API for High Traffic',
    'Optimize API endpoints to handle increased load and improve latency under high traffic'
  );
  const result = selectSubAgents(sd);
  const hasPerformance = result.recommended.some(r => r.code === 'PERFORMANCE');
  assert(
    hasPerformance,
    'Test 4.2: Scalability keywords trigger PERFORMANCE agent',
    'PERFORMANCE agent recommended',
    hasPerformance ? 'PERFORMANCE agent recommended' : 'No PERFORMANCE agent'
  );
}

// ============================================================================
// TEST GROUP 5: TESTING DOMAIN
// ============================================================================
console.log('\n🧪 TEST GROUP 5: TESTING DOMAIN');
console.log('-'.repeat(80));

// Test 5.1: E2E test implementation
{
  const sd = createMockSD(
    'E2E Test Suite for Checkout Flow',
    'Implement comprehensive E2E tests using Playwright for the checkout user flow'
  );
  const result = selectSubAgents(sd);
  const hasTesting = result.recommended.some(r => r.code === 'TESTING');
  assert(
    hasTesting,
    'Test 5.1: E2E test keywords trigger TESTING agent',
    'TESTING agent recommended',
    hasTesting ? 'TESTING agent recommended' : 'No TESTING agent'
  );
}

// Test 5.2: Unit test coverage
{
  const sd = createMockSD(
    'Improve Unit Test Coverage',
    'Add unit tests for service layer and increase coverage to 80% using Vitest'
  );
  const result = selectSubAgents(sd);
  const hasTesting = result.recommended.some(r => r.code === 'TESTING');
  assert(
    hasTesting,
    'Test 5.2: Unit test keywords trigger TESTING agent',
    'TESTING agent recommended',
    hasTesting ? 'TESTING agent recommended' : 'No TESTING agent'
  );
}

// ============================================================================
// TEST GROUP 6: VALIDATION DOMAIN
// ============================================================================
console.log('\n✅ TEST GROUP 6: VALIDATION DOMAIN');
console.log('-'.repeat(80));

// Test 6.1: Codebase audit
{
  const sd = createMockSD(
    'Audit Existing Authentication Implementation',
    'Perform codebase validation to check for existing authentication patterns and duplicates'
  );
  const result = selectSubAgents(sd);
  const hasValidation = result.recommended.some(r => r.code === 'VALIDATION');
  assert(
    hasValidation,
    'Test 6.1: Validation keywords trigger VALIDATION agent',
    'VALIDATION agent recommended',
    hasValidation ? 'VALIDATION agent recommended' : 'No VALIDATION agent'
  );
}

// Test 6.2: Duplicate detection
{
  const sd = createMockSD(
    'Check for Duplicate Features',
    'Search codebase for existing implementations before building new reporting feature'
  );
  const result = selectSubAgents(sd);
  const hasValidation = result.recommended.some(r => r.code === 'VALIDATION');
  assert(
    hasValidation,
    'Test 6.2: Duplicate check keywords trigger VALIDATION agent',
    'VALIDATION agent recommended',
    hasValidation ? 'VALIDATION agent recommended' : 'No VALIDATION agent'
  );
}

// ============================================================================
// TEST GROUP 7: DOCMON DOMAIN
// ============================================================================
console.log('\n📚 TEST GROUP 7: DOCMON DOMAIN');
console.log('-'.repeat(80));

// Test 7.1: Documentation generation
{
  const sd = createMockSD(
    'Generate API Documentation',
    'Create comprehensive API documentation with examples and usage guides'
  );
  const result = selectSubAgents(sd);
  const hasDocmon = result.recommended.some(r => r.code === 'DOCMON');
  assert(
    hasDocmon,
    'Test 7.1: Documentation keywords trigger DOCMON agent',
    'DOCMON agent recommended',
    hasDocmon ? 'DOCMON agent recommended' : 'No DOCMON agent'
  );
}

// Test 7.2: README updates
{
  const sd = createMockSD(
    'Update Project README',
    'Update README with setup instructions, architecture overview, and contribution guidelines'
  );
  const result = selectSubAgents(sd);
  const hasDocmon = result.recommended.some(r => r.code === 'DOCMON');
  assert(
    hasDocmon,
    'Test 7.2: README keywords trigger DOCMON agent',
    'DOCMON agent recommended',
    hasDocmon ? 'DOCMON agent recommended' : 'No DOCMON agent'
  );
}

// ============================================================================
// TEST GROUP 8: GITHUB/CI/CD DOMAIN
// ============================================================================
console.log('\n🔧 TEST GROUP 8: GITHUB/CI/CD DOMAIN');
console.log('-'.repeat(80));

// Test 8.1: GitHub Actions workflow
{
  const sd = createMockSD(
    'Setup CI/CD Pipeline',
    'Configure GitHub Actions workflow for automated testing and deployment'
  );
  const result = selectSubAgents(sd);
  const hasGithub = result.recommended.some(r => r.code === 'GITHUB');
  assert(
    hasGithub,
    'Test 8.1: CI/CD keywords trigger GITHUB agent',
    'GITHUB agent recommended',
    hasGithub ? 'GITHUB agent recommended' : 'No GITHUB agent'
  );
}

// Test 8.2: Pipeline optimization
{
  const sd = createMockSD(
    'Optimize Build Pipeline',
    'Improve CI pipeline build time with caching and parallel job execution'
  );
  const result = selectSubAgents(sd);
  const hasGithub = result.recommended.some(r => r.code === 'GITHUB');
  assert(
    hasGithub,
    'Test 8.2: Pipeline keywords trigger GITHUB agent',
    'GITHUB agent recommended',
    hasGithub ? 'GITHUB agent recommended' : 'No GITHUB agent'
  );
}

// ============================================================================
// TEST GROUP 9: UAT DOMAIN
// ============================================================================
console.log('\n👥 TEST GROUP 9: UAT DOMAIN');
console.log('-'.repeat(80));

// Test 9.1: User acceptance testing
{
  const sd = createMockSD(
    'UAT for New Reporting Feature',
    'Execute user acceptance testing to validate reporting feature meets stakeholder requirements'
  );
  const result = selectSubAgents(sd);
  const hasUat = result.recommended.some(r => r.code === 'UAT');
  assert(
    hasUat,
    'Test 9.1: UAT keywords trigger UAT agent',
    'UAT agent recommended',
    hasUat ? 'UAT agent recommended' : 'No UAT agent'
  );
}

// Test 9.2: Acceptance criteria validation
{
  const sd = createMockSD(
    'Validate Acceptance Criteria',
    'Review user stories and validate acceptance testing passes for all scenarios'
  );
  const result = selectSubAgents(sd);
  const hasUat = result.recommended.some(r => r.code === 'UAT');
  assert(
    hasUat,
    'Test 9.2: Acceptance testing keywords trigger UAT agent',
    'UAT agent recommended',
    hasUat ? 'UAT agent recommended' : 'No UAT agent'
  );
}

// ============================================================================
// TEST GROUP 10: COORDINATION GROUPS
// ============================================================================
console.log('\n🤝 TEST GROUP 10: COORDINATION GROUPS');
console.log('-'.repeat(80));

// Test 10.1: Authentication feature (SECURITY + DATABASE)
{
  const sd = createMockSD(
    'User Authentication System',
    'Implement login, logout, session management with RLS policies on user tables'
  );
  const result = selectSubAgents(sd);
  const hasSecurity = result.recommended.some(r => r.code === 'SECURITY');
  const hasDatabase = result.recommended.some(r => r.code === 'DATABASE');
  const hasCoordination = result.coordinationGroups.length > 0;
  assert(
    hasSecurity && hasDatabase && hasCoordination,
    'Test 10.1: Auth feature triggers SECURITY + DATABASE coordination',
    'Both agents + coordination group',
    `SECURITY: ${hasSecurity}, DATABASE: ${hasDatabase}, Coordination: ${hasCoordination}`
  );
}

// Test 10.2: API endpoint (SECURITY + DATABASE + PERFORMANCE)
{
  const sd = createMockSD(
    'High-Performance API Endpoint',
    'Build secure REST API endpoint with database queries and performance optimization'
  );
  const result = selectSubAgents(sd);
  const hasSecurity = result.recommended.some(r => r.code === 'SECURITY');
  const hasDatabase = result.recommended.some(r => r.code === 'DATABASE');
  const hasPerformance = result.recommended.some(r => r.code === 'PERFORMANCE');
  assert(
    hasSecurity && hasDatabase && hasPerformance,
    'Test 10.2: API endpoint triggers SECURITY + DATABASE + PERFORMANCE',
    'All three agents recommended',
    `SECURITY: ${hasSecurity}, DATABASE: ${hasDatabase}, PERFORMANCE: ${hasPerformance}`
  );
}

// Test 10.3: Coordination should NOT trigger without strong signals
{
  const sd = createMockSD(
    'Update Documentation',
    'Update user guide with new feature descriptions'
  );
  const result = selectSubAgents(sd);
  const hasCoordination = result.coordinationGroups.length > 0;
  assert(
    !hasCoordination,
    'Test 10.3: Weak signals do NOT trigger coordination groups',
    'No coordination groups',
    hasCoordination ? 'Coordination triggered (WRONG)' : 'No coordination'
  );
}

// ============================================================================
// TEST GROUP 11: CONFIDENCE SCORING
// ============================================================================
console.log('\n📊 TEST GROUP 11: CONFIDENCE SCORING');
console.log('-'.repeat(80));

// Test 11.1: High confidence (75%+)
{
  const sd = createMockSD(
    'Database Migration Scripts',
    'Create comprehensive database migration scripts for PostgreSQL with schema changes, indexes, and RLS policies'
  );
  const result = selectSubAgents(sd);
  const dbAgent = result.recommended.find(r => r.code === 'DATABASE');
  const highConfidence = dbAgent && dbAgent.confidence >= 75;
  assert(
    highConfidence,
    'Test 11.1: Strong signals produce high confidence (≥75%)',
    'Confidence ≥75%',
    dbAgent ? `Confidence: ${dbAgent.confidence}%` : 'No agent recommended'
  );
}

// Test 11.2: Medium confidence (50-74%)
{
  const sd = createMockSD(
    'User Profile Component',
    'Build user profile component with form validation and data management'
  );
  const result = selectSubAgents(sd);
  const hasRecommendations = result.recommended.length > 0;
  const mediumConfidence = result.recommended.some(r => r.confidence >= 50 && r.confidence < 75);
  assert(
    mediumConfidence || !hasRecommendations,
    'Test 11.2: Moderate signals produce medium confidence (50-74%)',
    'Medium confidence or no recommendation',
    hasRecommendations ? `Confidence range: ${result.recommended[0].confidence}%` : 'No recommendations'
  );
}

// Test 11.3: Below threshold (< 50%)
{
  const sd = createMockSD(
    'General Code Refactoring',
    'Refactor code for better maintainability'
  );
  const result = selectSubAgents(sd);
  const lowSignals = result.recommended.length === 0 || result.recommended.every(r => r.confidence < 50);
  assert(
    lowSignals,
    'Test 11.3: Weak signals produce no recommendations (below 50% threshold)',
    'No recommendations or low confidence',
    result.recommended.length === 0 ? 'No recommendations' : `Lowest: ${result.recommended[0].confidence}%`
  );
}

// ============================================================================
// TEST GROUP 12: EDGE CASES
// ============================================================================
console.log('\n🔍 TEST GROUP 12: EDGE CASES');
console.log('-'.repeat(80));

// Test 12.1: Empty input
{
  const sd = createMockSD('', '');
  const result = selectSubAgents(sd);
  assert(
    result.recommended.length === 0,
    'Test 12.1: Empty input produces no recommendations',
    'No recommendations',
    `${result.recommended.length} recommendations`
  );
}

// Test 12.2: No keyword matches
{
  const sd = createMockSD(
    'Random Task',
    'Complete miscellaneous administrative tasks'
  );
  const result = selectSubAgents(sd);
  assert(
    result.recommended.length === 0,
    'Test 12.2: No keyword matches produces no recommendations',
    'No recommendations',
    `${result.recommended.length} recommendations`
  );
}

// Test 12.3: Multiple domains triggered
{
  const sd = createMockSD(
    'Secure Database-Driven UI with E2E Testing',
    'Implement authentication system with database schema migrations and RLS policies. Build responsive UI components with accessibility features. Add comprehensive E2E test coverage using Playwright.',
    ''
  );
  const result = selectSubAgents(sd);
  const multipleDomains = result.recommended.length >= 3;
  assert(
    multipleDomains,
    'Test 12.3: Multiple strong signals trigger multiple agents',
    '≥3 agents recommended',
    `${result.recommended.length} agents recommended`
  );
}

// Test 12.4: Title weighting (title > description)
{
  const sd1 = createMockSD(
    'Database Migration and Schema Design',
    'General system updates and improvements'
  );
  const sd2 = createMockSD(
    'General System Updates',
    'Database migration and schema design updates'
  );
  const result1 = selectSubAgents(sd1);
  const result2 = selectSubAgents(sd2);
  const db1 = result1.recommended.find(r => r.code === 'DATABASE');
  const db2 = result2.recommended.find(r => r.code === 'DATABASE');

  // SD1 should have higher confidence for DATABASE (keywords in title)
  const titleWeighted = db1 && db2 && db1.confidence > db2.confidence;
  assert(
    titleWeighted || (db1 && !db2),
    'Test 12.4: Title keywords weighted higher than description keywords',
    'Title produces higher confidence',
    db1 && db2 ? `Title: ${db1.confidence}%, Description: ${db2.confidence}%` : 'One or both missing'
  );
}

// ============================================================================
// TEST SUMMARY
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('📋 TEST SUMMARY');
console.log('='.repeat(80));
console.log(`Total Tests: ${totalTests}`);
console.log(`✅ Passed: ${passedTests} (${Math.round(passedTests/totalTests*100)}%)`);
console.log(`❌ Failed: ${failedTests} (${Math.round(failedTests/totalTests*100)}%)`);
console.log('='.repeat(80));

// Exit with proper code
if (failedTests > 0) {
  console.log('\n⚠️  Some tests failed. Review failures above.');
  process.exit(1);
} else {
  console.log('\n🎉 All tests passed!');
  process.exit(0);
}
