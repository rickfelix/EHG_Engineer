#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function getUserStories() {
  const { data: stories, error } = await supabase
    .from('user_stories')
    .select('*')
    .eq('sd_id', 'SD-AGENT-PLATFORM-001')
    .order('sprint', { ascending: true })
    .order('story_points', { ascending: false });

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log('Total User Stories:', stories.length);
  console.log('\n=== USER STORIES BY SPRINT ===\n');

  let currentSprint = null;
  let sprintTotal = 0;

  stories.forEach((story) => {
    if (story.sprint !== currentSprint) {
      if (currentSprint) {
        console.log(`    Sprint Total: ${sprintTotal} points\n`);
      }
      currentSprint = story.sprint;
      sprintTotal = 0;
      console.log(`### ${story.sprint}`);
    }
    sprintTotal += story.story_points || 0;
    console.log(`- ${story.story_key}: ${story.title} (${story.story_points} points, ${story.priority})`);
  });

  if (sprintTotal > 0) {
    console.log(`    Sprint Total: ${sprintTotal} points`);
  }

  const totalPoints = stories.reduce((sum, s) => sum + (s.story_points || 0), 0);
  console.log(`\n=== TOTAL: ${totalPoints} story points across ${stories.length} stories ===`);

  // Return stories for PRD generation
  return stories;
}

getUserStories();
