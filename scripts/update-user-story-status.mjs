#!/usr/bin/env node
/**
 * Update user story statuses for SD-VWC-PHASE1-001
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function updateStories() {
  console.log('📝 Updating user story statuses for SD-VWC-PHASE1-001...\n');

  const storiesToComplete = [
    { pattern: 'Embed IntelligenceDrawer', reason: 'US-004 implemented (commit e47994e)' },
    { pattern: 'keyboard navigation', reason: 'US-009 verified complete (commit 095dd2c)' },
    { pattern: 'Track all interactions', reason: 'US-011 implemented (commit f6c49e0)' }
  ];

  for (const story of storiesToComplete) {
    console.log(`🔍 Looking for: "${story.pattern}"...`);

    const { data: stories, error: findError } = await supabase
      .from('user_stories')
      .select('id, title, status')
      .ilike('title', `%${story.pattern}%`);

    if (findError) {
      console.error(`   ❌ Error finding story: ${findError.message}`);
      continue;
    }

    if (!stories || stories.length === 0) {
      console.log(`   ⚠️  No story found matching "${story.pattern}"`);
      continue;
    }

    const storyToUpdate = stories[0];
    console.log(`   ✓ Found: ${storyToUpdate.title}`);
    console.log(`   Current status: ${storyToUpdate.status}`);

    if (storyToUpdate.status === 'completed') {
      console.log(`   ℹ️  Already completed - skipping`);
      continue;
    }

    // Update status
    const { error: updateError } = await supabase
      .from('user_stories')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', storyToUpdate.id);

    if (updateError) {
      console.error(`   ❌ Error updating: ${updateError.message}`);
    } else {
      console.log(`   ✅ Marked as completed - ${story.reason}`);
    }
    console.log('');
  }

  // Query final status
  const { data: allStories, error: queryError } = await supabase
    .from('user_stories')
    .select('id, title, status')
    .eq('status', 'completed');

  console.log('\n📊 Updated status:');
  if (queryError) {
    console.error(`❌ Error: ${queryError.message}`);
  } else if (allStories) {
    console.log(`   Total completed: ${allStories.length} stories`);
    allStories.forEach(s => {
      console.log(`   ✅ ${s.title}`);
    });
  }
}

updateStories()
  .then(() => {
    console.log('\n✅ User story updates complete');
    process.exit(0);
  })
  .catch(e => {
    console.error('\n❌ Update failed:', e.message);
    process.exit(1);
  });
