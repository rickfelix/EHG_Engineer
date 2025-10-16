#!/usr/bin/env node
/**
 * Check user_stories table schema
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkSchema() {
  console.log('📋 Checking user_stories table schema\n');

  // First, get any user story to see the actual columns
  const { data: sample, error } = await supabase
    .from('user_stories')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (sample && sample.length > 0) {
    console.log('Sample user story columns:');
    Object.keys(sample[0]).forEach(col => {
      console.log(`  - ${col}: ${typeof sample[0][col]}`);
    });
  } else {
    console.log('No user stories found');
  }

  // Try to find user stories for SD-RETRO-ENHANCE-001 using different column names
  console.log('\n🔍 Searching for SD-RETRO-ENHANCE-001 user stories:\n');

  // Try sd_id
  console.log('Trying sd_id...');
  const { data: byId, error: idError } = await supabase
    .from('user_stories')
    .select('id, title, validation_status')
    .eq('sd_id', 'SD-RETRO-ENHANCE-001');

  if (!idError && byId && byId.length > 0) {
    console.log(`✅ Found ${byId.length} user stories using sd_id`);
    byId.forEach(us => console.log(`   - ${us.id}: ${us.title} (${us.validation_status})`));
    return;
  }

  // Try sd_uuid
  console.log('Trying sd_uuid...');
  const { data: byUuid, error: uuidError } = await supabase
    .from('user_stories')
    .select('id, title, validation_status')
    .eq('sd_uuid', 'SD-RETRO-ENHANCE-001');

  if (!uuidError && byUuid && byUuid.length > 0) {
    console.log(`✅ Found ${byUuid.length} user stories using sd_uuid`);
    byUuid.forEach(us => console.log(`   - ${us.id}: ${us.title} (${us.validation_status})`));
    return;
  }

  // Try strategic_directive_id
  console.log('Trying strategic_directive_id...');
  const { data: bySdId, error: sdIdError } = await supabase
    .from('user_stories')
    .select('id, title, validation_status')
    .eq('strategic_directive_id', 'SD-RETRO-ENHANCE-001');

  if (!sdIdError && bySdId && bySdId.length > 0) {
    console.log(`✅ Found ${bySdId.length} user stories using strategic_directive_id`);
    bySdId.forEach(us => console.log(`   - ${us.id}: ${us.title} (${us.validation_status})`));
    return;
  }

  console.log('❌ Could not find user stories for SD-RETRO-ENHANCE-001');
  console.log('Errors:');
  console.log('  sd_id:', idError?.message);
  console.log('  sd_uuid:', uuidError?.message);
  console.log('  strategic_directive_id:', sdIdError?.message);
}

checkSchema().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
