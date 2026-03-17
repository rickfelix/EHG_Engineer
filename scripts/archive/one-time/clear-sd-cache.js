#!/usr/bin/env node
/**
 * Clear cached sub-agent results for an SD
 * Usage: node scripts/clear-sd-cache.js SD-VISION-TRANSITION-001D3
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const sdId = process.argv[2];

if (!sdId) {
  console.error('Usage: node scripts/clear-sd-cache.js <SD-ID>');
  process.exit(1);
}

const supabaseUrl = 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY not found in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function clearCache() {
  console.log(`Clearing cached sub-agent results for ${sdId}...`);

  // Delete all cached results for this SD
  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .delete()
    .eq('sd_id', sdId)
    .select();

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log(`✅ Deleted ${data?.length || 0} cached result(s)`);

  if (data && data.length > 0) {
    console.log('   Cleared sub-agents:', [...new Set(data.map(r => r.sub_agent_code))].join(', '));
  }
}

clearCache();
