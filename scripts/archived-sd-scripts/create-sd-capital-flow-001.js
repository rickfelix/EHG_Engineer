#!/usr/bin/env node

/**
 * Create SD-CAPITAL-FLOW-001: Capital Transactions Table
 * Completes the 6-Pillar Genesis Infrastructure
 *
 * Gap identified in SD-UNIFIED-PATH-2.2.1: capital_transactions table missing
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createStrategicDirective() {
  console.log('\nCreating SD-CAPITAL-FLOW-001: Capital Transactions Table...\n');

  const sdData = {
    id: 'SD-CAPITAL-FLOW-001',
    sd_key: 'SD-CAPITAL-FLOW-001',
    title: 'Capital Transactions Table: 6-Pillar Token Flow Infrastructure',
    description: `Create the capital_transactions table to complete the 6-pillar Genesis infrastructure.

This table tracks token/financial flows between ventures, stages, and agents, enabling:
- Token budget allocation per venture
- Stage-based capital expenditure tracking
- Agent cost attribution
- Burn rate analytics

Gap identified in SD-UNIFIED-PATH-2.2.1: During 6-pillar seeding, discovered that capital_transactions table does not exist. Other 5 pillars verified:
- venture_stage_work: 33 rows
- system_events: 67 rows
- agent_registry: 7 rows
- chairman_directives: exists
- ventures: populated`,

    status: 'draft',
    priority: 'medium',
    category: 'database',

    strategic_intent: 'Complete the 6-pillar Genesis infrastructure with capital flow tracking',

    rationale: 'The capital_transactions table is referenced in the 6-pillar Genesis concept but does not exist. This creates a gap in token budget tracking and financial flow visibility. Without this table, we cannot track token allocations to stages or calculate agent operational costs.',

    scope: {
      included: [
        'Create capital_transactions table with proper schema',
        'Foreign key relationships to ventures and venture_stage_work',
        'RLS policies for data security',
        'Seed data for 5 ventures',
        'Database function for token balance calculation'
      ],
      excluded: [
        'UI components for capital tracking (future SD)',
        'Real-time token streaming (future SD)',
        'Integration with external payment systems'
      ],
      database_changes: {
        new_tables: ['capital_transactions'],
        modified_tables: []
      }
    },

    strategic_objectives: [
      'Complete the 6-pillar Genesis infrastructure with capital flow tracking',
      'Enable token budget management per venture and stage',
      'Provide foundation for burn rate analytics and cost attribution',
      'Support correlation_id for cross-pillar event tracing'
    ],

    success_criteria: [
      'capital_transactions table created with proper schema',
      'FK relationships to ventures.id and venture_stage_work.id',
      'RLS policies applied (authenticated users can read)',
      'Seed data inserted for 5 ventures (minimum 25 transactions)',
      'Database function for token balance per venture works correctly',
      'Migration file follows naming convention'
    ],

    key_principles: [
      'Schema follows existing pillar table patterns (FK to ventures.id)',
      'Supports correlation_id for cross-pillar tracing',
      'Idempotent migrations with ON CONFLICT handling',
      'Proper RLS policies for data security'
    ],

    implementation_guidelines: [
      'Create migration file: 20251228_create_capital_transactions_table.sql',
      'Schema: id (uuid), venture_id (FK), stage_work_id (FK nullable), amount (numeric), transaction_type (text), correlation_id (text), created_at',
      'Transaction types: token_allocation, stage_expense, agent_cost, refund',
      'RLS policy: authenticated users can SELECT, service role can INSERT/UPDATE',
      'Seed with 25+ transactions across 5 ventures',
      'Create get_venture_token_balance(venture_id) function'
    ],

    dependencies: [
      'ventures table (existing)',
      'venture_stage_work table (existing)',
      'SD-UNIFIED-PATH-2.0 completed (6-pillar infrastructure defined)'
    ],

    risks: [
      {
        description: 'FK constraint violations if venture_stage_work IDs dont exist',
        mitigation: 'Query existing stage_work IDs before seeding transactions',
        severity: 'low'
      },
      {
        description: 'RLS policy may block legitimate queries',
        mitigation: 'Test with authenticated and anon roles before applying',
        severity: 'low'
      }
    ],

    success_metrics: [
      'capital_transactions table exists with correct schema',
      '25+ rows seeded for 5 ventures',
      'get_venture_token_balance() function returns correct totals',
      'RLS policy allows authenticated SELECT',
      'All 6 pillar tables can be JOINed successfully'
    ],

    metadata: {
      created_by: 'LEO Protocol System',
      sequence_rank: 50,
      parent_context: 'SD-UNIFIED-PATH-2.0',
      gap_identified_in: 'SD-UNIFIED-PATH-2.2.1',
      pillar_number: 4,
      related_tables: ['ventures', 'venture_stage_work', 'agent_registry'],
      sub_agents_required: ['Principal Database Architect'],
      database_changes: true,
      estimated_effort: '2-4 hours'
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
    const { data: existing, error: _checkError } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', 'SD-CAPITAL-FLOW-001')
      .single();

    if (existing) {
      console.log('SD-CAPITAL-FLOW-001 already exists. Updating...');

      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update(sdData)
        .eq('id', 'SD-CAPITAL-FLOW-001')
        .select()
        .single();

      if (error) throw error;
      console.log('SD-CAPITAL-FLOW-001 updated successfully!');
      return data;
    }

    // Create new SD
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(sdData)
      .select()
      .single();

    if (error) throw error;

    console.log('SD-CAPITAL-FLOW-001 created successfully!');
    console.log('\nStrategic Directive Details:');
    console.log('='.repeat(60));
    console.log(`ID: ${data.id}`);
    console.log(`Title: ${data.title}`);
    console.log(`Priority: ${data.priority}`);
    console.log(`Status: ${data.status}`);
    console.log(`Category: ${data.category}`);
    console.log(`Phase: ${data.current_phase}`);

    console.log('\nStrategic Objectives:');
    data.strategic_objectives.forEach((obj, i) => {
      console.log(`  ${i + 1}. ${obj}`);
    });

    console.log('\nSuccess Criteria:');
    data.success_criteria.forEach((criterion, i) => {
      console.log(`  ${i + 1}. ${criterion}`);
    });

    console.log('\nDatabase Changes:');
    console.log('  - New table: capital_transactions');
    console.log('  - New function: get_venture_token_balance()');

    return data;

  } catch (error) {
    console.error('Error creating SD-CAPITAL-FLOW-001:', error.message);
    throw error;
  }
}

// Run if executed directly
createStrategicDirective()
  .then(() => {
    console.log('\nNext steps:');
    console.log('1. Review SD in database: npm run sd:next');
    console.log('2. Execute LEAD-TO-PLAN handoff: node scripts/handoff.js execute LEAD-TO-PLAN SD-CAPITAL-FLOW-001');
    console.log('3. Create PRD after handoff completes');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

export { createStrategicDirective };
