#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co',
  process.env.SUPABASE_ANON_KEY
);

async function checkSDStatus() {
  console.log('📍 CURRENT STATUS CHECK - SD-VIDEO-VARIANT-001');
  console.log('='.repeat(80));

  // Get SD status
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, current_phase, progress')
    .eq('id', 'SD-VIDEO-VARIANT-001')
    .single();

  if (sdError) {
    console.error('❌ Error fetching SD:', sdError.message);
    process.exit(1);
  }

  console.log('\n📊 Strategic Directive Status:');
  console.log(`  ID: ${sd.id}`);
  console.log(`  Title: ${sd.title}`);
  console.log(`  Status: ${sd.status}`);
  console.log(`  Current Phase: ${sd.current_phase}`);
  console.log(`  Progress: ${sd.progress}%`);

  // Get handoffs
  const { data: handoffs, error: handoffsError } = await supabase
    .from('sd_phase_handoffs')
    .select('from_phase, to_phase, created_at, status')
    .eq('sd_id', 'SD-VIDEO-VARIANT-001')
    .order('created_at', { ascending: false });

  if (!handoffsError && handoffs?.length > 0) {
    console.log('\n🔄 Handoffs Completed:');
    handoffs.forEach(h => {
      console.log(`  ✅ ${h.from_phase} → ${h.to_phase} (${new Date(h.created_at).toLocaleDateString()})`);
    });
  } else {
    console.log('\n🔄 Handoffs: None completed yet');
  }

  // Get user stories
  const { data: userStories, error: usError } = await supabase
    .from('user_stories')
    .select('story_key, title, status')
    .ilike('story_key', 'SD-VIDEO-VARIANT-001:%');

  if (!usError && userStories?.length > 0) {
    console.log(`\n📋 User Stories: ${userStories.length} total`);
    userStories.slice(0, 3).forEach(us => {
      console.log(`  - ${us.story_key}: ${us.title} (${us.status})`);
    });
    if (userStories.length > 3) {
      console.log(`  ... and ${userStories.length - 3} more`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Status check complete');
}

checkSDStatus();
