#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

(async () => {
  console.log('=== Baseline Check ===\n');

  // Check for active baseline
  const { data: baseline, error } = await supabase
    .from('sd_execution_baselines')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.log('❌ Error:', error.message);
    return;
  }

  if (!baseline || baseline.length === 0) {
    console.log('❌ NO ACTIVE BASELINE FOUND\n');
    console.log('sd:next is falling back to direct SD query from strategic_directives_v2');
    console.log('\nFallback query filters:');
    console.log('  - status IN (draft, active, in_progress)');
    console.log('  - priority IN (critical, high)');
    console.log('  - sequence_rank IS NOT NULL');
    console.log('  - is_active = true\n');

    // Check fallback query
    const { data: sds, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('legacy_id, title, priority, status, sequence_rank, metadata')
      .eq('is_active', true)
      .in('status', ['draft', 'active', 'in_progress'])
      .in('priority', ['critical', 'high'])
      .not('sequence_rank', 'is', null)
      .order('sequence_rank')
      .limit(15);

    if (sdError) {
      console.log('Error querying SDs:', sdError.message);
    } else {
      console.log(`Found ${sds.length} SDs matching fallback query:\n`);

      // Check for HARDENING-V2 SDs
      const hardeningV2 = sds.filter(sd => sd.legacy_id && sd.legacy_id.includes('HARDENING-V2'));
      console.log(`  - SD-HARDENING-V2-*: ${hardeningV2.length} found`);

      if (hardeningV2.length > 0) {
        console.log('\n✅ SD-HARDENING-V2 directives ARE in fallback query:');
        hardeningV2.forEach(sd => {
          const track = sd.metadata?.execution_track || 'UNASSIGNED';
          console.log(`   ${sd.legacy_id} (Track: ${track}, Rank: ${sd.sequence_rank})`);
        });
      }

      // Group by track
      const byTrack = {};
      sds.forEach(sd => {
        const track = sd.metadata?.execution_track || 'UNASSIGNED';
        if (!byTrack[track]) byTrack[track] = [];
        byTrack[track].push(sd.legacy_id);
      });

      console.log('\n\nTrack Distribution:');
      Object.entries(byTrack).forEach(([track, sdList]) => {
        console.log(`  ${track}: ${sdList.length} SDs`);
        if (sdList.length <= 5) {
          sdList.forEach(id => console.log(`    - ${id}`));
        }
      });
    }

    console.log('\n💡 To create baseline: npm run sd:baseline\n');
  } else {
    console.log('✅ Active baseline found:', baseline[0].id);
    console.log('   Created:', baseline[0].created_at);
    console.log('   Total items:', baseline[0].total_items || 'Unknown');

    // Check baseline items
    const { data: items } = await supabase
      .from('sd_baseline_items')
      .select('sd_id, track, sequence_rank')
      .eq('baseline_id', baseline[0].id)
      .order('sequence_rank');

    if (items) {
      console.log(`   Baseline items: ${items.length}\n`);

      const hardeningV2Items = items.filter(item => item.sd_id.includes('HARDENING-V2'));
      console.log(`SD-HARDENING-V2 in baseline: ${hardeningV2Items.length}\n`);

      if (hardeningV2Items.length > 0) {
        console.log('✅ SD-HARDENING-V2 directives IN baseline:');
        hardeningV2Items.forEach(item => {
          console.log(`   ${item.sd_id} (Track: ${item.track}, Rank: ${item.sequence_rank})`);
        });
      } else {
        console.log('❌ SD-HARDENING-V2 directives NOT in baseline');
        console.log('   Baseline may have been created before these SDs were added');
        console.log('   Run: npm run sd:baseline to refresh\n');
      }
    }
  }
})();
