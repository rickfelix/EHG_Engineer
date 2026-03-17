#!/usr/bin/env node
/**
 * Query sd_backlog_map for SD-SUBAGENT-IMPROVE-001
 *
 * Standard PLAN phase step 3 of 5-step checklist
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function queryBacklogItems() {
  console.log('📋 Querying sd_backlog_map for SD-SUBAGENT-IMPROVE-001...\n');

  const { data: items, error } = await supabase
    .from('sd_backlog_map')
    .select('*')
    .eq('sd_id', 'SD-SUBAGENT-IMPROVE-001')
    .order('priority', { ascending: false })
    .order('sequence_no', { ascending: true });

  if (error) {
    console.error('❌ Error querying backlog:', error.message);
    process.exit(1);
  }

  console.log(`✅ Query complete: ${items.length} backlog item(s) found\n`);

  if (items.length === 0) {
    console.log('📌 Result: NO BACKLOG ITEMS');
    console.log('');
    console.log('   This is EXPECTED for SD-SUBAGENT-IMPROVE-001.');
    console.log('   This SD is retrospective-driven, not backlog-driven.');
    console.log('');
    console.log('   Scope defined by:');
    console.log('   - Gap analysis from retrospectives');
    console.log('   - Strategic objectives in SD record');
    console.log('   - LEAD phase evaluation findings');
    console.log('');
    console.log('✅ Backlog check complete - Proceeding to PRD creation');
  } else {
    console.log('📦 Backlog Items:');
    items.forEach((item, i) => {
      console.log(`\n   ${i+1}. ${item.backlog_title}`);
      console.log(`      Priority: ${item.priority}`);
      console.log(`      Status: ${item.completion_status}`);
      console.log(`      Phase: ${item.phase}`);
      if (item.item_description) {
        console.log(`      Description: ${item.item_description}`);
      }
    });
  }
}

queryBacklogItems().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
