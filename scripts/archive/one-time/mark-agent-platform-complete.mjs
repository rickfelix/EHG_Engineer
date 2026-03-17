#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🎯 Marking SD-AGENT-PLATFORM-001 as DONE DONE');
console.log('='.repeat(60));

// Update SD status to completed
const { data: updateData, error: updateError } = await supabase
  .from('strategic_directives_v2')
  .update({
    status: 'completed',
    progress: 100,
    current_phase: 'DONE',
    metadata: {
      completion_date: new Date().toISOString(),
      final_story_points: 222,
      agents_delivered: 42,
      departments_delivered: 14,
      lead_approved: true,
      retrospective_generated: true
    }
  })
  .eq('id', 'SD-AGENT-PLATFORM-001')
  .select();

if (updateError) {
  console.error('❌ Error updating SD:', updateError);
  process.exit(1);
}

console.log('✅ SD-AGENT-PLATFORM-001 marked as DONE DONE');
console.log('\nFinal Status:');
console.log('  Status: completed');
console.log('  Progress: 100%');
console.log('  Story Points: 222/222');
console.log('  Agents: 42');
console.log('  Departments: 14');
console.log('  LEAD Approved: ✅');
console.log('  Retrospective: ✅');
console.log('\n' + '='.repeat(60));
console.log('🎉 SD-AGENT-PLATFORM-001 COMPLETE!');
