#!/usr/bin/env node

/**
 * Create SD-TEST-001: Strategic Directive Testing Work-Down Plan
 * Focus: Only test SDs that haven't been validated yet
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function createStrategicDirective() {
  console.log('Creating SD-TEST-001: Strategic Directive Testing Work-Down Plan...\n');

  const sdData = {
    id: 'SD-TEST-001',
    sd_key: 'SD-TEST-001',
    title: 'Strategic Directive Testing Work-Down Plan',
    description: 'Establish systematic testing framework for validating Strategic Directives stored in database. Testing sub-agent analyzes SD metadata, PRDs, backlog items, and existing implementations to determine true completion status. Creates work-down plan tracking which SDs have been validated vs pending. CRITICAL: Only test SDs that haven\'t been tested yet - no duplicate testing.',

    status: 'draft',
    priority: 'high',
    category: 'Quality Assurance',

    strategic_intent: 'Ensure all Strategic Directives are properly tested before marking as complete',

    rationale: 'Prevent claiming features complete without verification. Many SDs marked "complete" may lack actual test evidence. Need systematic validation to ensure quality gates are met.',

    scope: {
      included: [
        'Database queries to identify untested SDs',
        'sd_testing_status table to track testing progress',
        'Testing sub-agent automation for test generation from SD/PRD metadata',
        'User Stories sub-agent integration for granular test scenarios',
        'Automated smoke test generation (3-5 tests minimum per SD)',
        'Dashboard widget showing tested vs untested SDs',
        'Work-down plan prioritization by SD priority and sequence',
        'Integration with existing test infrastructure discovery',
        'Test evidence capture (screenshots, pass rates, test counts)',
        'Prevent duplicate testing - skip SDs already validated'
      ],
      excluded: [
        'Manual test execution (focus on automation)',
        'Performance testing (covered by Performance sub-agent)',
        'Security testing (covered by Security sub-agent)',
        'Re-testing SDs that already have test evidence',
        'Testing sub-agent internal validation (not SD testing)'
      ],
      database_changes: {
        new_tables: ['sd_testing_status'],
        modified_tables: []
      }
    },

    strategic_objectives: [
      'Identify all SDs without test evidence (untested SDs)',
      'Create automated tests for untested SDs using Testing sub-agent',
      'Track testing progress with clear work-down plan',
      'Achieve ≥70% test pass rate for all validated SDs',
      'Prevent duplicate testing - skip already-validated SDs',
      'Dashboard visualization of testing status (tested/untested)'
    ],

    success_criteria: [
      'sd_testing_status table created and operational',
      'Query successfully identifies untested SDs vs tested SDs',
      'Testing sub-agent can generate tests from SD/PRD metadata',
      'User Stories sub-agent provides granular test scenarios when needed',
      'Dashboard widget shows tested vs untested SDs with pass rates',
      'Work-down plan prioritizes untested SDs by priority/sequence',
      'Test evidence stored in database (no markdown files)',
      'Zero duplicate testing - validated SDs are skipped'
    ],

    key_principles: [
      'Database-first: All tracking in sd_testing_status table',
      'Automation-first: Testing sub-agent generates tests automatically',
      'Evidence-based: Store test results, screenshots, pass rates',
      'Efficiency: Only test SDs that need testing (skip validated ones)',
      'Prioritization: High-priority untested SDs tested first'
    ],

    implementation_guidelines: [
      'Query strategic_directives_v2 for all active/completed SDs',
      'Left join sd_testing_status to find SDs without test records',
      'For each untested SD: query PRD, backlog items, existing code',
      'Testing sub-agent extracts test requirements from metadata',
      'User Stories sub-agent provides detailed test scenarios if needed',
      'Execute automated smoke tests (3-5 tests minimum)',
      'Store results in sd_testing_status with pass rate and evidence',
      'Dashboard queries sd_testing_status for visualization',
      'Work-down plan shows next SD to test based on priority'
    ],

    dependencies: [
      'strategic_directives_v2 table (existing)',
      'product_requirements_v2 table (existing)',
      'sd_backlog_map table (existing)',
      'Testing sub-agent (QA Engineering Director)',
      'User Stories sub-agent (Product Requirements Expert)',
      'Test infrastructure discovery script',
      'sd_testing_status table (new - to be created)'
    ],

    risks: [
      {
        description: 'SDs without PRDs may have insufficient test requirements',
        mitigation: 'Use SD description, objectives, and backlog items as fallback',
        severity: 'medium'
      },
      {
        description: 'Testing sub-agent may generate too many tests',
        mitigation: 'Start with smoke tests (3-5 tests), expand later if needed',
        severity: 'low'
      },
      {
        description: 'Duplicate testing if tracking fails',
        mitigation: 'Unique constraint on sd_testing_status.sd_id',
        severity: 'low'
      }
    ],

    success_metrics: [
      'Number of untested SDs identified',
      'Number of SDs validated (tested = true)',
      'Average test pass rate across validated SDs',
      'Time to validate one SD (target: <30 min)',
      'Zero duplicate tests executed',
      'Work-down plan completion percentage'
    ],

    metadata: {
      created_by: 'LEO Protocol System',
      sequence_rank: 10, // Low number = high priority in queue
      sub_agents_required: ['QA Engineering Director', 'Product Requirements Expert'],
      acceptance_testing_required: true,
      database_changes: true,
      estimated_effort: '8-12 hours',
      test_automation_level: 'Full',
      prevents_duplicate_testing: true,
      technical_requirements: [
        'Database schema: sd_testing_status table',
        'Query logic to identify untested SDs',
        'Testing sub-agent integration',
        'User Stories sub-agent integration',
        'Dashboard widget for work-down plan',
        'Test evidence storage (screenshots, results)'
      ]
    },

    target_application: 'EHG',
    current_phase: 'LEAD',
    phase_progress: 0,
    progress: 0,
    is_active: true,
    created_by: 'system',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    // Check if SD already exists
    const { data: existing, error: checkError } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', 'SD-TEST-001')
      .single();

    if (existing) {
      console.log('⚠️  SD-TEST-001 already exists. Updating...');

      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update(sdData)
        .eq('id', 'SD-TEST-001')
        .select()
        .single();

      if (error) throw error;
      console.log('✅ SD-TEST-001 updated successfully!');
      return data;
    }

    // Create new SD
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(sdData)
      .select()
      .single();

    if (error) throw error;

    console.log('✅ SD-TEST-001 created successfully!');
    console.log('\n📊 Strategic Directive Details:');
    console.log('================================');
    console.log(`ID: ${data.id}`);
    console.log(`Title: ${data.title}`);
    console.log(`Priority: ${data.priority}`);
    console.log(`Status: ${data.status}`);
    console.log(`Sequence Rank: ${data.metadata.sequence_rank}`);
    console.log(`Category: ${data.category}`);
    console.log('\n🎯 Key Features:');
    console.log('  ✅ Only tests SDs without test evidence (no duplicate testing)');
    console.log('  ✅ Testing sub-agent + User Stories sub-agent integration');
    console.log('  ✅ Database-first tracking in sd_testing_status table');
    console.log('  ✅ Dashboard work-down plan visualization');
    console.log('\n🔧 Database Changes Required:');
    console.log('  - New table: sd_testing_status');
    console.log('  - Tracks: sd_id, tested, test_pass_rate, test_count, last_tested_at');
    console.log('\n📈 Success Criteria:');
    data.success_criteria.forEach((criterion, i) => {
      console.log(`  ${i + 1}. ${criterion}`);
    });

    return data;

  } catch (error) {
    console.error('❌ Error creating SD-TEST-001:', error.message);
    throw error;
  }
}

// Run if executed directly
createStrategicDirective()
  .then(() => {
    console.log('\n🚀 Next steps:');
    console.log('1. Create database schema: node scripts/create-sd-testing-status-table.js');
    console.log('2. Query untested SDs: node scripts/query-untested-sds.js');
    console.log('3. Generate PRD: node scripts/create-prd-sd-test-001.js');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

export { createStrategicDirective };
