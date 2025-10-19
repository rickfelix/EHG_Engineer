#!/usr/bin/env node

/**
 * Create Strategic Directive: SD-TEST-MOCK-001
 * Standardize Venture Workflow Mock Mode Testing
 *
 * Issue: Inconsistent mock strategies across venture workflow tests
 * Solution: Standardize mock handlers and feature flag checks
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createStrategicDirective() {
  console.log('📋 Creating Strategic Directive: SD-TEST-MOCK-001');
  console.log('================================================================');
  console.log('Title: Standardize Venture Workflow Mock Mode Testing');
  console.log('Target: EHG Application (customer-facing app)');
  console.log('================================================================\n');

  const strategicDirective = {
    id: 'SD-TEST-MOCK-001',
    sd_key: 'TEST-MOCK-001',
    title: 'Standardize Venture Workflow Mock Mode Testing',
    version: '1.0',
    status: 'draft',
    category: 'testing',
    priority: 'high',

    description: 'Standardize mock mode testing patterns across venture workflow E2E tests to eliminate inconsistent test failures. Current tests use mixed strategies: some have explicit page.route() handlers, others rely on real data or demo mode, causing unpredictable failures in the "mock" Playwright project.',

    strategic_intent: 'Establish consistent, reliable E2E testing patterns that work across all Playwright projects (mock and flags-on) without requiring real database data, enabling CI/CD pipeline stability and faster test execution.',

    rationale: 'Investigation revealed three test categories: (1) Tests WITH mock handlers (ventures.spec.ts, triage.spec.ts, filters.spec.ts) - working correctly, (2) Tests WITHOUT mock handlers (ventures-authenticated.spec.ts, ventures-crud.spec.ts, new-venture.spec.ts) - failing in mock project, (3) Feature-flagged tests (calibration.spec.ts, decisions.spec.ts) - properly configured. The root cause is inconsistent mock strategy creating unpredictable test behavior when database is empty or demo mode is disabled.',

    scope: 'EHG application E2E test suite - specifically venture workflow tests in tests/e2e/ and tests/dev/ directories. Focus on Playwright test files that interact with venture API endpoints.',

    strategic_objectives: [
      'Add explicit mock handlers to all venture workflow tests missing them',
      'Standardize feature flag checks for tests requiring specific features',
      'Create comprehensive test pattern documentation with three patterns (basic, feature-specific, authenticated)',
      'Achieve 100% test pass rate in both "mock" and "flags-on" Playwright projects',
      'Document Playwright project annotations for test categorization'
    ],

    success_criteria: [
      'All venture workflow tests pass in "mock" project without real database data',
      'Feature-flagged tests skip gracefully when flags are disabled',
      'Zero test failures due to missing mock handlers or undefined API responses',
      'Test pattern documentation complete at docs/testing/mock-handler-patterns.md',
      'All tests annotated with appropriate Playwright project tags',
      'CI/CD pipeline shows green for both mock and flags-on projects'
    ],

    key_changes: [
      'Add page.route() mock handlers to ventures-authenticated.spec.ts (venture API endpoints)',
      'Add page.route() mock handlers to ventures-crud.spec.ts (CRUD operation endpoints)',
      'Add page.route() mock handlers to new-venture.spec.ts (creation endpoint)',
      'Add feature flag environment checks to tests requiring specific features',
      'Create docs/testing/mock-handler-patterns.md with standardized patterns',
      'Update test README with Playwright project requirements matrix',
      'Add @project annotations to tests specifying required project (mock vs flags-on)'
    ],

    key_principles: [
      'Pattern A: Basic tests use explicit mock handlers for all API calls',
      'Pattern B: Feature-specific tests use feature flag check + mock handlers',
      'Pattern C: Authenticated tests document requirement for real data and skip in mock mode',
      'All mock handlers follow ventures.spec.ts pattern as reference implementation',
      'Mock data should be minimal but sufficient to test UI interactions',
      'Feature flag checks use test.skip() when environment variable is not "true"'
    ],

    metadata: {
      investigation_complete: true,
      affected_files: [
        'tests/e2e/ventures-authenticated.spec.ts',
        'tests/dev/ventures-crud.spec.ts',
        'tests/e2e/new-venture.spec.ts',
        'tests/e2e/ventures.spec.ts (reference implementation)',
        'playwright.config.ts (project configuration)'
      ],
      test_projects: {
        mock: 'EHG_MOCK_MODE=true, feature flags OFF',
        'flags-on': 'EHG_MOCK_MODE=true, feature flags ON'
      },
      reference_patterns: {
        'with_mocks': 'ventures.spec.ts, triage.spec.ts, filters.spec.ts',
        'with_feature_flags': 'calibration.spec.ts, decisions.spec.ts',
        'without_mocks': 'ventures-authenticated.spec.ts, ventures-crud.spec.ts'
      },
      estimated_effort_hours: 8,
      implementation_path: '/mnt/c/_EHG/ehg',
      created_by: 'INVESTIGATION_ANALYSIS',
      investigation_date: new Date().toISOString()
    },

    created_by: 'TEST_STANDARDIZATION_INITIATIVE',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    // Check if SD already exists
    const { data: existing, error: checkError } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', strategicDirective.id)
      .single();

    if (existing) {
      // Update existing SD
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update(strategicDirective)
        .eq('id', strategicDirective.id)
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Strategic Directive UPDATED successfully!');
      console.log('   ID:', data.id);
      console.log('   Title:', data.title);
      console.log('   Priority:', data.priority);
      console.log('   Status:', data.status);
    } else {
      // Insert new SD
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .insert(strategicDirective)
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Strategic Directive CREATED successfully!');
      console.log('   ID:', data.id);
      console.log('   Title:', data.title);
      console.log('   Priority:', data.priority);
      console.log('   Status:', data.status);
      console.log('   Category:', data.category);
    }

    console.log('\n📊 Summary:');
    console.log('   - Affected Tests: 3 files need mock handlers');
    console.log('   - Reference Implementation: ventures.spec.ts');
    console.log('   - Estimated Effort: 6-8 hours');
    console.log('   - Target Application: /mnt/c/_EHG/ehg (EHG app)');

    console.log('\n📋 Next Steps:');
    console.log('   1. LEAD: Review and approve SD-TEST-MOCK-001');
    console.log('   2. PLAN: Create PRD with detailed implementation plan');
    console.log('   3. EXEC: Implement mock handlers and documentation');
    console.log('   4. Verify: Run full test suite in both projects');

    console.log('\n🌐 View in Dashboard:');
    console.log('   http://localhost:3000/strategic-directives');
    console.log('   http://localhost:3000/strategic-directives/SD-TEST-MOCK-001');
    console.log('================================================================');

  } catch (error) {
    console.error('❌ Error creating Strategic Directive:', error.message);

    if (error.code === 'PGRST116') {
      console.log('⚠️  Table strategic_directives_v2 does not exist');
      console.log('   Verify database connection and table schema');
    } else if (error.code === '23505') {
      console.log('⚠️  Strategic Directive with this ID already exists');
      console.log('   Use different SD-ID or update existing record');
    } else {
      console.error('Error details:', error);
    }

    process.exit(1);
  }
}

// Execute
createStrategicDirective();
