#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function markSDAsWorking(sdId) {
  console.log(`\n🎯 Marking ${sdId} as currently being worked on`);
  console.log('═'.repeat(50));

  // Get current SD data
  const { data: sd, error: fetchError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', sdId)
    .single();

  if (fetchError || !sd) {
    console.error('Error fetching SD:', fetchError?.message || 'Not found');
    return;
  }

  // Update metadata to mark as working
  const updatedMetadata = {
    ...sd.metadata,
    is_working_on: true,
    work_started_at: new Date().toISOString(),
    current_phase: sd.metadata?.current_phase || 'LEAD_PLANNING'
  };

  // Update the SD
  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({
      metadata: updatedMetadata
    })
    .eq('id', sdId);

  if (updateError) {
    console.error('Error updating SD:', updateError.message);
    return;
  }

  console.log(`\n✅ ${sdId} marked as currently being worked on`);
  console.log('\nSD Details:');
  console.log(`Title: ${sd.title}`);
  console.log(`Status: ${sd.status}`);
  console.log(`Target Application: ${sd.target_application || 'Not specified'}`);
  console.log(`Priority: ${sd.priority}`);
}

// Get SD ID from command line
const sdId = process.argv[2] || 'SD-1A';
markSDAsWorking(sdId).catch(console.error);