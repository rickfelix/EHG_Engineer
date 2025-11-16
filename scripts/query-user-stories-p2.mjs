#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data, error } = await supabase
  .from('user_stories')
  .select('*')
  .eq('prd_id', 'PRD-SD-STAGE4-UX-EDGE-CASES-001')
  .order('id');

if (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

console.log(`\nFound ${data.length} user stories:\n`);
data.forEach((story, idx) => {
  console.log(`${idx + 1}. ${story.id}`);
  console.log(`   Title: ${story.title}`);
  console.log(`   Status: ${story.status}`);
  console.log(`   Priority: ${story.priority}`);
  console.log(`   Story points: ${story.story_points || 'N/A'}`);
  console.log('');
});
