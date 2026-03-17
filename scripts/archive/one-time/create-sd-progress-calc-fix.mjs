#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-PROGRESS-CALC-FIX';

const sdData = {
  id: SD_ID,
  sd_key: SD_ID,
  title: 'Fix Progress Calculation System Bug',
  description: 'Fix calculate_sd_progress_v2() function bug that returns 40% when all phases show 100% complete, blocking all SD completions system-wide.',
  scope: `Fix critical bug in calculate_sd_progress_v2() function that prevents SD completion.

**Current Behavior**:
- Function returns 40% progress even when all phases show complete: true
- Phase breakdown shows: PLAN_prd (20), LEAD_approval (20), PLAN_verification (15), EXEC_implementation (30), LEAD_final_approval (15) = 100%
- But total_progress returns 40% instead of 100%
- Blocks marking SDs as complete (LEO Protocol violation error)

**Blocking**:
- SD-CICD-WORKFLOW-FIX cannot be marked complete despite all work finished
- All future SDs will face the same completion blocker
- Progress tracking is unreliable across the system

**Expected Behavior**:
- calculate_sd_progress_v2() should sum individual phase progress correctly
- When all phases complete, total should be 100%
- SDs with 100% progress should be allowed to mark as complete`,

  category: 'infrastructure',
  priority: 'critical',
  target_application: 'EHG_Engineer',
  current_phase: 'LEAD',
  status: 'pending_approval',
  
  rationale: `This is a critical system bug preventing ANY Strategic Directive from completing. The progress calculation function is fundamentally broken, returning incorrect totals despite correct individual phase values.

**Impact**:
- BLOCKER for SD-CICD-WORKFLOW-FIX (all work done, can't complete)
- BLOCKER for all future SDs (same bug will affect them)
- Undermines trust in LEO Protocol progress tracking
- Creates manual workaround burden

**Root Cause**:
The calculate_sd_progress_v2() database function has a logic error in how it aggregates individual phase progress values. It shows each phase as complete with correct weights, but the total doesn't sum correctly.

**Evidence**:
- SD-CICD-WORKFLOW-FIX: progress column = 0%, get_progress_breakdown shows 100%
- Manual update to progress=100 still blocked by function returning 40%
- Function output inconsistent with phase breakdown

**Priority Justification**:
CRITICAL because it blocks all SD completions system-wide. Must be fixed before any SD can properly complete.`,

  success_criteria: [
    'calculate_sd_progress_v2() correctly sums phase progress values',
    'SD-CICD-WORKFLOW-FIX can be marked as complete (100% progress)',
    'get_progress_breakdown() total_progress matches sum of individual phases',
    'New SDs calculate progress correctly through all phases',
    'No manual progress column updates needed',
    'Progress trigger updates SD progress column automatically'
  ],

  metadata: {
    blocker_for: ['SD-CICD-WORKFLOW-FIX', 'All SDs requiring completion'],
    identified_in: 'SD-CICD-WORKFLOW-FIX EXEC→PLAN handoff attempt',
    affected_function: 'calculate_sd_progress_v2()',
    error_pattern: 'LEO Protocol Violation: Cannot mark SD complete - Progress: 40% (need 100%)',
    database_location: 'database/functions/calculate_sd_progress_v2.sql',
    estimated_hours: 4
  },

  progress: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

async function createSD() {
  console.log('\n🎯 Creating Strategic Directive: SD-PROGRESS-CALC-FIX');
  console.log('═'.repeat(70));

  // Check if SD already exists
  const { data: existing } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('id', SD_ID)
    .single();

  if (existing) {
    console.log('⚠️  SD already exists:', SD_ID);
    console.log('   Updating instead of creating...');
    
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .update(sdData)
      .eq('id', SD_ID)
      .select()
      .single();

    if (error) {
      console.error('❌ Error updating SD:', error.message);
      throw error;
    }

    console.log('✅ SD updated successfully');
  } else {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(sdData)
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating SD:', error.message);
      throw error;
    }

    console.log('✅ SD created successfully');
  }

  console.log('\n📋 SD Details:');
  console.log(`   ID: ${SD_ID}`);
  console.log(`   Title: ${sdData.title}`);
  console.log(`   Priority: ${sdData.priority}`);
  console.log(`   Category: ${sdData.category}`);
  console.log(`   Status: ${sdData.status}`);
  console.log(`   Phase: ${sdData.current_phase}`);
  
  console.log('\n🎯 Blockers Addressed:');
  console.log('   • SD-CICD-WORKFLOW-FIX completion blocked');
  console.log('   • All future SD completions at risk');
  console.log('   • Progress tracking system unreliable');

  console.log('\n📝 Next Steps:');
  console.log('   1. LEAD agent reviews and approves SD');
  console.log('   2. PLAN creates PRD with function fix requirements');
  console.log('   3. EXEC fixes calculate_sd_progress_v2() function');
  console.log('   4. Verify SD-CICD-WORKFLOW-FIX can complete');
  console.log('═'.repeat(70));
}

createSD().catch(console.error);
