#!/usr/bin/env node
/**
 * Query Current Sub-Agent Configurations
 *
 * Purpose: Retrieve current state of all 13 sub-agents before enhancement
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function querySubAgents() {
  console.log('📊 Querying Current Sub-Agent Configurations...\n');

  const { data: subAgents, error } = await supabase
    .from('leo_sub_agents')
    .select('*')
    .eq('active', true)
    .order('priority', { ascending: false });

  if (error) {
    console.error('❌ Error querying sub-agents:', error.message);
    process.exit(1);
  }

  console.log(`Found ${subAgents.length} active sub-agents\n`);

  // Save to file for rollback reference
  const backupPath = 'scripts/sub-agents-backup.json';
  writeFileSync(backupPath, JSON.stringify(subAgents, null, 2));

  console.log(`✅ Backup saved to: ${backupPath}\n`);
  console.log('📋 Current Sub-Agents:\n');

  subAgents.forEach((sa, i) => {
    console.log(`${i + 1}. ${sa.name} (${sa.code})`);
    console.log(`   Priority: ${sa.priority}`);
    console.log(`   Activation: ${sa.activation_type}`);
    console.log(`   Description: ${sa.description?.substring(0, 60)}...`);
    console.log(`   Capabilities: ${sa.capabilities?.length || 0} defined`);
    console.log(`   Script: ${sa.script_path || 'none'}`);
    console.log('');
  });

  return subAgents;
}

querySubAgents().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
