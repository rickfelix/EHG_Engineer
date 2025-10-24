#!/usr/bin/env node
/**
 * Query SD-VWC-PHASE1-001 status from database
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function querySD() {
  console.log('🔍 Querying SD-VWC-PHASE1-001 from database...\n');

  // Query SD
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, current_phase, progress_percentage, created_at')
    .eq('id', 'SD-VWC-PHASE1-001')
    .single();

  console.log('📋 SD STATUS:');
  if (sdError) {
    console.error('❌ Error:', sdError.message);
  } else if (sd) {
    console.log(`   ID: ${sd.id}`);
    console.log(`   Title: ${sd.title}`);
    console.log(`   Status: ${sd.status}`);
    console.log(`   Phase: ${sd.current_phase}`);
    console.log(`   Progress: ${sd.progress_percentage}%`);
    console.log(`   Created: ${sd.created_at}`);
  } else {
    console.log('   ❌ SD not found');
  }

  // Query PRD
  const { data: prds, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('id, title, status, sd_id, created_at')
    .eq('sd_id', 'SD-VWC-PHASE1-001');

  console.log('\n📄 PRD STATUS:');
  if (prdError) {
    console.error('❌ Error:', prdError.message);
  } else if (prds && prds.length > 0) {
    prds.forEach((prd, i) => {
      console.log(`   [${i+1}] ${prd.id}`);
      console.log(`       Title: ${prd.title}`);
      console.log(`       Status: ${prd.status}`);
      console.log(`       Created: ${prd.created_at}`);
    });
  } else {
    console.log('   ⚠️  No PRD found for this SD');
  }

  // Query Handoffs
  const { data: handoffs, error: handoffError } = await supabase
    .from('sd_phase_handoffs')
    .select('id, from_phase, to_phase, created_at, status')
    .eq('sd_id', 'SD-VWC-PHASE1-001')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('\n🔄 HANDOFFS (last 5):');
  if (handoffError) {
    console.error('❌ Error:', handoffError.message);
  } else if (handoffs && handoffs.length > 0) {
    handoffs.forEach((h, i) => {
      console.log(`   [${i+1}] ${h.from_phase} → ${h.to_phase}`);
      console.log(`       Status: ${h.status}`);
      console.log(`       Created: ${h.created_at}`);
    });
  } else {
    console.log('   ⚠️  No handoffs found');
  }

  // Query User Stories
  const { data: stories, error: storiesError } = await supabase
    .from('user_stories')
    .select('id, title, status, story_points')
    .eq('prd_id', prds?.[0]?.id)
    .order('created_at', { ascending: true });

  console.log('\n📝 USER STORIES:');
  if (storiesError) {
    console.error('❌ Error:', storiesError.message);
  } else if (stories && stories.length > 0) {
    console.log(`   Total: ${stories.length} stories`);
    const completed = stories.filter(s => s.status === 'completed').length;
    console.log(`   Completed: ${completed}/${stories.length}`);
    stories.forEach((s, i) => {
      const statusIcon = s.status === 'completed' ? '✅' : s.status === 'in_progress' ? '🔄' : '⏳';
      console.log(`   ${statusIcon} ${s.title} (${s.story_points} pts)`);
    });
  } else {
    console.log('   ⚠️  No user stories found');
  }
}

querySD()
  .then(() => process.exit(0))
  .catch(e => {
    console.error('\n❌ Query failed:', e.message);
    process.exit(1);
  });
