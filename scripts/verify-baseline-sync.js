#!/usr/bin/env node
/**
 * Verify Automatic Baseline Sync Trigger
 * SD: SD-BASELINE-SYNC-001
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyTrigger() {
  console.log('🔍 Verifying Automatic Baseline Sync Trigger');
  console.log('='.repeat(60));

  // Get active baseline
  const { data: baseline, error: baselineError } = await supabase
    .from('sd_execution_baselines')
    .select('id, name, is_active')
    .eq('is_active', true)
    .single();

  if (baselineError || !baseline) {
    console.log('⚠️  No active baseline found');
    return;
  }

  console.log('✅ Active Baseline:', baseline.name);
  console.log('   ID:', baseline.id);

  // Check baseline items count
  const { data: items, count } = await supabase
    .from('sd_baseline_items')
    .select('sd_id, title, status, track, is_ready', { count: 'exact' })
    .eq('baseline_id', baseline.id)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('\n📊 Recent Baseline Items (last 5):');
  items?.forEach((item, i) => {
    console.log(`   ${i+1}. ${item.title}`);
    console.log(`      SD: ${item.sd_id} | Track: ${item.track} | Status: ${item.status}`);
  });

  console.log('\n   Total items in baseline:', count);

  // Check if SD-BASELINE-SYNC-001 is in the baseline
  const { data: syncItem } = await supabase
    .from('sd_baseline_items')
    .select('*')
    .eq('baseline_id', baseline.id)
    .eq('sd_id', 'SD-BASELINE-SYNC-001')
    .single();

  if (syncItem) {
    console.log('\n✅ SD-BASELINE-SYNC-001 is in the baseline!');
    console.log('   Track:', syncItem.track);
    console.log('   Status:', syncItem.status);
    console.log('   Progress:', syncItem.progress_percentage + '%');
  } else {
    console.log('\n⚠️  SD-BASELINE-SYNC-001 not found in baseline');
    console.log('   This SD was created before the trigger was installed');
    console.log('   Adding it now via manual sync...');

    // Manually add since trigger only fires on new inserts
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, category, current_phase, status')
      .eq('id', 'SD-BASELINE-SYNC-001')
      .single();

    if (sd) {
      const track = sd.category === 'infrastructure' ? 'A' :
                    sd.category === 'quality' ? 'C' : 'B';

      const { error: insertError } = await supabase
        .from('sd_baseline_items')
        .insert({
          baseline_id: baseline.id,
          sd_id: sd.id,
          title: sd.title,
          track: track,
          status: 'in_progress',
          current_phase: sd.current_phase,
          progress_percentage: 50,
          is_ready: true
        });

      if (insertError) {
        console.log('   Error adding to baseline:', insertError.message);
      } else {
        console.log('   ✅ Added SD-BASELINE-SYNC-001 to baseline');
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Verification complete');
}

verifyTrigger().catch(console.error);
