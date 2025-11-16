#!/usr/bin/env node
/**
 * Fetch implemented/completed user stories excluding Stage 4
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function getStories() {
  const { data, error } = await supabase
    .from('user_stories')
    .select('story_id, title, status, sd_id')
    .in('status', ['IMPLEMENTED', 'COMPLETED'])
    .order('story_id');

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  // Filter out Stage 4 and Venture stories
  const filtered = data.filter(s =>
    !s.story_id.includes('STAGE4') &&
    !s.story_id.includes('VENTURE') &&
    !s.sd_id?.includes('STAGE4') &&
    !s.sd_id?.includes('VENTURE')
  );

  filtered.forEach(s => {
    console.log(`${s.story_id}|${s.title}|${s.status}|${s.sd_id || 'N/A'}`);
  });

  console.error(`\nTotal: ${filtered.length} stories (excluding Stage 4/Venture)`);
}

getStories();
