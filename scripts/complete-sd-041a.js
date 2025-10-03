#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function completeSD() {
  console.log('🎯 Marking Knowledge Base SD as 100% complete...\n');

  // Get the Knowledge Base SD
  const { data: sds, error: fetchError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('title', 'Knowledge Base - Service Integration')
    .eq('status', 'active');

  if (fetchError || !sds || sds.length === 0) {
    console.error('❌ Error fetching SD:', fetchError?.message || 'Not found');
    process.exit(1);
  }

  const sd = sds[0];
  console.log('📋 Found SD:');
  console.log('   ID:', sd.id);
  console.log('   Title:', sd.title);
  console.log('   Status:', sd.status);
  console.log('   SD Key:', sd.sd_key || 'NULL');
  console.log();

  // Update to completed
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'completed',
      sd_key: sd.sd_key || 'SD-041A',
      metadata: {
        ...(sd.metadata || {}),
        final_implementation_commit: '84fdbfe',
        handoff_resilience_commit: 'a96ce67',
        lead_approval: true,
        retrospective_complete: true,
        completion_date: new Date().toISOString()
      }
    })
    .eq('id', sd.id)
    .select();

  if (error) {
    console.error('❌ Error updating SD:', error.message);
    process.exit(1);
  }

  console.log('✅ SD marked as complete!');
  console.log('\n📊 Final Status:');
  console.log('   SD Key:', data[0].sd_key);
  console.log('   Status:', data[0].status);
  console.log('   Title:', data[0].title);
  console.log('\n🎉 LEO Protocol execution complete for Knowledge Base Integration!');
}

completeSD().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
