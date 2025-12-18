#!/usr/bin/env node

/**
 * Mark all user stories for SD-FOUNDATION-V3-002 as completed
 */

import { createSupabaseServiceClient } from './lib/supabase-connection.js';

async function completeStories() {
  const client = await createSupabaseServiceClient('engineer');

  console.log('Marking user stories as completed for SD-FOUNDATION-V3-002...\n');

  const { data, error } = await client
    .from('user_stories')
    .update({ status: 'completed' })
    .eq('sd_id', 'SD-FOUNDATION-V3-002')
    .select('story_key, title');

  if (error) {
    console.log('❌ Error:', error.message);
  } else {
    console.log('✅ Completed', data.length, 'user stories:');
    data.forEach(story => {
      console.log('  ✓', story.story_key, '-', story.title);
    });
  }
}

completeStories().catch(console.error);
