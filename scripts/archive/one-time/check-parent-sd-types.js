#!/usr/bin/env node
/**
 * Check if parent SDs are correctly typed as orchestrator
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkParentTypes() {
  // Find all SDs that have children (parent SDs)
  const { data: allSDs } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, sd_type, parent_sd_id, status')
    .order('id');

  // Group by parent
  const parents = {};

  allSDs.forEach(sd => {
    if (sd.parent_sd_id) {
      if (parents[sd.parent_sd_id] === undefined) {
        parents[sd.parent_sd_id] = { children: [], sd: null };
      }
      parents[sd.parent_sd_id].children.push(sd.id);
    }
  });

  // Find parent SD details
  allSDs.forEach(sd => {
    if (parents[sd.id] !== undefined) {
      parents[sd.id].sd = sd;
    }
  });

  console.log('Parent SDs with Children:');
  console.log('=========================\n');

  let mismatches = 0;

  Object.entries(parents).forEach(([parentId, info]) => {
    if (info.sd) {
      const typeOk = info.sd.sd_type === 'orchestrator';
      const icon = typeOk ? '✅' : '❌';
      console.log(`${icon} ${parentId}`);
      console.log(`   Type: ${info.sd.sd_type}${typeOk ? '' : ' (SHOULD BE orchestrator)'}`);
      console.log(`   Status: ${info.sd.status}`);
      console.log(`   Children: ${info.children.length} (${info.children.join(', ')})`);
      console.log('');
      if (!typeOk) mismatches++;
    } else {
      console.log(`⚠️  ${parentId} (parent referenced but not found)\n`);
    }
  });

  console.log('Summary:');
  console.log(`  Total parent SDs: ${Object.keys(parents).length}`);
  console.log(`  Correctly typed as orchestrator: ${Object.keys(parents).length - mismatches}`);
  console.log(`  Incorrectly typed: ${mismatches}`);

  // Check for trigger enforcement
  console.log('\n\nChecking for trigger enforcement...');
  const { data: triggers } = await supabase
    .from('pg_catalog.pg_trigger')
    .select('tgname')
    .like('tgname', '%orchestrator%');

  if (triggers && triggers.length > 0) {
    console.log('  Found triggers:', triggers.map(t => t.tgname).join(', '));
  } else {
    console.log('  ⚠️  No trigger found that enforces orchestrator type for parent SDs');
    console.log('  💡 RECOMMENDATION: Add a database trigger to auto-set sd_type=orchestrator when parent_sd_id references this SD');
  }
}

checkParentTypes().catch(console.error);
