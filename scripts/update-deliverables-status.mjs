#!/usr/bin/env node
/**
 * Update sd_scope_deliverables to mark completed items
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function updateDeliverables() {
  console.log('\n🔧 Updating deliverable statuses...\n');

  const completedDeliverables = [
    'Development environment setup',
    'PresetService implemented',
    'UI components created',
    'Unit tests written and passing'
  ];

  for (const deliverable of completedDeliverables) {
    const { error } = await supabase
      .from('sd_scope_deliverables')
      .update({ completion_status: 'completed' })
      .eq('sd_id', 'SD-VWC-PRESETS-001')
      .eq('deliverable_name', deliverable);

    if (error) {
      console.error(`❌ Error updating "${deliverable}":`, error.message);
    } else {
      console.log(`✅ ${deliverable}`);
    }
  }

  // Check final status
  const { data } = await supabase
    .from('sd_scope_deliverables')
    .select('deliverable_name, completion_status')
    .eq('sd_id', 'SD-VWC-PRESETS-001')
    .order('deliverable_name');

  console.log('\n📊 Final Status:');
  data.forEach(d => {
    const icon = d.completion_status === 'completed' ? '✅' : '⏳';
    console.log(`  ${icon} ${d.deliverable_name}`);
  });

  const completedCount = data.filter(d => d.completion_status === 'completed').length;
  console.log(`\n  Total: ${completedCount}/${data.length} completed (${Math.round(completedCount/data.length*100)}%)`);
}

updateDeliverables().catch(console.error);
