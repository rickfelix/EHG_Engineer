#!/usr/bin/env node

/**
 * Add Epic Execution Sequences to database
 * LEO Protocol v3.1.5 compliant
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function addEESToDatabase() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const eesItems = [
    {
      id: 'EES-2025-01-15-A-01',
      directive_id: 'SD-2025-01-15-A',
      title: 'Foundation Setup',
      description: 'Initialize EHG_Engineer project with minimal Node.js environment and Supabase connection',
      sequence_number: 1,
      status: 'completed',
      phase: 'Phase 1',
      phase_description: 'Project initialization and environment setup',
      progress: 100,
      deliverables: [
        'Project directory structure',
        'Package.json configuration',
        'Environment variables setup',
        'Database connection verification'
      ],
      assigned_to: ['EXEC'],
      actual_start: '2025-01-15T00:00:00Z',
      actual_end: '2025-01-15T01:00:00Z',
      created_by: 'PLAN'
    },
    {
      id: 'EES-2025-01-15-A-02',
      directive_id: 'SD-2025-01-15-A',
      title: 'Database Schema Implementation',
      description: 'Create core LEO Protocol database tables with relationships and indexes',
      sequence_number: 2,
      status: 'completed',
      phase: 'Phase 2',
      phase_description: 'Database schema and core scripts',
      progress: 100,
      deliverables: [
        'strategic_directives_v2 table',
        'execution_sequences_v2 table',
        'hap_blocks_v2 table',
        'Performance indexes',
        'Update triggers'
      ],
      assigned_to: ['EXEC'],
      dependencies: ['EES-2025-01-15-A-01'],
      actual_start: '2025-01-15T01:00:00Z',
      actual_end: '2025-01-15T02:00:00Z',
      created_by: 'PLAN'
    },
    {
      id: 'EES-2025-01-15-A-03',
      directive_id: 'SD-2025-01-15-A',
      title: 'Template System Creation',
      description: 'Develop comprehensive templates for all LEO Protocol artifacts',
      sequence_number: 3,
      status: 'completed',
      phase: 'Phase 3',
      phase_description: 'Templates and documentation',
      progress: 100,
      deliverables: [
        'Strategic Directive template',
        'Epic Execution Sequence template',
        'Product Requirements Document template',
        'Agent communication templates',
        'Quick-start scripts'
      ],
      assigned_to: ['EXEC'],
      dependencies: ['EES-2025-01-15-A-02'],
      actual_start: '2025-01-15T02:00:00Z',
      actual_end: '2025-01-15T03:00:00Z',
      created_by: 'PLAN'
    },
    {
      id: 'EES-2025-01-15-A-04',
      directive_id: 'SD-2025-01-15-A',
      title: 'End-to-End Validation',
      description: 'Create first Strategic Directive and test complete workflow',
      sequence_number: 4,
      status: 'in_progress',
      phase: 'Phase 4',
      phase_description: 'Testing and validation',
      progress: 75,
      deliverables: [
        'First Strategic Directive (SD-2025-01-15-A)',
        'Database integration test',
        'Workflow validation',
        'Completion report'
      ],
      assigned_to: ['EXEC'],
      dependencies: ['EES-2025-01-15-A-03'],
      planned_start: '2025-01-15T03:00:00Z',
      planned_end: '2025-01-15T04:00:00Z',
      actual_start: '2025-01-15T03:00:00Z',
      created_by: 'PLAN'
    }
  ];

  console.log('📋 Adding Epic Execution Sequences to database...\n');

  for (const ees of eesItems) {
    const { data, error } = await supabase
      .from('execution_sequences_v2')
      .insert(ees)
      .select();

    if (error) {
      console.error(`❌ Error adding ${ees.id}:`, error.message);
    } else {
      console.log(`✅ ${ees.id}: ${ees.title} (${ees.status})`);
    }
  }

  console.log('\n📊 Summary:');
  console.log('  Total EES items: 4');
  console.log('  Completed: 3');
  console.log('  In Progress: 1');
  console.log('\n✨ Epic Execution Sequences added successfully!');
}

addEESToDatabase();