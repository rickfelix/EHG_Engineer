#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

(async () => {
  const { data: items } = await supabase
    .from('sd_backlog_map')
    .select('*')
    .eq('sd_id', 'SD-001');

  console.log('📋 BACKLOG ITEMS FOR SD-001: AI Agents');
  console.log('=====================================');
  
  if (items?.length > 0) {
    items.forEach((item, idx) => {
      console.log(`\n${idx + 1}. ${item.backlog_title}`);
      console.log(`   Priority: ${item.priority}`);
      console.log(`   Description: ${item.item_description || 'No description'}`);
    });
  } else {
    console.log('No backlog items found');
  }
})();