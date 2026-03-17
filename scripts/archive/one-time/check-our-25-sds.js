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

async function checkOur25() {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, priority, status, category, created_at')
    .in('id', our25)
    .order('priority', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Our 25 SDs - Detailed Breakdown:');
  console.log('='.repeat(70));
  console.log('');

  // Group by status
  const byStatus = {};
  data.forEach(sd => {
    if (!byStatus[sd.status]) byStatus[sd.status] = [];
    byStatus[sd.status].push(sd);
  });

  Object.keys(byStatus).forEach(status => {
    console.log(status.toUpperCase() + ' (' + byStatus[status].length + '):');
    byStatus[status].forEach(sd => {
      console.log('  [' + sd.priority.toUpperCase().padEnd(8) + '] ' + sd.id.padEnd(20) + ' | ' + sd.title.substring(0, 50));
    });
    console.log('');
  });

  console.log('='.repeat(70));
  console.log('Summary:');
  Object.keys(byStatus).forEach(status => {
    console.log('  ' + status + ':', byStatus[status].length);
  });
  console.log('  TOTAL:', data.length);
  console.log('');

  // Priority breakdown
  const critical = data.filter(sd => sd.priority === 'critical').length;
  const high = data.filter(sd => sd.priority === 'high').length;

  console.log('Priority Breakdown:');
  console.log('  CRITICAL:', critical);
  console.log('  HIGH:', high);
  console.log('  TOTAL:', data.length);
  console.log('');

  // Check if dashboard might be filtering
  console.log('Dashboard Filter Hypothesis:');
  console.log('  If dashboard shows 17, it might be filtering by:');
  console.log('    - Status = "draft" or specific status');
  console.log('    - Created after certain date');
  console.log('    - Specific category');
  console.log('');

  const draft = byStatus['draft'] ? byStatus['draft'].length : 0;
  console.log('  Draft status count:', draft);
  console.log('  If showing 17 and draft=' + draft + ', missing ' + (data.length - 17) + ' SDs');
}

checkOur25().catch(console.error);
