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

async function checkStatusAndPriority() {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, priority, status, category')
    .in('id', our25)
    .order('priority', { ascending: false })
    .order('id', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Our 25 SDs - Current Status, Priority & Category');
  console.log('='.repeat(80));

  let criticalCount = 0;
  let highCount = 0;
  let otherPriority = 0;

  let draftCount = 0;
  let activeCount = 0;
  let otherStatus = 0;

  const categories = new Set();

  console.log('');
  console.log('CRITICAL PRIORITY:');
  data.filter(sd => sd.priority === 'critical').forEach(sd => {
    console.log('  [' + sd.status.toUpperCase().padEnd(10) + '] [' + (sd.category || 'none').padEnd(25) + '] ' + sd.id.padEnd(22) + ' | ' + sd.title.substring(0, 35));
    criticalCount++;
    categories.add(sd.category || 'none');
    if (sd.status === 'draft') draftCount++;
    else if (sd.status === 'active') activeCount++;
    else otherStatus++;
  });

  console.log('');
  console.log('HIGH PRIORITY:');
  data.filter(sd => sd.priority === 'high').forEach(sd => {
    console.log('  [' + sd.status.toUpperCase().padEnd(10) + '] [' + (sd.category || 'none').padEnd(25) + '] ' + sd.id.padEnd(22) + ' | ' + sd.title.substring(0, 35));
    highCount++;
    categories.add(sd.category || 'none');
    if (sd.status === 'draft') draftCount++;
    else if (sd.status === 'active') activeCount++;
    else otherStatus++;
  });

  console.log('');
  const otherPriorityData = data.filter(sd => sd.priority !== 'critical' && sd.priority !== 'high');
  if (otherPriorityData.length > 0) {
    console.log('OTHER PRIORITY (SHOULD BE NONE):');
    otherPriorityData.forEach(sd => {
      console.log('  [' + sd.status.toUpperCase().padEnd(10) + '] [' + sd.priority.toUpperCase().padEnd(8) + '] ' + sd.id.padEnd(22) + ' | ' + sd.title.substring(0, 40));
      otherPriority++;
      categories.add(sd.category || 'none');
    });
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('SUMMARY:');
  console.log('  CRITICAL Priority: ' + criticalCount);
  console.log('  HIGH Priority:     ' + highCount);
  console.log('  Other Priority:    ' + otherPriority);
  console.log('  TOTAL:             ' + data.length);
  console.log('');
  console.log('STATUS BREAKDOWN:');
  console.log('  DRAFT:   ' + draftCount);
  console.log('  ACTIVE:  ' + activeCount);
  console.log('  OTHER:   ' + otherStatus);
  console.log('  TOTAL:   ' + data.length);
  console.log('');
  console.log('CATEGORIES USED:');
  Array.from(categories).sort().forEach(cat => {
    const count = data.filter(sd => (sd.category || 'none') === cat).length;
    console.log('  ' + (cat || 'none').padEnd(30) + ': ' + count + ' SDs');
  });
  console.log('');

  if (criticalCount === 8 && highCount === 17) {
    console.log('✅ CORRECT: 8 CRITICAL + 17 HIGH = 25 Total');
  } else {
    console.log('⚠️  MISMATCH: Expected 8 CRITICAL + 17 HIGH = 25');
    console.log('   Actual: ' + criticalCount + ' CRITICAL + ' + highCount + ' HIGH + ' + otherPriority + ' Other = ' + data.length + ' Total');
  }

  if (draftCount + activeCount === data.length) {
    console.log('✅ STATUS: All SDs are either DRAFT or ACTIVE');
  } else {
    console.log('⚠️  STATUS: Some SDs have other statuses (' + otherStatus + ')');
  }

  console.log('');
  console.log('Dashboard should show: ' + (draftCount + activeCount) + ' SDs when filtering for draft,active + critical,high');
}

checkStatusAndPriority().catch(console.error);
