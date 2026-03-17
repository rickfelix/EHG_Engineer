#!/usr/bin/env node
/**
 * Update SD-SUBAGENT-IMPROVE-001 to PLAN Phase
 *
 * Updates SD after LEAD approval:
 * - Progress: 0% → 35% (LEAD phase complete)
 * - Phase: lead → plan
 * - Status: draft → in_progress
 * - Add LEAD approval timestamp
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function updateSDToPlanPhase() {
  console.log('📋 Updating SD-SUBAGENT-IMPROVE-001 to PLAN phase...\n');

  const { data: updated, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      current_phase: 'plan',
      progress: 35, // LEAD phase = 35% of total
      status: 'in_progress',
      updated_at: new Date().toISOString()
    })
    .eq('id', 'SD-SUBAGENT-IMPROVE-001')
    .select()
    .single();

  if (error) {
    console.error('❌ Error updating SD:', error.message);
    process.exit(1);
  }

  console.log('✅ SD-SUBAGENT-IMPROVE-001 updated successfully:');
  console.log('');
  console.log('   ID:', updated.id);
  console.log('   Title:', updated.title);
  console.log('   Status:', updated.status);
  console.log('   Phase:', updated.current_phase);
  console.log('   Progress:', updated.progress + '%');
  console.log('   Updated:', new Date(updated.updated_at).toLocaleString());
  console.log('');
  console.log('📊 Phase Breakdown:');
  console.log('   ✅ LEAD: 35% (COMPLETE)');
  console.log('   ⏳ PLAN: 35% (IN PROGRESS)');
  console.log('   ⏳ EXEC: 30% (PENDING)');
  console.log('');
  console.log('🚀 Ready for PLAN phase PRD creation!');
}

updateSDToPlanPhase().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
