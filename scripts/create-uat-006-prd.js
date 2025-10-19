#!/usr/bin/env node

/**
 * Create PRD for SD-UAT-2025-006: Test Suite Architecture Optimization
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createTestArchitecturePRD() {
  console.log('📋 Creating PRD for SD-UAT-2025-006: Test Suite Architecture Optimization');
  console.log('================================================================\n');

  
  // FIX: Get SD uuid_id to populate sd_uuid field (prevents handoff validation failures)
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id')
    .eq('id', sdId)
    .single();

  if (sdError || !sdData) {
    console.log(`❌ Strategic Directive ${sdId} not found in database`);
    console.log('   Create SD first before creating PRD');
    process.exit(1);
  }

  const sdUuid = sdData.uuid_id;
  console.log(`   SD uuid_id: ${sdUuid}`);

const prdContent = {
    id: 'PRD-SD-UAT-2025-006',
    title: 'Test Suite Architecture Optimization',
    // FIX: user_stories moved to separate table
    // user_stories: [
      {
        id: 'US-TEST-001',
        title: 'Reorganize Test Structure',
        description: 'As a QA engineer, I need a well-organized test structure to find and maintain tests easily',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Tests organized by feature/domain',
          'Clear naming conventions enforced',
          'Shared utilities centralized',
          'Test helpers properly abstracted',
          'Page objects pattern implemented'
        ],
        test_requirements: [
          'Directory structure validation',
          'Naming convention linting',
          'Import path verification',
          'Helper function tests',
          'Page object coverage'
        ]
      },
      {
        id: 'US-TEST-002',
        title: 'Implement Parallel Execution',
        description: 'As a developer, I need tests to run in parallel to reduce execution time',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Tests run in parallel workers',
          'No test interdependencies',
          'Isolated test environments',
          'Proper resource cleanup',
          'Execution time <10 minutes'
        ],
        test_requirements: [
          'Parallel execution tests',
          'Isolation verification',
          'Resource cleanup checks',
          'Performance benchmarks',
          'Worker configuration tests'
        ]
      },
      {
        id: 'US-TEST-003',
        title: 'Create Test Profiles',
        description: 'As a team, we need different test profiles for various scenarios',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Smoke test profile (<2 min)',
          'Regression test profile (full)',
          'Critical path profile',
          'Performance test profile',
          'Security test profile'
        ],
        test_requirements: [
          'Profile configuration tests',
          'Profile execution tests',
          'Coverage validation',
          'Time constraint tests',
          'Profile switching tests'
        ]
      },
      {
        id: 'US-TEST-004',
        title: 'Implement Test Tagging System',
        description: 'As a QA engineer, I need to run specific test subsets based on tags',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Tags for priority (P0, P1, P2)',
          'Tags for type (unit, integration, e2e)',
          'Tags for features/components',
          'Tag-based execution working',
          'Tag reporting implemented'
        ],
        test_requirements: [
          'Tag parsing tests',
          'Tag filtering tests',
          'Tag-based execution tests',
          'Tag reporting tests',
          'Tag validation tests'
        ]
      },
      {
        id: 'US-TEST-005',
        title: 'Enhance Test Reporting',
        description: 'As a stakeholder, I need comprehensive test reports to understand quality status',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'HTML reports with screenshots',
          'JSON reports for CI integration',
          'Trend analysis over time',
          'Failure categorization',
          'Performance metrics included'
        ],
        test_requirements: [
          'Report generation tests',
          'Screenshot attachment tests',
          'Trend calculation tests',
          'Categorization tests',
          'Metric collection tests'
        ]
      }
    ],
    technical_requirements: {
      architecture: [
        'Implement page object model pattern',
        'Create shared test utilities library',
        'Establish test data management',
        'Configure test environment isolation',
        'Set up test fixture management'
      ],
      performance: [
        'Configure optimal worker count',
        'Implement test sharding',
        'Set up parallel execution',
        'Optimize test startup time',
        'Reduce test flakiness'
      ],
      reporting: [
        'Integrate Allure reporting',
        'Set up test metrics dashboard',
        'Configure CI/CD reporting',
        'Implement failure analysis',
        'Create executive dashboards'
      ],
      maintenance: [
        'Establish test code standards',
        'Implement test review process',
        'Create test documentation',
        'Set up test monitoring',
        'Define test retirement criteria'
      ]
    },
    // FIX: success_metrics moved to metadata
    // success_metrics: {
      execution_time: 'Full suite <10 minutes',
      pass_rate: 'Consistent >85% pass rate',
      flakiness: '<2% flaky tests',
      coverage: '>80% code coverage maintained',
      maintainability: 'Test maintenance <20% effort'
    }
  };

  const prd = {
    id: 'PRD-SD-UAT-2025-006',
    directive_id: 'SD-UAT-2025-006',
    title: 'Test Suite Architecture Optimization',
    version: '1.0',
    status: 'draft',
    content: prdContent,
    metadata: {
      test_improvements_targeted: 50,
      issues_resolved: [
        'Slow test execution (>30 minutes)',
        'Test interdependencies causing failures',
        'Difficulty finding specific tests',
        'Lack of test profiles for different scenarios',
        'Inadequate test reporting'
      ],
      expected_time_savings: '70% reduction in execution time',
      priority: 'CRITICAL',
      business_impact: 'Faster feedback cycles and improved development velocity',
      created_by: 'LEO_PLAN_AGENT'
    },
    created_by: 'LEO_PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  sd_uuid: sdUuid, // FIX: Added for handoff validation
  };

  try {
    // Check if PRD already exists
    const { data: existing } = await supabase
      .from('product_requirements_v2')
      .select('id')
      .eq('directive_id', 'SD-UAT-2025-006')
      .single();

    if (existing) {
      const { data, error } = await supabase
        .from('product_requirements_v2')
        .update(prd)
        .eq('directive_id', 'SD-UAT-2025-006')
        .select()
        .single();

      if (error) throw error;
      console.log('✅ PRD updated successfully!');
    } else {
      const { data, error } = await supabase
        .from('product_requirements_v2')
        .insert(prd)
        .select()
        .single();

      if (error) throw error;
      console.log('✅ PRD created successfully!');
    }

    console.log('   ID: PRD-SD-UAT-2025-006');
    console.log('   Title: Test Suite Architecture Optimization');
    console.log('   User Stories: 5 CRITICAL');
    console.log('   Expected Time Savings: 70%');
    console.log('\n🎯 Ready for orchestrator execution');
    console.log('================================================================');

  } catch (error) {
    console.error('❌ Error creating PRD:', error.message);
    process.exit(1);
  }
}

// Execute
createTestArchitecturePRD();