#!/usr/bin/env node
/**
 * Query Next Priority SD for Work
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function queryNextPriority() {
  console.log('🔍 QUERYING NEXT PRIORITY WORK\n');
  console.log('═'.repeat(70));

  // Query high-priority active SDs
  const { data: sds, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, priority, status, current_phase, progress_percentage, category')
    .in('status', ['active', 'in_progress'])
    .in('priority', ['critical', 'high'])
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(10);

  if (error) {
    console.log('❌ Error:', error.message);
    return;
  }

  if (!sds || sds.length === 0) {
    console.log('\n⚠️  No high/critical priority active SDs found');
    console.log('\nChecking medium priority...');

    const { data: mediumSds } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, priority, status, current_phase, progress_percentage, category')
      .in('status', ['active', 'in_progress'])
      .eq('priority', 'medium')
      .order('created_at', { ascending: true })
      .limit(5);

    if (mediumSds && mediumSds.length > 0) {
      console.log(`\n✅ Found ${mediumSds.length} medium priority SDs:\n`);
      mediumSds.forEach((sd, i) => {
        console.log(`${i + 1}. ${sd.id}: ${sd.title}`);
        console.log(`   Priority: ${sd.priority} | Status: ${sd.status} | Phase: ${sd.current_phase}`);
        console.log(`   Progress: ${sd.progress_percentage}% | Category: ${sd.category}\n`);
      });
    } else {
      console.log('\n✅ No active SDs found - all work complete!');
    }
    return;
  }

  console.log(`\n✅ Found ${sds.length} high/critical priority active SDs:\n`);

  sds.forEach((sd, i) => {
    const priority = sd.priority === 'critical' ? '🔴 CRITICAL' : '🟠 HIGH';
    console.log(`${i + 1}. ${priority} - ${sd.id}: ${sd.title}`);
    console.log(`   Status: ${sd.status} | Phase: ${sd.current_phase} | Progress: ${sd.progress_percentage}%`);
    console.log(`   Category: ${sd.category}\n`);
  });

  // Check for pending handoffs
  console.log('═'.repeat(70));
  console.log('\n📋 Checking for pending handoffs...\n');

  for (const sd of sds.slice(0, 3)) {
    const { data: handoffs } = await supabase
      .from('sd_phase_handoffs')
      .select('from_phase, to_phase, status')
      .eq('sd_id', sd.id)
      .eq('status', 'pending_acceptance')
      .limit(1);

    if (handoffs && handoffs.length > 0) {
      const h = handoffs[0];
      console.log(`   ${sd.id}: ${h.from_phase}→${h.to_phase} handoff pending`);
    }
  }

  console.log('\n' + '═'.repeat(70));
  console.log('\n📊 RECOMMENDATION:\n');

  if (sds.length > 0) {
    const top = sds[0];
    console.log(`Next SD to work on: ${top.id}`);
    console.log(`Title: ${top.title}`);
    console.log(`Priority: ${top.priority}`);
    console.log(`Current Phase: ${top.current_phase}`);
    console.log(`Progress: ${top.progress_percentage}%`);
  }
}

queryNextPriority().catch(console.error);
