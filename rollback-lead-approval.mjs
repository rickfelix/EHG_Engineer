#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('\n⏪ ROLLING BACK LEAD APPROVAL - SD-RECONNECT-011');
console.log('======================================================================\n');

const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('sd_key', 'SD-RECONNECT-011')
  .single();

console.log('Current Status:', sd.status);
console.log('Current Phase:', sd.current_phase);

// Remove premature approval and revert to pending state
const updatedMetadata = {
  ...sd.metadata,
  rollback: {
    reason: 'Manual testing not executed before approval',
    previous_status: sd.status,
    previous_phase: sd.current_phase,
    rollback_date: new Date().toISOString(),
    completion_date_removed: sd.completion_date
  }
};

// Remove the premature lead_final_approval
delete updatedMetadata.lead_final_approval;

const { error } = await supabase
  .from('strategic_directives_v2')
  .update({
    status: 'active',
    current_phase: 'LEAD_FINAL_APPROVAL',
    completion_date: null,
    metadata: updatedMetadata
  })
  .eq('sd_key', 'SD-RECONNECT-011');

if (error) {
  console.error('❌ Rollback failed:', error);
  process.exit(1);
}

console.log('\n✅ LEAD Approval Rolled Back:');
console.log('   Status: active (was completed)');
console.log('   Phase: LEAD_FINAL_APPROVAL (pending testing)');
console.log('   Completion Date: removed');
console.log('   Reason: Manual testing required before final approval\n');

console.log('📋 Next Steps:');
console.log('   1. Execute automated testing');
console.log('   2. Document test results');
console.log('   3. Re-execute LEAD approval with evidence\n');

console.log('======================================================================\n');
