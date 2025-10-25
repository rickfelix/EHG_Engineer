#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = process.argv[2];

if (!SD_ID) {
  console.error('Usage: node scripts/update-sd-completion.js <SD-ID>');
  process.exit(1);
}

async function updateSDCompletion() {
  console.log(`\n=== Updating SD Completion: ${SD_ID} ===\n`);

  // 1. Get current SD state
  console.log('1. Fetching current SD state...');
  const { data: currentSD, error: fetchError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_id, sd_key, title, status, progress')
    .or(`id.eq.${SD_ID},sd_id.eq.${SD_ID},sd_key.eq.${SD_ID}`)
    .single();

  if (fetchError) {
    console.error('Error fetching SD:', fetchError.message);

    // Try searching for it
    console.log('\nSearching for SD with partial match...');
    const { data: searchResults, error: searchError } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_id, sd_key, title, status, progress')
      .or(`sd_id.ilike.%${SD_ID}%,sd_key.ilike.%${SD_ID}%`)
      .limit(5);

    if (searchError || !searchResults || searchResults.length === 0) {
      console.error('SD not found');
      process.exit(1);
    }

    console.log('\nFound these SDs:');
    searchResults.forEach(sd => {
      console.log(`  - ${sd.sd_id || sd.sd_key} (${sd.id}): ${sd.title}`);
      console.log(`    Status: ${sd.status}, Progress: ${sd.progress}%`);
    });

    console.log('\nPlease run again with the exact ID from above');
    process.exit(1);
  }

  console.log('Current SD state:');
  console.log(`  ID: ${currentSD.id}`);
  console.log(`  SD Key: ${currentSD.sd_key || currentSD.sd_id}`);
  console.log(`  Title: ${currentSD.title}`);
  console.log(`  Status: ${currentSD.status}`);
  console.log(`  Progress: ${currentSD.progress}%`);

  // 2. Check allowed status values
  const allowedStatuses = ['draft', 'in_progress', 'active', 'pending_approval', 'completed', 'deferred', 'cancelled'];

  console.log('\n2. Checking status validity...');
  if (!allowedStatuses.includes(currentSD.status)) {
    console.log(`❌ Current status '${currentSD.status}' is NOT in allowed list!`);
    console.log(`   Allowed: ${allowedStatuses.join(', ')}`);
    console.log('\n   This is why the update fails - must fix status first.');
  } else {
    console.log(`✅ Current status '${currentSD.status}' is valid`);
  }

  // 3. Update to completed with 100% progress
  console.log('\n3. Updating SD to completed status with 100% progress...');

  const updateData = {
    status: 'completed',
    progress: 100,
    updated_at: new Date().toISOString()
  };

  const { data: updated, error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update(updateData)
    .eq('id', currentSD.id)
    .select()
    .single();

  if (updateError) {
    console.error('❌ Update failed:', updateError.message);
    console.log('\nConstraint check values:');
    console.log(`  Allowed statuses: ${allowedStatuses.join(', ')}`);
    console.log(`  Trying to set: '${updateData.status}'`);
    console.log('\nDiagnostic: The error suggests the status constraint is different than expected.');
    console.log('Check the database directly or review the most recent migration.');
    process.exit(1);
  }

  console.log('✅ Update successful!');
  console.log('\nUpdated SD:');
  console.log(`  Status: ${updated.status}`);
  console.log(`  Progress: ${updated.progress}%`);
  console.log(`  Updated at: ${updated.updated_at}`);

  console.log('\n=== Completion Update Complete ===');
}

updateSDCompletion().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
