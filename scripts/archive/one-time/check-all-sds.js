#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkAllSDs() {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, priority, status')
    .order('priority', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Total SDs in database:', data.length);
  console.log('');

  const critical = data.filter(sd => sd.priority === 'critical');
  const high = data.filter(sd => sd.priority === 'high');
  const medium = data.filter(sd => sd.priority === 'medium');
  const low = data.filter(sd => sd.priority === 'low');

  console.log('CRITICAL (' + critical.length + '):');
  critical.forEach(sd => console.log('  -', sd.id, '|', sd.title.substring(0, 60)));
  console.log('');

  console.log('HIGH (' + high.length + '):');
  high.forEach(sd => console.log('  -', sd.id, '|', sd.title.substring(0, 60)));
  console.log('');

  console.log('MEDIUM (' + medium.length + '):');
  medium.forEach(sd => console.log('  -', sd.id, '|', sd.title.substring(0, 60)));
  console.log('');

  console.log('LOW (' + low.length + '):');
  low.forEach(sd => console.log('  -', sd.id, '|', sd.title.substring(0, 60)));
  console.log('');

  console.log('Summary:');
  console.log('  CRITICAL:', critical.length);
  console.log('  HIGH:', high.length);
  console.log('  MEDIUM:', medium.length);
  console.log('  LOW:', low.length);
  console.log('  TOTAL:', data.length);

  // Check for our 25 specific SDs
  const our25 = [
    'SD-QUALITY-001', 'SD-RELIABILITY-001', 'SD-DATA-001',
    'SD-UX-001', 'SD-EXPORT-001', 'SD-ACCESSIBILITY-001', 'SD-REALTIME-001',
    'SD-RECONNECT-001', 'SD-RECONNECT-002', 'SD-RECONNECT-003', 'SD-RECONNECT-004',
    'SD-RECONNECT-005', 'SD-RECONNECT-006', 'SD-RECONNECT-007', 'SD-RECONNECT-008',
    'SD-RECONNECT-009', 'SD-RECONNECT-010', 'SD-RECONNECT-011', 'SD-RECONNECT-012',
    'SD-RECONNECT-013', 'SD-RECONNECT-014', 'SD-RECONNECT-015',
    'SD-BACKEND-001', 'SD-BACKEND-002', 'SD-BACKEND-003'
  ];

  const found = data.filter(sd => our25.includes(sd.id));
  const missing = our25.filter(id => !data.find(sd => sd.id === id));

  console.log('');
  console.log('Our 25 SDs Check:');
  console.log('  Found:', found.length);
  console.log('  Missing:', missing.length);
  if (missing.length > 0) {
    console.log('  Missing IDs:', missing.join(', '));
  }

  // Check what's showing as CRITICAL or HIGH from our 25
  const our25CriticalOrHigh = found.filter(sd => sd.priority === 'critical' || sd.priority === 'high');
  console.log('');
  console.log('Our 25 SDs that are CRITICAL or HIGH:', our25CriticalOrHigh.length);

  const our25Other = found.filter(sd => sd.priority !== 'critical' && sd.priority !== 'high');
  if (our25Other.length > 0) {
    console.log('Our 25 SDs that are NOT CRITICAL/HIGH:', our25Other.length);
    our25Other.forEach(sd => console.log('  -', sd.id, '| Priority:', sd.priority, '|', sd.title.substring(0, 50)));
  }
}

checkAllSDs().catch(console.error);
