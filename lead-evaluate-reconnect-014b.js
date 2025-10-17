#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('═══════════════════════════════════════════════════════════');
console.log('   LEAD PRE-APPROVAL: SD-RECONNECT-014B');
console.log('═══════════════════════════════════════════════════════════\n');

const SD_ID = 'SD-RECONNECT-014B';

// Step 1: Query SD Metadata
console.log('Step 1: Query SD Metadata');
console.log('─'.repeat(60));
const { data: sd, error: sdError } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('id', SD_ID)
  .single();

if (sdError) {
  console.error('Error:', sdError);
  process.exit(1);
}

console.log(`SD ID: ${sd.id}`);
console.log(`Title: ${sd.title}`);
console.log(`Status: ${sd.status}`);
console.log(`Priority: ${sd.priority}`);
console.log(`Progress: ${sd.progress}%`);
console.log(`Current Phase: ${sd.current_phase}`);
console.log(`Category: ${sd.category || 'Not specified'}`);
console.log(`Target App: ${sd.target_application || 'Not specified'}`);
console.log('\nScope:');
console.log(sd.scope || 'Not specified');
console.log('\n');

// Step 2: Check for PRD
console.log('Step 2: Check for Existing PRD');
console.log('─'.repeat(60));
const { data: prds } = await supabase
  .from('product_requirements_v2')
  .select('id, title, status')
  .eq('directive_id', SD_ID);

if (prds && prds.length > 0) {
  console.log(`✅ Found ${prds.length} PRD(s)`);
} else {
  console.log('❌ No PRD found');
}
console.log('\n');

// Step 3: Query Backlog Items
console.log('Step 3: Query Backlog Items (CRITICAL)');
console.log('─'.repeat(60));
const { data: backlogItems } = await supabase
  .from('sd_backlog_map')
  .select('*')
  .eq('sd_id', SD_ID)
  .order('priority', { ascending: false });

if (backlogItems && backlogItems.length > 0) {
  console.log(`✅ Found ${backlogItems.length} backlog item(s):\n`);
  backlogItems.forEach((item, i) => {
    console.log(`${i + 1}. ${item.backlog_title || 'Untitled'}`);
    console.log(`   Priority: ${item.priority} | Status: ${item.completion_status}`);
    if (item.extras?.Description_1) {
      console.log(`   Details: ${item.extras.Description_1.substring(0, 150)}...`);
    }
    console.log('');
  });
} else {
  console.log('⚠️  No backlog items found');
}
console.log('\n');

console.log('═══════════════════════════════════════════════════════════');
console.log('   SIMPLICITY FIRST GATE');
console.log('═══════════════════════════════════════════════════════════\n');

process.exit(0);
