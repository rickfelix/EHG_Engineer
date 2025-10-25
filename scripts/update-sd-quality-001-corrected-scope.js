#!/usr/bin/env node

/**
 * Update SD-QUALITY-001 with Corrected Scope: Unit Test Coverage Gap
 * Based on investigation findings from SD-QUALITY-001 root cause analysis
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function updateSDQUALITY001() {
  console.log('📋 Updating SD-QUALITY-001 with corrected scope...\n');

  const updatedSD = {
    title: 'Unit Test Coverage Gap - Business Logic Testing',

    description: `EHG application has extensive E2E (Playwright), integration, accessibility, security, and performance test coverage (63 total test files), but only 4 unit test files covering 528 source files in src/ directory.

**ACTUAL STATE (Discovered via Investigation)**:
- ✅ 63 test files in /mnt/c/_EHG/ehg/tests/
- ✅ Extensive E2E test suite (Playwright)
- ✅ Integration tests configured
- ✅ Accessibility tests (a11y)
- ✅ Security and performance tests
- ❌ Only 4 unit test files in tests/unit/
- ❌ 528 source files in src/ with minimal unit test coverage
- ❌ Estimated unit test coverage: ~5-10%

**ORIGINAL MISREPRESENTATION**:
- Claimed: "362,538 LOC with 6 test files (0.001% coverage)"
- Reality: 63 test files with extensive E2E/integration coverage
- Actual gap: Unit test coverage for business logic

**ROOT CAUSE**:
- Tests for EHG stored in /mnt/c/_EHG/ehg/tests/
- Tests for EHG_Engineer stored in /mnt/c/_EHG/EHG_Engineer/tests/
- Multi-application architecture was not documented
- Original SD author looked in wrong location or only counted unit tests

**TARGET OUTCOME**:
- Achieve 50% unit test coverage for critical business logic
- Focus on src/services/, src/utils/, src/hooks/
- Add 40-60 unit test files targeting high-value code paths
- Maintain existing E2E/integration test coverage`,

    scope: `1. **Unit Test Infrastructure Verification** (Week 1)
   - Verify Vitest configuration (vitest.config.ts)
   - Confirm coverage reporting (v8 provider)
   - Create test utilities and fixtures
   - Set up test data factories

2. **Core Business Logic Testing** (Weeks 2-3)
   - Test critical services in src/services/
   - Test utility functions in src/utils/
   - Test custom hooks in src/hooks/
   - Focus on high-value, frequently used code

3. **Component Logic Testing** (Week 4)
   - Test complex component logic in src/components/
   - Test state management patterns
   - Test API integration logic
   - Test data transformation utilities

4. **CI/CD Integration** (Week 5)
   - Add unit test execution to GitHub Actions
   - Configure coverage threshold enforcement (50%)
   - Set up PR test gates
   - Add coverage reporting to PRs

5. **Documentation** (Week 6)
   - Document unit testing patterns
   - Create test examples for common scenarios
   - Update team testing guidelines
   - Document test location architecture`,

    strategic_objectives: [
      'Achieve 50% unit test coverage for critical business logic in src/services/, src/utils/, src/hooks/',
      'Add 40-60 unit test files targeting high-value code paths',
      'Maintain existing E2E, integration, accessibility, security, and performance test coverage',
      'Integrate unit test execution into GitHub Actions CI/CD pipeline',
      'Document multi-application testing architecture (EHG vs EHG_Engineer)',
      'Create unit testing patterns and examples for team adoption'
    ],

    success_criteria: [
      'Unit test coverage reaches 50% for src/services/, src/utils/, src/hooks/',
      '40-60 new unit test files added to tests/unit/',
      'GitHub Actions workflow runs unit tests on every PR',
      'Coverage reports show clear metrics for unit test coverage',
      'Existing E2E and integration tests continue to pass',
      'Multi-application testing architecture documented in CLAUDE.md and docs/TESTING_ARCHITECTURE.md',
      'Team testing guidelines include unit test patterns and examples'
    ],

    key_principles: [
      'Focus on unit tests for business logic, not full test suite overhaul',
      'Maintain existing E2E, integration, a11y, security, performance tests',
      'Test critical paths first (services, hooks, utilities)',
      'Fast feedback loop with Vitest watch mode',
      'Clear separation between unit tests (fast) and integration/E2E tests (slower)',
      'Document multi-application architecture to prevent future confusion'
    ],

    implementation_guidelines: [
      '**PHASE 1: Infrastructure Verification (Week 1)**',
      '1. Verify Vitest configuration in /mnt/c/_EHG/ehg/vitest.config.ts',
      '2. Confirm v8 coverage provider and thresholds (80% configured)',
      '3. Create tests/unit/factories/ for test data generation',
      '4. Create tests/unit/mocks/ for Supabase and API mocking',
      '',
      '**PHASE 2: Services Testing (Week 2)**',
      '5. Identify critical services in src/services/ (prioritize by usage)',
      '6. Write unit tests for top 10 services',
      '7. Mock Supabase client for isolated unit testing',
      '8. Test error handling and edge cases',
      '',
      '**PHASE 3: Hooks & Utilities Testing (Week 3)**',
      '9. Test custom hooks in src/hooks/ (React Testing Library)',
      '10. Test utility functions in src/utils/',
      '11. Test data transformation and validation logic',
      '12. Achieve 50% coverage milestone',
      '',
      '**PHASE 4: Component Logic Testing (Week 4)**',
      '13. Test complex component logic (not full component rendering)',
      '14. Test state management patterns',
      '15. Test API integration logic',
      '16. Focus on business logic, not UI rendering',
      '',
      '**PHASE 5: CI/CD Integration (Week 5)**',
      '17. Update .github/workflows/ to run unit tests',
      '18. Add coverage threshold check (50% minimum)',
      '19. Configure PR comments with coverage diff',
      '20. Test CI/CD pipeline with sample PR',
      '',
      '**PHASE 6: Documentation (Week 6)**',
      '21. Document unit testing patterns in docs/TESTING_ARCHITECTURE.md',
      '22. Create example tests for services, hooks, utilities',
      '23. Update team testing guidelines',
      '24. Document multi-application architecture (already completed)'
    ],

    risks: [
      {
        risk: 'Focusing only on unit tests may miss integration issues',
        probability: 'Low',
        impact: 'Low',
        mitigation: 'Maintain existing integration and E2E test suite, only adding unit tests'
      },
      {
        risk: 'Mocking Supabase client may not match real behavior',
        probability: 'Medium',
        impact: 'Medium',
        mitigation: 'Use integration tests for critical paths, unit tests for business logic isolation'
      },
      {
        risk: 'Team may confuse test locations between EHG and EHG_Engineer',
        probability: 'Medium',
        impact: 'Low',
        mitigation: 'Documentation already created (CLAUDE.md, docs/TESTING_ARCHITECTURE.md)'
      },
      {
        risk: 'Unit test execution time may slow down development',
        probability: 'Low',
        impact: 'Low',
        mitigation: 'Vitest watch mode is fast (<1s for changed files), full suite <5 minutes target'
      }
    ],

    success_metrics: [
      {
        metric: 'Unit Test Coverage',
        target: '≥50%',
        measurement: 'Lines covered in src/services/, src/utils/, src/hooks/'
      },
      {
        metric: 'Unit Test File Count',
        target: '40-60 files',
        measurement: 'New unit test files in tests/unit/'
      },
      {
        metric: 'Unit Test Execution Time',
        target: '<5 minutes',
        measurement: 'Total time for npm run test:unit in CI/CD'
      },
      {
        metric: 'E2E/Integration Test Stability',
        target: '100% pass rate',
        measurement: 'Existing tests continue to pass without degradation'
      }
    ],

    metadata: {
      risk: 'low',
      complexity: 'medium',
      effort_hours: '80-100',
      investigation_findings: {
        original_claim: '362,538 LOC with 6 test files (0.001% coverage)',
        actual_state: '63 test files with extensive E2E/integration coverage',
        actual_gap: 'Unit test coverage for business logic (4 unit test files)',
        root_cause: 'Multi-application architecture not documented, tests in wrong location'
      },
      test_locations: {
        ehg_application: '/mnt/c/_EHG/ehg/tests/',
        ehg_engineer: '/mnt/c/_EHG/EHG_Engineer/tests/'
      },
      current_test_coverage: {
        total_test_files: 63,
        unit_test_files: 4,
        e2e_test_files: 'extensive',
        integration_test_files: 'present',
        a11y_test_files: 'present',
        security_test_files: 'present',
        performance_test_files: 'present'
      },
      target_test_coverage: {
        unit_test_files: '40-60',
        unit_coverage_percentage: '50%',
        focus_areas: ['src/services/', 'src/utils/', 'src/hooks/']
      },
      documentation_completed: [
        'CLAUDE.md Multi-Application Testing Architecture section',
        'docs/TESTING_ARCHITECTURE.md comprehensive guide',
        'LEO protocol section added to database',
        'QA Engineering Director sub-agent context updated'
      ]
    }
  };

  // Update the strategic directive
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update(updatedSD)
    .eq('id', 'SD-QUALITY-001')
    .select()
    .single();

  if (error) {
    console.error('❌ Error updating SD-QUALITY-001:', error.message);
    process.exit(1);
  }

  console.log('✅ SD-QUALITY-001 updated successfully!\n');
  console.log('📊 Summary of Corrected Scope:');
  console.log('  ✓ Title: Unit Test Coverage Gap - Business Logic Testing');
  console.log('  ✓ Focus: Unit tests for business logic (not full test suite)');
  console.log('  ✓ Current: 4 unit test files, 63 total test files');
  console.log('  ✓ Target: 40-60 unit test files, 50% coverage');
  console.log('  ✓ Maintain: Existing E2E, integration, a11y, security tests\n');

  console.log('🎯 Corrected Understanding:');
  console.log('  ✓ EHG has extensive test coverage (NOT zero!)');
  console.log('  ✓ Gap is specifically in unit test coverage');
  console.log('  ✓ Multi-application architecture now documented');
  console.log('  ✓ Tests located in correct application directories\n');

  console.log('📁 Test Locations:');
  console.log('  ✓ EHG tests: /mnt/c/_EHG/ehg/tests/');
  console.log('  ✓ EHG_Engineer tests: /mnt/c/_EHG/EHG_Engineer/tests/\n');

  console.log('🚀 Next Steps:');
  console.log('  1. Review corrected SD-QUALITY-001 in dashboard');
  console.log('  2. Update LEAD→PLAN handoff with revised scope');
  console.log('  3. Create PRD focusing on unit test coverage gap');
  console.log('  4. Begin PLAN phase with accurate understanding\n');

  return data;
}

// Run the update
updateSDQUALITY001()
  .then(() => {
    console.log('✨ SD-QUALITY-001 scope correction complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
