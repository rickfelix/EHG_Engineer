#!/usr/bin/env node
/**
 * Verify SD state in database for session validation
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifySessionState(sdKey) {
  console.log('=== SESSION STATE VERIFICATION ===');
  console.log('SD Key:', sdKey);
  console.log('Timestamp:', new Date().toISOString());
  console.log('');

  // 1. Verify SD exists
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', sdKey)
    .single();

  if (sdError || !sd) {
    console.log('⚠️  SD does NOT exist in database!');
    console.log('Error:', sdError?.message);
    return;
  }

  console.log('✅ SD EXISTS:');
  console.log('  - ID:', sd.id);
  console.log('  - Title:', sd.title);
  console.log('  - Status:', sd.status);
  console.log('  - Progress:', sd.progress_percentage + '%');
  console.log('  - Current Phase:', sd.current_phase || 'Not set');
  console.log('  - SD Type:', sd.sd_type);
  console.log('  - Priority:', sd.priority);
  console.log('  - Parent SD ID:', sd.parent_sd_id || 'None');
  console.log('');

  // 2. Check PRD
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('id, status, version, created_at')
    .eq('sd_id', sd.id)
    .maybeSingle();

  if (prd) {
    console.log('✅ PRD EXISTS:');
    console.log('  - ID:', prd.id);
    console.log('  - Status:', prd.status);
    console.log('  - Version:', prd.version);
  } else {
    console.log('⚠️  No PRD exists yet (expected for LEAD phase)');
  }
  console.log('');

  // 3. Check handoffs
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('handoff_type, status, created_at')
    .eq('sd_id', sd.id);

  if (handoffs && handoffs.length > 0) {
    console.log('✅ HANDOFFS FOUND:', handoffs.length);
    handoffs.forEach(h => {
      console.log('  -', h.handoff_type, ':', h.status);
    });
  } else {
    console.log('⚠️  No handoffs exist yet (expected for LEAD phase)');
  }
  console.log('');

  // 4. Check user stories
  const { data: stories } = await supabase
    .from('user_stories')
    .select('id, story_id, status')
    .eq('sd_id', sd.id);

  if (stories && stories.length > 0) {
    console.log('✅ USER STORIES:', stories.length);
  } else {
    console.log('⚠️  No user stories yet (expected for LEAD phase)');
  }
  console.log('');

  // 5. Check parent SD state
  if (sd.parent_sd_id) {
    const { data: parent } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, status, current_phase')
      .eq('id', sd.parent_sd_id)
      .single();

    if (parent) {
      console.log('✅ PARENT SD:');
      console.log('  - Key:', parent.sd_key);
      console.log('  - Title:', parent.title);
      console.log('  - Status:', parent.status);
      console.log('  - Phase:', parent.current_phase);
    }
  }
  console.log('');

  // Summary
  console.log('=== VERIFICATION SUMMARY ===');
  console.log('SD exists: YES');
  console.log('PRD exists:', prd ? 'YES' : 'NO');
  console.log('Handoffs count:', handoffs?.length || 0);
  console.log('Stories count:', stories?.length || 0);
  console.log('Ready for:', !prd ? 'LEAD-TO-PLAN handoff' : 'PLAN or EXEC phase');
}

const sdKey = process.argv[2] || 'SD-VISION-V2-011';
verifySessionState(sdKey).catch(console.error);
