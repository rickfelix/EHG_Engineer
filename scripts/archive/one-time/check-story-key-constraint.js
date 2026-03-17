#!/usr/bin/env node

/**
 * Check the valid_story_key constraint definition
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkConstraint() {
  // Query constraint definition
  const { data, error } = await supabase
    .rpc('get_constraint_definition', {
      constraint_name: 'valid_story_key',
      table_name: 'user_stories'
    });

  if (error) {
    console.log('RPC not available, trying direct query...\n');

    // Try querying existing user stories to see the pattern
    const { data: stories, error: storiesError } = await supabase
      .from('user_stories')
      .select('story_key, sd_id')
      .limit(10);

    if (storiesError) {
      console.error('Error querying user stories:', storiesError);
      return;
    }

    console.log('📋 Existing User Story Keys (for pattern analysis):');
    console.log('================================================================\n');

    stories.forEach(story => {
      console.log(`   ${story.story_key} (SD: ${story.sd_id})`);
    });

    console.log('\n📊 Pattern Analysis:');
    if (stories.length > 0) {
      const example = stories[0].story_key;
      console.log(`   Example: "${example}"`);
      console.log('   Format appears to be: "{SD_ID}:US-{NUMBER}"');
    }
  } else {
    console.log('Constraint definition:', data);
  }
}

checkConstraint();
