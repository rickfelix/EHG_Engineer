#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('═══════════════════════════════════════════════════════════');
console.log('   LEAD PRE-APPROVAL: 5-STEP SD EVALUATION');
console.log('═══════════════════════════════════════════════════════════\n');

const SD_ID = 'SD-RECONNECT-009-P2';

// Step 1: Query SD Metadata
console.log('Step 1: Query SD Metadata');
console.log('─'.repeat(60));
const { data: sd, error: sdError } = await supabase
  .from('strategic_directives_v2')
  .select('*')
  .eq('id', SD_ID)
  .single();

if (sdError) {
  console.error('Error fetching SD:', sdError);
  process.exit(1);
}

console.log(`SD ID: ${sd.id}`);
console.log(`Title: ${sd.title}`);
console.log(`Status: ${sd.status}`);
console.log(`Priority: ${sd.priority}`);
console.log(`Progress: ${sd.progress}%`);
console.log(`Current Phase: ${sd.current_phase}`);
console.log(`Category: ${sd.category || 'Not specified'}`);
console.log(`Target Application: ${sd.target_application || 'Not specified'}`);
console.log('\nScope:');
console.log(sd.scope || 'Not specified');
console.log('\n');

// Step 2: Check for Existing PRD
console.log('Step 2: Check for Existing PRD');
console.log('─'.repeat(60));
const { data: prds, error: prdError } = await supabase
  .from('product_requirements_v2')
  .select('id, title, status, objectives, acceptance_criteria')
  .eq('directive_id', SD_ID);

if (prds && prds.length > 0) {
  console.log(`✅ Found ${prds.length} PRD(s):`);
  prds.forEach(prd => {
    console.log(`   - ${prd.id}: ${prd.title} (${prd.status})`);
    console.log(`     Objectives: ${prd.objectives?.length || 0}`);
    console.log(`     Acceptance Criteria: ${prd.acceptance_criteria?.length || 0}`);
  });
} else {
  console.log('❌ No PRD found - will need to be created in PLAN phase');
}
console.log('\n');

// Step 3: Query Backlog Items (CRITICAL)
console.log('Step 3: Query Backlog Items (CRITICAL)');
console.log('─'.repeat(60));
const { data: backlogItems, error: backlogError } = await supabase
  .from('sd_backlog_map')
  .select('*')
  .eq('sd_id', SD_ID)
  .order('priority', { ascending: false })
  .order('sequence_no', { ascending: true });

if (backlogItems && backlogItems.length > 0) {
  console.log(`✅ Found ${backlogItems.length} backlog item(s):\n`);
  backlogItems.forEach((item, i) => {
    console.log(`${i + 1}. ${item.backlog_title || 'Untitled'}`);
    console.log(`   Priority: ${item.priority} | Status: ${item.completion_status}`);
    console.log(`   Phase: ${item.phase || 'Not specified'}`);
    if (item.item_description) {
      console.log(`   Description: ${item.item_description}`);
    }
    if (item.extras?.Description_1) {
      console.log(`   Details: ${item.extras.Description_1.substring(0, 100)}...`);
    }
    console.log('');
  });
} else {
  console.log('⚠️  No backlog items found - Scope may be in SD metadata only');
}
console.log('\n');

// Step 4: Recommend next action
console.log('═══════════════════════════════════════════════════════════');
console.log('   LEAD DECISION REQUIRED');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('SIMPLICITY FIRST Gate Questions:');
console.log('1. Is this solving a real user problem or perceived problem?');
console.log('2. What\'s the simplest solution that delivers core value?');
console.log('3. Can we configure existing tools instead of building new?');
console.log('4. Can we deliver 80% value with 20% of proposed effort?');
console.log('5. Should this be split into multiple smaller SDs?');
console.log('6. Can we defer Phase 2-4 features to separate SD?');
console.log('\n');

process.exit(0);
