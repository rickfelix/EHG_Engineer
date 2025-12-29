#!/usr/bin/env node

/**
 * Verify SD-AUTH-SETUP-2025-001 is fully visible in backlog system
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyBacklogVisibility() {
  console.log('🔍 Verifying SD-AUTH-SETUP-2025-001 Backlog Visibility');
  console.log('================================================================\n');

  // 1. Check the view
  console.log('📊 Checking strategic_directives_backlog view...');
  const { data: viewData, error: viewError } = await supabase
    .from('strategic_directives_backlog')
    .select('*')
    .eq('sd_id', 'SD-AUTH-SETUP-2025-001')
    .single();

  if (viewError) {
    console.log('❌ Error querying view:', viewError.message);
  } else if (viewData) {
    console.log('✅ SD found in strategic_directives_backlog view:');
    console.log('   sd_id:', viewData.sd_id);
    console.log('   sd_title:', viewData.sd_title);
    console.log('   total_items:', viewData.total_items);
    console.log('   h_count:', viewData.h_count);
    console.log('   m_count:', viewData.m_count);
    console.log('   l_count:', viewData.l_count);
    console.log('   page_title:', viewData.page_title);
    console.log('   page_category:', viewData.page_category);
    console.log('   import_run_id:', viewData.import_run_id);
  } else {
    console.log('⚠️  SD not found in view');
  }

  // 2. Check the backlog item
  console.log('\n📦 Checking sd_backlog_map...');
  const { data: backlogItems, error: backlogError } = await supabase
    .from('sd_backlog_map')
    .select('*')
    .eq('sd_id', 'SD-AUTH-SETUP-2025-001');

  if (!backlogError && backlogItems && backlogItems.length > 0) {
    console.log(`✅ Found ${backlogItems.length} backlog item(s):`);
    backlogItems.forEach(item => {
      console.log(`   - ${item.backlog_id}: ${item.backlog_title}`);
      console.log(`     Priority: ${item.priority}`);
      console.log(`     Import ID: ${item.import_run_id}`);
    });
  } else {
    console.log('⚠️  No backlog items found');
  }

  // 3. Check SD table directly
  console.log('\n📋 Checking strategic_directives_v2...');
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, h_count, m_count, l_count, total_items, import_run_id, present_in_latest_import')
    .eq('id', 'SD-AUTH-SETUP-2025-001')
    .single();

  if (!sdError && sd) {
    console.log('✅ SD record:');
    console.log('   h_count:', sd.h_count);
    console.log('   m_count:', sd.m_count);
    console.log('   l_count:', sd.l_count);
    console.log('   total_items:', sd.total_items);
    console.log('   import_run_id:', sd.import_run_id);
    console.log('   present_in_latest_import:', sd.present_in_latest_import);
  }

  // 4. Test API endpoints
  console.log('\n🌐 Testing API endpoints...');

  // Test the main backlog API
  try {
    const response = await fetch('http://localhost:3000/api/backlog/strategic-directives');
    const data = await response.json();
    const found = data.find(item => item.sd_id === 'SD-AUTH-SETUP-2025-001');

    if (found) {
      console.log('✅ Found in /api/backlog/strategic-directives');
      console.log('   Total items:', found.total_items);
      console.log('   H count:', found.h_count);
    } else {
      console.log('❌ Not found in API response');
    }
  } catch (_e) {
    console.log('⚠️  Could not test API:', e.message);
  }

  console.log('\n================================================================');
  console.log('📌 Summary:');
  console.log('1. If all checks pass, SD should be visible on Backlog Management page');
  console.log('2. Refresh http://localhost:3000 and navigate to Backlog Management');
  console.log('3. SD-AUTH-SETUP-2025-001 should appear in the list');
}

// Execute
verifyBacklogVisibility();