#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY
);

async function checkBacklog() {
  console.log('📋 BACKLOG LINKAGE CHECK - SD-VIDEO-VARIANT-001');
  console.log('='.repeat(80));

  // Check backlog linkage (Step 3 of 5-step evaluation - CRITICAL!)
  const { data: backlogItems, error: backlogError } = await supabase
    .from('sd_backlog_map')
    .select('*')
    .eq('sd_id', 'SD-VIDEO-VARIANT-001')
    .order('priority', { ascending: false })
    .order('sequence_no', { ascending: true });

  if (backlogError) {
    console.error('❌ Error fetching backlog:', backlogError.message);
  } else if (!backlogItems || backlogItems.length === 0) {
    console.log('\n⚠️  No backlog items linked to this SD');
    console.log('   This SD may have been created directly without backlog mapping.');
  } else {
    console.log(`\n✅ Found ${backlogItems.length} backlog items linked to SD:`);
    backlogItems.forEach(item => {
      console.log(`\n  📌 Item #${item.sequence_no}`);
      console.log(`     Title: ${item.backlog_title}`);
      console.log(`     Priority: ${item.priority} (${item.description_raw})`);
      console.log(`     Status: ${item.completion_status}`);
      console.log(`     Phase: ${item.phase}`);
      if (item.item_description) {
        console.log(`     Description: ${item.item_description.substring(0, 100)}...`);
      }
      if (item.extras?.Description_1) {
        console.log(`     Details: ${item.extras.Description_1.substring(0, 100)}...`);
      }
    });
  }

  // Check PRD
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('id, status, executive_summary')
    .ilike('id', 'PRD-SD-VIDEO-VARIANT%')
    .single();

  if (!prdError && prd) {
    console.log(`\n✅ PRD exists: ${prd.id}`);
    console.log(`   Status: ${prd.status}`);
    console.log(`   Summary: ${prd.executive_summary?.substring(0, 100)}...`);
  } else {
    console.log('\n⚠️  No PRD found yet (expected at this phase)');
  }

  console.log('\n' + '='.repeat(80));
}

checkBacklog();
