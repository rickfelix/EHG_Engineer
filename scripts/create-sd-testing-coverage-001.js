#!/usr/bin/env node

/**
 * Create SD-TESTING-COVERAGE-001: Critical Test Coverage Investment
 * Generated from Testing Agent background scan
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createSD() {
  console.log('📋 Creating SD-TESTING-COVERAGE-001...\n');

  const sd = {
    id: 'SD-TESTING-COVERAGE-001',
    sd_key: 'SD-TESTING-COVERAGE-001',
    title: 'Critical Test Coverage Investment - Non-Stage-4 Features',
    version: '1.0',
    status: 'draft',
    category: 'quality',
    priority: 'high',
    target_application: 'EHG_Engineer',
    sd_type: 'feature',
    sequence_rank: 1,
    description: 'Comprehensive test coverage improvement for EHG_Engineer non-Stage-4 features to prevent production regressions, unblock EXEC validation, and establish confidence in CI/CD deployments.',
    strategic_intent: 'Establish robust test coverage foundation for critical LEO Protocol workflows (SD/PRD CRUD, phase handoffs, database validation) to prevent data corruption and enable confident feature delivery.',
    rationale: 'Testing Agent scan revealed critical gaps: (1) LEO gates broken (blocks EXEC validation), (2) Zero E2E tests for SD/PRD operations (data corruption risk), (3) Database validation untested (silent corruption), (4) Phase handoffs untested (workflow failures). Current 20% coverage creates unacceptable production risk. Investment: 26-35 hours for +125% improvement (20% → 45%).',
    scope: 'Week 1 (26 hours): Fix LEO gates + integration tests (6h), SD CRUD E2E tests (6h), PRD management E2E tests (8h), Database validation integration tests (5h). Week 2 (8-10 hours): Phase handoff E2E tests. EXCLUDES: Stage 4 venture workflow (separate session).',
    key_changes: [
      'Fix broken LEO gates (2A-2D, Gate 3) - all exit code 1',
      'Add E2E tests for Strategic Directive CRUD operations',
      'Add E2E tests for PRD management workflows',
      'Add integration tests for database validation scripts',
      'Add E2E tests for phase handoff system (LEAD→PLAN→EXEC)',
      'Integrate tests into CI/CD pipeline'
    ],
    strategic_objectives: [
      'Unblock EXEC validation by fixing broken LEO gates',
      'Prevent SD/PRD data corruption through comprehensive E2E testing',
      'Catch database integrity issues early via validation script tests',
      'Ensure phase transition reliability through handoff tests',
      'Reduce regression bugs to near-zero through automated testing',
      'Increase test coverage from 20% to 45% in Week 1'
    ],
    success_criteria: [
      'All 5 LEO gates stop exiting with code 1',
      'LEO gates have integration tests (100% coverage)',
      'SD CRUD operations have E2E tests (create, edit, status, delete)',
      'PRD management has E2E tests (create, validate, stories, approve)',
      'Database validation has integration tests (detect + fix scripts)',
      'Phase handoffs have E2E tests (LEAD→PLAN→EXEC transitions)',
      'CI/CD pipeline runs all tests on PRs',
      'Zero test failures on main branch',
      'Test coverage increases from 20% to 45%'
    ],
    key_principles: [
      'Delegate to testing-agent for all test file creation (MANDATORY)',
      'Quality-first: Comprehensive tests over quick coverage',
      'Evidence-based: All tests must pass before claiming complete',
      'Database-first: Store test results in sub_agent_execution_results',
      'Learning-first: Consult retrospectives for testing patterns'
    ],
    implementation_guidelines: [
      'Week 1 Sprint Plan: Day 1-2 (LEO gates), Day 3 (SD CRUD), Day 4 (PRD mgmt), Day 5 (DB validation)',
      'Use QA Engineering Director for test generation: node scripts/qa-engineering-director-enhanced.js',
      'All test creation via testing-agent (NO manual test file writing)',
      'Pre-test build validation: npm run build:client before E2E tests',
      'Dual testing requirement: Both unit tests AND E2E tests must pass',
      'Test database instance: Setup separate test DB to avoid production pollution'
    ],
    dependencies: [
      'Testing Agent operational',
      'Playwright configured and working',
      'Jest/Vitest configured',
      'Supabase test database instance (or RLS test bypass)',
      'GitHub Actions CI/CD pipeline ready'
    ],
    risks: [
      {
        risk: 'LEO gate fixes reveal deeper architectural issues',
        mitigation: 'Timebox gate debugging to 6 hours, escalate if blocked',
        likelihood: 'medium',
        impact: 'high'
      },
      {
        risk: 'Test database setup delays Week 1 execution',
        mitigation: 'Use RLS bypass for tests if test DB not ready by Day 2',
        likelihood: 'medium',
        impact: 'medium'
      },
      {
        risk: 'E2E tests expose production bugs requiring immediate fixes',
        mitigation: 'Create fix SDs for critical bugs, defer low-priority to Week 2',
        likelihood: 'high',
        impact: 'high'
      }
    ],
    success_metrics: [
      'Test coverage: 20% → 45% (Week 1), → 60% (Week 3)',
      'LEO gates functional: 0/5 → 5/5',
      'Critical scripts tested: 0% → 40% (Week 1), → 80% (Week 3)',
      'Regression bugs: Unknown → 0 (measured via CI/CD)',
      'CI/CD test pass rate: N/A → 100% on main branch'
    ],
    stakeholders: [
      {
        name: 'LEAD Agent',
        role: 'Approver',
        interest: 'Quality gates functional, production stability'
      },
      {
        name: 'PLAN Agent',
        role: 'Test strategy',
        interest: 'Comprehensive test coverage, PRD validation'
      },
      {
        name: 'EXEC Agent',
        role: 'Implementation',
        interest: 'Clear test requirements, working test infrastructure'
      },
      {
        name: 'Testing Agent',
        role: 'Test creation',
        interest: 'Professional test generation, user story mapping'
      }
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'Claude (LEO Protocol v4.3.0)',
    updated_by: 'Claude (LEO Protocol v4.3.0)',
    metadata: {
      source: 'Testing Agent background scan',
      documentation: '/docs/testing/',
      estimated_effort_hours: '26-35',
      week_1_focus_hours: 26,
      roi_score: '5/5',
      baseline_coverage: '20%',
      target_coverage_week1: '45%',
      target_coverage_week3: '60%',
      critical_issues_found: 5,
      test_files_to_create: 5,
      sub_agent_delegation: 'testing-agent (MANDATORY)'
    }
  };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert([sd])
    .select();

  if (error) {
    console.error('❌ Error creating SD:', error);
    process.exit(1);
  }

  console.log('✅ SD created successfully!');
  console.log('');
  console.log('📋 Strategic Directive Details:');
  console.log('   ID:', data[0].id);
  console.log('   Title:', data[0].title);
  console.log('   Status:', data[0].status);
  console.log('   Priority:', data[0].priority);
  console.log('   Category:', data[0].category);
  console.log('');
  console.log('📊 Coverage Metrics:');
  console.log('   Baseline:', '20%');
  console.log('   Week 1 Target:', '45% (+125% improvement)');
  console.log('   Week 3 Target:', '60%');
  console.log('');
  console.log('🎯 Next Step: LEAD Strategic Validation Gate (6 questions)');
  console.log('');
}

createSD();
