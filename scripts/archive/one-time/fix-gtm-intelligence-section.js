#!/usr/bin/env node
/**
 * Fix GTM Intelligence Section
 * SD-GTM-INTEL-DISCOVERY-001
 *
 * Updates /gtm-intelligence route section from 'strategy-execution' to 'analytics-insights'
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function fixGTMIntelligenceSection() {
  console.log('\n🔧 Fixing GTM Intelligence Section');
  console.log('='.repeat(70));

  // First, verify current state
  console.log('\n📊 Current state:');
  const { data: before, error: beforeError } = await supabase
    .from('nav_routes')
    .select('path, title, section, is_enabled')
    .in('path', ['/gtm-intelligence', '/gtm-timing'])
    .order('path');

  if (beforeError) {
    console.error('❌ Error fetching current routes:', beforeError.message);
    process.exit(1);
  }

  console.table(before);

  // Update GTM Intelligence section
  console.log('\n🔄 Updating /gtm-intelligence section...');
  const { data: updated, error: updateError } = await supabase
    .from('nav_routes')
    .update({
      section: 'analytics-insights',
      updated_at: new Date().toISOString()
    })
    .eq('path', '/gtm-intelligence')
    .select();

  if (updateError) {
    console.error('\n❌ Update failed:', updateError.message);
    console.error('   Code:', updateError.code);
    console.error('   Details:', updateError.details);

    if (updateError.code === '42501') {
      console.log('\n💡 RLS Policy Issue Detected');
      console.log('   This requires admin privileges or service role key.');
      console.log('   Please execute this SQL in Supabase SQL Editor:');
      console.log('\n```sql');
      console.log('UPDATE nav_routes');
      console.log("SET section = 'analytics-insights',");
      console.log('    updated_at = NOW()');
      console.log("WHERE path = '/gtm-intelligence';");
      console.log('```\n');
    }
    process.exit(1);
  }

  console.log('✅ Update successful!');
  console.log('   Updated rows:', updated?.length || 0);

  // Verify final state
  console.log('\n📊 Final state:');
  const { data: after, error: afterError } = await supabase
    .from('nav_routes')
    .select('path, title, section, is_enabled')
    .in('path', ['/gtm-intelligence', '/gtm-timing'])
    .order('path');

  if (afterError) {
    console.error('❌ Error fetching final routes:', afterError.message);
    process.exit(1);
  }

  console.table(after);

  console.log('\n✅ Section Fix Complete!');
  console.log('   /gtm-intelligence → Analytics & Insights section');
  console.log('   /gtm-timing → Go-to-Market section');
  console.log('\n💡 Next Steps:');
  console.log('   1. Refresh your browser (Ctrl+Shift+R)');
  console.log('   2. Look for "GTM Intelligence" in Analytics & Insights section');
  console.log('   3. Look for "GTM Timing" in Go-to-Market section');
  console.log('');
}

fixGTMIntelligenceSection().catch(error => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
