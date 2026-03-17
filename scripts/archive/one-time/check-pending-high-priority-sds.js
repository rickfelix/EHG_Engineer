#!/usr/bin/env node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkPendingSDs() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('HIGH/CRITICAL PRIORITY SDs - PENDING COMPLETION');
  console.log('═══════════════════════════════════════════════════════════\n');

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, priority, created_at')
    .in('priority', ['critical', 'high'])
    .neq('status', 'completed')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  if (!data || data.length === 0) {
    console.log('✅ No pending high/critical priority SDs found!\n');
    console.log('All critical and high priority directives are completed.');
    return;
  }

  console.log(`Found ${data.length} pending high/critical priority SDs:\n`);

  const critical = data.filter(sd => sd.priority === 'critical');
  const high = data.filter(sd => sd.priority === 'high');

  if (critical.length > 0) {
    console.log(`🔴 CRITICAL PRIORITY (${critical.length}):`);
    critical.forEach(sd => {
      console.log(`  - ${sd.id}`);
      console.log(`    Title: ${sd.title}`);
      console.log(`    Status: ${sd.status}`);
      console.log(`    Created: ${new Date(sd.created_at).toLocaleDateString()}`);
      console.log('');
    });
  }

  if (high.length > 0) {
    console.log(`🟠 HIGH PRIORITY (${high.length}):`);
    high.forEach(sd => {
      console.log(`  - ${sd.id}`);
      console.log(`    Title: ${sd.title}`);
      console.log(`    Status: ${sd.status}`);
      console.log(`    Created: ${new Date(sd.created_at).toLocaleDateString()}`);
      console.log('');
    });
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('SUMMARY:');
  console.log(`  🔴 Critical: ${critical.length}`);
  console.log(`  🟠 High: ${high.length}`);
  console.log(`  📊 Total Pending: ${data.length}`);
  console.log('═══════════════════════════════════════════════════════════');
}

checkPendingSDs();
