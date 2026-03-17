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

async function findMissingHighSDs() {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, priority, status, category, target_application, created_at')
    .in('id', our25)
    .eq('priority', 'high')
    .order('id', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('All 17 HIGH Priority SDs from our 25:');
  console.log('='.repeat(100));
  console.log('');

  console.log('You said you see 9 on dashboard. Here are ALL 17 that should appear:');
  console.log('');

  data.forEach((sd, index) => {
    const num = (index + 1).toString().padStart(2, '0');
    const target = sd.target_application || 'NONE';
    console.log(`${num}. [${sd.status.toUpperCase()}] [${target}] ${sd.id.padEnd(22)} | ${sd.title.substring(0, 55)}`);
  });

  console.log('');
  console.log('='.repeat(100));
  console.log('');
  console.log('DEBUGGING INFO:');
  console.log(`  Total HIGH priority SDs in DB: ${data.length}`);
  console.log('  You see on dashboard: 9');
  console.log(`  Missing from dashboard: ${data.length - 9}`);
  console.log('');

  // Check target_application distribution
  const byApp = {};
  data.forEach(sd => {
    const app = sd.target_application || 'NONE';
    if (!byApp[app]) byApp[app] = [];
    byApp[app].push(sd.id);
  });

  console.log('TARGET APPLICATION BREAKDOWN:');
  Object.keys(byApp).forEach(app => {
    console.log(`  ${app.padEnd(20)}: ${byApp[app].length} SDs`);
    byApp[app].forEach(id => console.log(`    - ${id}`));
  });

  console.log('');
  console.log('HYPOTHESIS:');
  console.log('  If dashboard "Application Filter" is set to filter out some,');
  console.log('  that could explain why you only see 9 instead of 17.');
  console.log('');
  console.log('  Check dashboard filters:');
  console.log('    - Status filter should be: draft,active');
  console.log('    - Priority filter should be: critical,high');
  console.log('    - Application filter should be: all (or include all apps above)');
  console.log('    - Search box should be: empty');
  console.log('    - Category filter should be: all');
}

findMissingHighSDs().catch(console.error);
