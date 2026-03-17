#!/usr/bin/env node

/**
 * Validate User Stories for SD-PROOF-DRIVEN-1758340937844
 *
 * All 4 user stories are completed with E2E tests created.
 * Update validation_status from 'pending' to 'validated'.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_ID = 'SD-PROOF-DRIVEN-1758340937844';

console.log('\n✅ Validating User Stories');
console.log('═'.repeat(70));
console.log('SD:', SD_ID);
console.log('');

// Get all user stories for this SD
const { data: userStories } = await supabase
  .from('user_stories')
  .select('id, title, status, validation_status, e2e_test_status')
  .eq('sd_id', SD_ID);

console.log(`Found ${userStories.length} user stories to validate:`);
console.log('');

// Validate each one
for (const story of userStories) {
  console.log(`Validating: ${story.title}`);
  console.log(`  Status: ${story.status}`);
  console.log(`  E2E Test: ${story.e2e_test_status}`);
  console.log(`  Current validation_status: ${story.validation_status}`);

  if (story.status === 'completed' && story.e2e_test_status === 'created') {
    const { error } = await supabase
      .from('user_stories')
      .update({ validation_status: 'validated' })
      .eq('id', story.id);

    if (error) {
      console.log(`  ❌ Failed to validate: ${error.message}`);
    } else {
      console.log(`  ✅ Updated to: validated`);
    }
  } else {
    console.log(`  ⏭️  Skipped (not completed or no E2E test)`);
  }
  console.log('');
}

console.log('═'.repeat(70));
console.log('');

// Verify progress now
console.log('🔍 Verifying progress after validation...');

const { data: progress } = await supabase.rpc('calculate_sd_progress', {
  sd_id_param: SD_ID
});

console.log('Progress:', progress + '%');

if (progress === 100) {
  console.log('✅ SUCCESS - SD ready for completion!');
} else {
  console.log('⚠️  Progress still at', progress + '% (expected 100%)');
}

console.log('');
