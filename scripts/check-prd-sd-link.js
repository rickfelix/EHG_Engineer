#!/usr/bin/env node
/**
 * Check PRD-SD linkage for debugging handoff issues
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MzI3MjA1OSwiZXhwIjoyMDU4ODQ4MDU5fQ.l-z_5YNe4cKk1S5NZqLPssGXGP_jz9FMlIKFXIlwM0c'
);

const sdId = process.argv[2] || 'SD-VISION-TRANSITION-001D5';

async function checkPRDSDLink() {
  console.log(`\n🔍 Checking PRD-SD linkage for: ${sdId}\n`);

  // Check SD
  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, uuid_id, sd_id, title, status, current_phase')
    .eq('sd_id', sdId)
    .single();

  if (sdErr) {
    console.error('SD Error:', sdErr.message);
    return;
  }

  console.log('=== Strategic Directive ===');
  console.log('ID (numeric):', sd.id);
  console.log('UUID_ID:', sd.uuid_id);
  console.log('SD_ID:', sd.sd_id);
  console.log('Title:', sd.title);
  console.log('Status:', sd.status);
  console.log('Current Phase:', sd.current_phase);

  // Check PRD by sd_uuid
  const { data: prdByUuid, error: prdUuidErr } = await supabase
    .from('product_requirements_v2')
    .select('id, sd_uuid, sd_id, title, status, phase')
    .eq('sd_uuid', sd.uuid_id);

  console.log('\n=== PRDs by sd_uuid match ===');
  if (prdByUuid && prdByUuid.length > 0) {
    prdByUuid.forEach(p => {
      console.log(`- PRD ID: ${p.id}`);
      console.log(`  sd_uuid: ${p.sd_uuid}`);
      console.log(`  sd_id: ${p.sd_id}`);
      console.log(`  title: ${p.title}`);
      console.log(`  status: ${p.status}`);
    });
  } else {
    console.log('❌ No PRDs found with sd_uuid =', sd.uuid_id);
  }

  // Check PRD by sd_id
  const { data: prdBySdId, error: prdSdIdErr } = await supabase
    .from('product_requirements_v2')
    .select('id, sd_uuid, sd_id, title, status, phase')
    .eq('sd_id', sdId);

  console.log('\n=== PRDs by sd_id match ===');
  if (prdBySdId && prdBySdId.length > 0) {
    prdBySdId.forEach(p => {
      console.log(`- PRD ID: ${p.id}`);
      console.log(`  sd_uuid: ${p.sd_uuid}`);
      console.log(`  sd_id: ${p.sd_id}`);
      console.log(`  title: ${p.title}`);
      console.log(`  status: ${p.status}`);
    });
  } else {
    console.log('❌ No PRDs found with sd_id =', sdId);
  }

  // Check all PRDs with VISION in title
  const { data: visionPrds } = await supabase
    .from('product_requirements_v2')
    .select('id, sd_uuid, sd_id, title, status')
    .ilike('title', '%D5%')
    .limit(5);

  console.log('\n=== PRDs with D5 in title ===');
  if (visionPrds && visionPrds.length > 0) {
    visionPrds.forEach(p => {
      console.log(`- PRD ID: ${p.id}`);
      console.log(`  sd_uuid: ${p.sd_uuid}`);
      console.log(`  sd_id: ${p.sd_id}`);
      console.log(`  title: ${p.title}`);
      console.log(`  status: ${p.status}`);
    });
  } else {
    console.log('No PRDs with D5 in title');
  }

  // Summary
  console.log('\n=== DIAGNOSIS ===');
  const hasPrdByUuid = prdByUuid && prdByUuid.length > 0;
  const hasPrdBySdId = prdBySdId && prdBySdId.length > 0;

  if (!hasPrdByUuid && !hasPrdBySdId) {
    console.log('❌ PROBLEM: No PRD is linked to this SD');
    console.log('   FIX: Run the PRD creation script or update sd_uuid on existing PRD');
  } else if (!hasPrdByUuid && hasPrdBySdId) {
    console.log('⚠️ PROBLEM: PRD exists by sd_id but sd_uuid is missing/mismatched');
    console.log('   FIX: Update PRD sd_uuid to:', sd.uuid_id);
  } else {
    console.log('✅ PRD is properly linked to SD');
  }
}

checkPRDSDLink().catch(console.error);
