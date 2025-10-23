#!/usr/bin/env node

/**
 * Update SD priority to HIGH
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function updatePriority() {
  console.log('🎯 Updating SD priorities to HIGH...\n');

  const sdIds = [
    'SD-2025-1020-HANDOFF-FIX',
    'SD-2025-1020-E2E-SELECTORS'
  ];

  for (const sdId of sdIds) {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .update({ priority: 'high' })
      .eq('id', sdId)
      .select('id, title, priority');

    if (error) {
      console.error(`❌ Error updating ${sdId}:`, error.message);
    } else if (data && data.length > 0) {
      console.log(`✅ ${data[0].id}: ${data[0].title}`);
      console.log(`   Priority: ${data[0].priority}\n`);
    } else {
      console.log(`⚠️  SD not found: ${sdId}\n`);
    }
  }

  console.log('✨ Priority updates complete!');
}

updatePriority().catch(console.error);
