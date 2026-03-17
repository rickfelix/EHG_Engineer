#!/usr/bin/env node
// Post-import database checks

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function postImportChecks() {
  console.log('\n' + '='.repeat(60));
  console.log('POST-IMPORT CHECKS');
  console.log('='.repeat(60) + '\n');
  
  // Check A: SD count & summed totals
  const { error: countError } = await supabase
    .from('strategic_directives_backlog')
    .select('sd_id, total_items');
    
  if (countError) {
    console.error('Error fetching counts:', countError);
    return;
  }
    
  const sdCount = countData ? countData.length : 0;
  const summedTotal = countData ? countData.reduce((sum, sd) => sum + (sd.total_items || 0), 0) : 0;
  
  console.log('A) SD count & summed totals:');
  console.log(`   sd_count: ${sdCount}`);
  console.log(`   summed_total: ${summedTotal}`);
  console.log('');
  
  // Check B: Any H+M+L+F != total_items
  const { error: mismatchError } = await supabase
    .from('strategic_directives_backlog')
    .select('sd_id, sequence_rank, h_count, m_count, l_count, future_count, total_items')
    .order('sequence_rank')
    .limit(10);
  
  if (mismatchError) {
    console.error('Error fetching mismatches:', mismatchError);
    return;
  }
  
  console.log('B) Count mismatches (H+M+L+F != total_items):');
  if (mismatchData) {
    const mismatches = mismatchData.filter(sd => {
      const counted = (sd.h_count || 0) + (sd.m_count || 0) + (sd.l_count || 0) + (sd.future_count || 0);
      return counted !== sd.total_items;
    });
    
    if (mismatches.length === 0) {
      console.log('   ✅ No mismatches found');
    } else {
      mismatches.forEach(sd => {
        const counted = (sd.h_count || 0) + (sd.m_count || 0) + (sd.l_count || 0) + (sd.future_count || 0);
        console.log(`   ${sd.sd_id} | seq:${sd.sequence_rank} | counted:${counted} | total:${sd.total_items}`);
      });
    }
  }
  console.log('');
  
  // Check C: Duplicate backlog_id across multiple SDs
  const { error: mapError } = await supabase
    .from('sd_backlog_map')
    .select('backlog_id, sd_id');
  
  if (mapError) {
    console.error('Error fetching map data:', mapError);
    return;
  }
  
  if (mapData) {
    const backlogUsage = {};
    mapData.forEach(item => {
      if (!backlogUsage[item.backlog_id]) {
        backlogUsage[item.backlog_id] = new Set();
      }
      backlogUsage[item.backlog_id].add(item.sd_id);
    });
    
    const duplicates = Object.entries(backlogUsage)
      .filter(([_bid, sds]) => sds.size > 1)
      .map(([bid, sds]) => ({
        backlog_id: bid,
        sd_count: sds.size,
        sd_list: Array.from(sds).slice(0, 3).join(', ')
      }))
      .sort((a, b) => b.sd_count - a.sd_count)
      .slice(0, 25);
    
    console.log('C) Duplicate backlog_id across multiple SDs (top 25):');
    if (duplicates.length === 0) {
      console.log('   ✅ No duplicate backlog IDs found');
    } else {
      console.log('   backlog_id | sd_dupes | sd_list');
      console.log('   ' + '-'.repeat(50));
      duplicates.forEach(d => {
        console.log(`   ${d.backlog_id.padEnd(10)} | ${String(d.sd_count).padStart(8)} | ${d.sd_list}`);
      });
    }
  }
  
  console.log('\n' + '='.repeat(60));
}

postImportChecks().catch(console.error);