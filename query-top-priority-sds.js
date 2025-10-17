#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🔍 Querying Top Priority Active SDs\n');

const { data: sds, error } = await supabase
  .from('strategic_directives_v2')
  .select('id, title, status, current_phase, progress, priority, created_at')
  .in('status', ['active', 'in_progress', 'pending_approval', 'draft'])
  .order('priority', { ascending: false })
  .order('created_at', { ascending: false })
  .limit(5);

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log(`Found ${sds.length} active/pending SDs:\n`);

sds.forEach((sd, i) => {
  console.log(`${i + 1}. ${sd.id}: ${sd.title}`);
  console.log(`   Status: ${sd.status}`);
  console.log(`   Phase: ${sd.current_phase}`);
  console.log(`   Progress: ${sd.progress}%`);
  console.log(`   Priority: ${sd.priority} (${getPriorityLabel(sd.priority)})`);
  console.log(`   Created: ${new Date(sd.created_at).toLocaleDateString()}`);
  console.log('');
});

function getPriorityLabel(priority) {
  if (typeof priority === 'string') return priority;
  if (priority >= 90) return 'CRITICAL';
  if (priority >= 70) return 'HIGH';
  if (priority >= 50) return 'MEDIUM';
  if (priority >= 30) return 'LOW';
  return 'UNKNOWN';
}

console.log('\n🎯 Recommended: Work on highest priority SD');

process.exit(0);
