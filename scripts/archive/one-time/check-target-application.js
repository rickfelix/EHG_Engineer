#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const our25 = [
  'SD-QUALITY-001', 'SD-RELIABILITY-001', 'SD-DATA-001',
  'SD-UX-001', 'SD-EXPORT-001', 'SD-ACCESSIBILITY-001', 'SD-REALTIME-001',
  'SD-RECONNECT-001', 'SD-RECONNECT-002', 'SD-RECONNECT-003', 'SD-RECONNECT-004',
  'SD-RECONNECT-005', 'SD-RECONNECT-006', 'SD-RECONNECT-007', 'SD-RECONNECT-008',
  'SD-RECONNECT-009', 'SD-RECONNECT-010', 'SD-RECONNECT-011', 'SD-RECONNECT-012',
  'SD-RECONNECT-013', 'SD-RECONNECT-014', 'SD-RECONNECT-015',
  'SD-BACKEND-001', 'SD-BACKEND-002', 'SD-BACKEND-003'
];

async function checkTargetApplication() {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, priority, target_application')
    .in('id', our25)
    .order('priority', { ascending: false })
    .order('id', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Target Application Values for Our 25 SDs:');
  console.log('='.repeat(70));

  const byApp = {};
  data.forEach(sd => {
    const app = sd.target_application || 'NULL';
    if (!byApp[app]) byApp[app] = [];
    byApp[app].push({ id: sd.id, priority: sd.priority });
  });

  Object.keys(byApp).sort().forEach(app => {
    console.log('');
    console.log(`target_application = "${app}" (${byApp[app].length} SDs):`);
    byApp[app].forEach(sd => {
      console.log(`  [${sd.priority.toUpperCase().padEnd(8)}] ${sd.id}`);
    });
  });

  console.log('');
  console.log('='.repeat(70));
  console.log('SUMMARY:');
  Object.keys(byApp).forEach(app => {
    const critical = byApp[app].filter(sd => sd.priority === 'critical').length;
    const high = byApp[app].filter(sd => sd.priority === 'high').length;
    console.log(`  ${app.padEnd(20)}: ${byApp[app].length} total (${critical} CRITICAL, ${high} HIGH)`);
  });

  console.log('');
  console.log('DASHBOARD FILTER ISSUE:');
  console.log('  If dashboard Application filter is set to "EHG" and some SDs have');
  console.log('  target_application = NULL, those SDs will be HIDDEN from the dashboard!');
  console.log('');
  console.log('  This could explain why you see 8 CRITICAL + 9 HIGH = 17 total');
  console.log('  instead of 8 CRITICAL + 17 HIGH = 25 total');
}

checkTargetApplication().catch(console.error);
