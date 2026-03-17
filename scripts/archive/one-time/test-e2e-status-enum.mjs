#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Try different valid enum values
const testValues = ['pending', 'not_started', 'failed', 'passing', 'skipped', 'in_progress', 'passed'];

console.log('Testing e2e_test_status enum values...\n');

for (const testValue of testValues) {
  const { error } = await supabase
    .from('user_stories')
    .insert({
      id: `00000000-0000-0000-0000-00000000000${testValues.indexOf(testValue)+1}`,
      story_key: `test-${testValue}`,
      sd_id: 'test',
      title: 'test',
      user_role: 'test',
      user_want: 'test',
      user_benefit: 'test',
      e2e_test_status: testValue,
      implementation_context: 'test'
    });

  if (!error || !error.message.includes('e2e_test_status_check')) {
    console.log(`✅ Valid e2e_test_status: '${testValue}'`);

    // Clean up test record
    await supabase
      .from('user_stories')
      .delete()
      .eq('id', `00000000-0000-0000-0000-00000000000${testValues.indexOf(testValue)+1}`);
    break;
  } else {
    console.log(`❌ Invalid: '${testValue}'`);
  }
}
