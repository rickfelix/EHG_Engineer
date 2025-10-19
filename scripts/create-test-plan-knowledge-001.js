#!/usr/bin/env node

/**
 * Create Test Plan for SD-KNOWLEDGE-001
 * Inserts into leo_test_plans table (database-first approach)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createTestPlan() {
  console.log('📋 Creating Test Plan for SD-KNOWLEDGE-001');
  console.log('================================================================\n');

  const testPlan = {
    prd_id: 'PRD-KNOWLEDGE-001',
    coverage_target: 100.00,

    matrices: {
      unit: {
        required: true,
        target_coverage: 100,
        files: [
          'tests/unit/automated-knowledge-retrieval.test.js',
          'tests/unit/circuit-breaker.test.js',
          'tests/unit/prd-enrichment.test.js'
        ],
        test_count: 20,
        execution_time_target_seconds: 5
      },
      integration: {
        required: false,
        target_coverage: 0,
        files: [],
        test_count: 0,
        note: 'Integration tests recommended but not mandatory for this infrastructure component'
      },
      e2e: {
        required: true,
        target_coverage: 100,
        files: [
          'tests/e2e/knowledge-retrieval-flow.spec.ts',
          'tests/e2e/context7-failure-scenarios.spec.ts'
        ],
        test_count: 9,
        execution_time_target_seconds: 30
      },
      a11y: {
        required: false,
        target_coverage: 0,
        note: 'No UI components - accessibility testing not applicable'
      },
      perf: {
        required: true,
        benchmarks: [
          { name: 'Local retrospective query', target: '<2 seconds' },
          { name: 'Context7 query', target: '<10 seconds' },
          { name: 'Full PRD enrichment', target: '<30 seconds' }
        ]
      },
      security: {
        required: true,
        checks: [
          'Token budget enforcement (5k/query, 15k/PRD hard caps)',
          'Circuit breaker protects against external API overload',
          'No sensitive data in cache (tech_stack_references)',
          'Audit logging for all operations (prd_research_audit_log)'
        ]
      }
    },

    test_scenarios: [
      {
        id: 'US-KR-001',
        user_story: 'Retrospective Semantic Search',
        scenario: 'Query retrospectives for "OAuth" tech stack',
        expected: 'Returns top 5 matches in <2s, consumes ≤500 tokens',
        test_type: 'e2e',
        priority: 'MUST',
        status: 'pending'
      },
      {
        id: 'US-KR-002',
        user_story: 'Context7 Live Documentation',
        scenario: 'Local results <3, trigger Context7 fallback',
        expected: 'Context7 query executes, results merged, 10s timeout enforced',
        test_type: 'e2e',
        priority: 'MUST',
        status: 'pending'
      },
      {
        id: 'US-KR-003',
        user_story: 'PRD Auto-Enrichment',
        scenario: 'Enrich PRD with research results (confidence >0.85)',
        expected: 'implementation_context populated automatically, audit logged',
        test_type: 'e2e',
        priority: 'MUST',
        status: 'pending'
      },
      {
        id: 'US-KR-004',
        user_story: 'Circuit Breaker Resilience',
        scenario: 'Context7 fails 3 times consecutively',
        expected: 'Circuit breaker opens, subsequent queries skip Context7',
        test_type: 'e2e',
        priority: 'MUST',
        status: 'pending'
      },
      {
        id: 'US-KR-005',
        user_story: 'Research Telemetry',
        scenario: 'All research operations logged',
        expected: 'Audit log contains query type, tokens, execution time, confidence, circuit state',
        test_type: 'e2e',
        priority: 'SHOULD',
        status: 'pending'
      },
      {
        id: 'SCENARIO-006',
        user_story: 'Circuit Breaker Auto-Recovery',
        scenario: 'Circuit breaker open for 1 hour',
        expected: 'Auto-recovers to half-open state, tests service',
        test_type: 'e2e',
        priority: 'MUST',
        status: 'pending'
      },
      {
        id: 'SCENARIO-007',
        user_story: 'Token Budget Enforcement',
        scenario: 'Token usage exceeds 15k limit',
        expected: 'Query truncated, hard cap enforced, warning logged',
        test_type: 'e2e',
        priority: 'MUST',
        status: 'pending'
      },
      {
        id: 'SCENARIO-008',
        user_story: 'Cache TTL',
        scenario: 'Cache hit within 24 hours',
        expected: 'Cached results returned, no new query executed',
        test_type: 'e2e',
        priority: 'SHOULD',
        status: 'pending'
      },
      {
        id: 'SCENARIO-009',
        user_story: 'Graceful Degradation',
        scenario: 'System operates with Context7 down (circuit open)',
        expected: 'Continues with local-only mode at 60-70% effectiveness',
        test_type: 'e2e',
        priority: 'MUST',
        status: 'pending'
      }
    ],

    regression_suite: [
      {
        test: 'Verify retrospectives table query performance',
        baseline: '1.5 seconds avg',
        threshold: '<2 seconds',
        frequency: 'every PR'
      },
      {
        test: 'Verify token counting accuracy',
        baseline: '±5% variance',
        threshold: '±10% variance',
        frequency: 'every PR'
      },
      {
        test: 'Verify circuit breaker state persistence',
        baseline: '100% accuracy',
        threshold: '100% accuracy',
        frequency: 'every PR'
      }
    ],

    smoke_tests: [
      {
        test: 'Can query retrospectives table',
        expected: 'Returns results without error',
        execution_time: '<1 second'
      },
      {
        test: 'tech_stack_references table exists and writable',
        expected: 'Can INSERT and SELECT',
        execution_time: '<1 second'
      },
      {
        test: 'prd_research_audit_log table exists and writable',
        expected: 'Can INSERT and SELECT',
        execution_time: '<1 second'
      },
      {
        test: 'system_health table has context7 entry',
        expected: 'Entry exists with state "closed"',
        execution_time: '<1 second'
      },
      {
        test: 'user_stories.implementation_context column exists',
        expected: 'Column queryable, accepts JSONB',
        execution_time: '<1 second'
      }
    ]
  };

  // Check if test plan already exists
  const { data: existing, error: checkError } = await supabase
    .from('leo_test_plans')
    .select('id')
    .eq('prd_id', 'PRD-KNOWLEDGE-001')
    .single();

  if (existing) {
    console.log('⚠️  Test plan already exists, updating...\n');
    const { data, error } = await supabase
      .from('leo_test_plans')
      .update(testPlan)
      .eq('prd_id', 'PRD-KNOWLEDGE-001')
      .select('id, prd_id, coverage_target');

    if (error) {
      console.error('❌ Failed to update test plan:', error.message);
      process.exit(1);
    }

    console.log('✅ Test plan updated successfully');
    console.log(`   ID: ${data[0].id}`);
    console.log(`   PRD: ${data[0].prd_id}`);
    console.log(`   Coverage Target: ${data[0].coverage_target}%`);
  } else {
    const { data, error } = await supabase
      .from('leo_test_plans')
      .insert(testPlan)
      .select('id, prd_id, coverage_target');

    if (error) {
      console.error('❌ Failed to create test plan:', error.message);
      console.error('   Error details:', error);
      process.exit(1);
    }

    console.log('✅ Test plan created successfully');
    console.log(`   ID: ${data[0].id}`);
    console.log(`   PRD: ${data[0].prd_id}`);
    console.log(`   Coverage Target: ${data[0].coverage_target}%`);
  }

  console.log('\n📊 Test Plan Summary:');
  console.log('   - Unit Tests: 3 files, ~20 test cases');
  console.log('   - E2E Tests: 2 files, 9 scenarios');
  console.log('   - User Story Coverage: 100% (5 user stories)');
  console.log('   - Regression Tests:', testPlan.regression_suite.length);
  console.log('   - Smoke Tests:', testPlan.smoke_tests.length);
  console.log('');
  console.log('📈 Test Matrices:');
  console.log('   - Unit: Required, 100% coverage target');
  console.log('   - E2E: Required, 100% coverage target');
  console.log('   - Performance: 3 benchmarks defined');
  console.log('   - Security: 4 checks required');
  console.log('');
  console.log('🎯 Test plan ready for PLAN→EXEC handoff');
}

createTestPlan();
