#!/usr/bin/env node

/**
 * Create SD-LEO-PROTOCOL-V4-4-0 in database
 * LEAD Approval: Completed
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function createSD() {
  console.log('📋 Creating SD-LEO-PROTOCOL-V4-4-0...\n');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Service role for writes

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const sdData = {
    id: 'SD-LEO-PROTOCOL-V4-4-0',
    sd_key: 'SD-LEO-PROTOCOL-V4-4-0',
    title: 'Sub-Agent Adaptive Validation System',
    description: 'Implement adaptive validation modes for LEO Protocol sub-agents to support both prospective (pre-implementation) and retrospective (post-implementation) validation scenarios. Addresses architectural constraint where sub-agents block completion at 85% due to validation criteria designed for prospective work being applied retrospectively.',
    rationale: 'Enables pragmatic completion of delivered SDs without sacrificing validation rigor. Current system blocks SD-STAGE4-AI-FIRST-UX-001 at 85% despite 100% functional delivery. Sub-agents use prospective validation criteria (pre-implementation) but fail when applied retrospectively (post-implementation completed work).',
    scope: 'Add validation_mode enum, update 6 sub-agents with adaptive logic, implement CONDITIONAL_PASS verdict, update progress calculation, document audit trail.',
    status: 'active',
    category: 'Infrastructure',
    priority: 'high',
    metadata: {
      origin: 'SD-STAGE4-AI-FIRST-UX-001',
      complexity_score: 8,
      over_engineering_check: 'PASSED',
      lead_validation_complete: true,
      scope_locked: true,
      approval_date: new Date().toISOString(),
      estimated_effort_hours: 8,
      in_scope: [
        'Add validation_mode column (prospective/retrospective)',
        'Update all 6 sub-agents with adaptive validation logic',
        'Implement CONDITIONAL_PASS verdict type',
        'Update progress calculation function',
        'Document validation criteria + audit trail'
      ],
      out_of_scope: [
        'Changing validation criteria (only adapting application)',
        'Removing validation requirements',
        'Automatic retrospective mode'
      ],
      strategic_validation: {
        need: 'REAL - 4/6 sub-agents BLOCKED retrospectively',
        solution: 'ALIGNED - Flexible completion + quality gates',
        value: 'HIGH - Unblocks 15% gap for 6-8 hours',
        feasibility: 'FEASIBLE - Straightforward migration',
        risks_mitigated: true
      }
    },
    current_phase: 'LEAD',
    created_by: 'LEAD'
  };

  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(sdData)
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating SD:', error);
      process.exit(1);
    }

    console.log('✅ SD created successfully\n');
    console.log('ID:', data.id);
    console.log('Title:', data.title);
    console.log('Status:', data.status);
    console.log('Priority:', data.priority);
    console.log('Current Phase:', data.current_phase);
    console.log('\n📊 Metadata:');
    console.log('- Complexity Score:', data.metadata?.complexity_score, '/30 (WELL-SCOPED)');
    console.log('- Over-Engineering Check:', data.metadata?.over_engineering_check);
    console.log('- LEAD Validation:', data.metadata?.lead_validation_complete);
    console.log('- Scope Locked:', data.metadata?.scope_locked);
    console.log('- Estimated Effort:', data.metadata?.estimated_effort_hours, 'hours');
    console.log('\n✅ Ready for PLAN phase');

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

createSD();
