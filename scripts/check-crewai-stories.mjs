#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkStories() {
  const { data: stories, error } = await supabase
    .from('user_stories_v2')
    .select('id, story_key, title, status, checkpoint_id')
    .eq('sd_id', 'SD-CREWAI-ARCHITECTURE-001')
    .order('story_key');

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log(`\n📋 User Stories for SD-CREWAI-ARCHITECTURE-001 (${stories.length} total)\n`);
  console.log('Status breakdown:');
  const statusCounts = stories.reduce((acc, s) => {
    acc[s.status] = (acc[s.status] || 0) + 1;
    return acc;
  }, {});
  Object.entries(statusCounts).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });

  console.log('\n📋 Stories by checkpoint:\n');
  stories.forEach(s => {
    const statusIcon = s.status === 'completed' ? '✅' : 
                       s.status === 'in_progress' ? '🔄' : '⏸️';
    console.log(`${statusIcon} ${s.story_key} - ${s.title}`);
    console.log(`   Checkpoint: ${s.checkpoint_id || 'none'} | Status: ${s.status}`);
  });
}

checkStories();
