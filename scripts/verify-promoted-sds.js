#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// These were the SDs we promoted from MEDIUM/LOW to HIGH
const promotedSDs = [
  // Originally MEDIUM priority
  { id: 'SD-RECONNECT-005', original: 'MEDIUM', title: 'Component Directory Consolidation' },
  { id: 'SD-RECONNECT-007', original: 'MEDIUM', title: 'Component Library Integration' },
  { id: 'SD-RECONNECT-008', original: 'MEDIUM', title: 'Service Layer Completeness' },
  { id: 'SD-RECONNECT-009', original: 'MEDIUM', title: 'Feature Documentation' },
  { id: 'SD-RECONNECT-015', original: 'MEDIUM', title: 'Global Voice & Translation' },
  { id: 'SD-BACKEND-003', original: 'MEDIUM', title: 'Placeholder Feature Evaluation' },

  // Originally LOW priority
  { id: 'SD-RECONNECT-010', original: 'LOW', title: 'Automated Feature Testing' },
  { id: 'SD-RECONNECT-014', original: 'LOW', title: 'System Observability Suite' }
];

async function verifyPromotedSDs() {
  const sdIds = promotedSDs.map(sd => sd.id);

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, priority, status')
    .in('id', sdIds)
    .order('id', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Promoted SDs - Verification Report');
  console.log('='.repeat(95));
  console.log('');
  console.log('These 8 SDs were promoted from MEDIUM/LOW → HIGH:');
  console.log('');

  let allHigh = true;
  let notFoundCount = 0;

  promotedSDs.forEach(expected => {
    const sd = data.find(d => d.id === expected.id);
    if (!sd) {
      console.log(`❌ NOT FOUND: ${expected.id.padEnd(22)} (was ${expected.original})`);
      notFoundCount++;
      allHigh = false;
    } else if (sd.priority === 'high') {
      console.log(`✅ [${expected.original.padEnd(6)} → HIGH  ] ${sd.id.padEnd(22)} | ${sd.title.substring(0, 45)}`);
    } else {
      console.log(`❌ [${expected.original.padEnd(6)} → ${sd.priority.toUpperCase().padEnd(6)}] ${sd.id.padEnd(22)} | ${sd.title.substring(0, 45)} (FAILED)`);
      allHigh = false;
    }
  });

  console.log('');
  console.log('='.repeat(95));
  console.log('');
  console.log('VERIFICATION RESULT:');

  if (allHigh && notFoundCount === 0) {
    console.log('  ✅ SUCCESS: All 8 promoted SDs are now marked as HIGH priority');
  } else {
    console.log('  ❌ FAILURE: Some SDs were not promoted correctly');
    console.log(`     Found: ${data.length}/${promotedSDs.length}`);
    console.log(`     HIGH priority: ${data.filter(sd => sd.priority === 'high').length}`);
    console.log(`     Other priority: ${data.filter(sd => sd.priority !== 'high').length}`);
    console.log(`     Not found: ${notFoundCount}`);
  }

  console.log('');
  console.log('DETAILED BREAKDOWN:');
  console.log(`  Total SDs to verify: ${promotedSDs.length}`);
  console.log(`  Found in database: ${data.length}`);
  console.log(`  Confirmed as HIGH: ${data.filter(sd => sd.priority === 'high').length}`);
  console.log(`  Wrong priority: ${data.filter(sd => sd.priority !== 'high').length}`);
  console.log(`  Missing from DB: ${notFoundCount}`);
  console.log('');
  console.log('ORIGINAL PRIORITY BREAKDOWN:');
  console.log(`  From MEDIUM: ${promotedSDs.filter(sd => sd.original === 'MEDIUM').length} SDs`);
  console.log(`  From LOW: ${promotedSDs.filter(sd => sd.original === 'LOW').length} SDs`);
}

verifyPromotedSDs().catch(console.error);
