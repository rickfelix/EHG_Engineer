#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const testConfigurations = {
  status: ['todo', 'in_progress', 'completed', 'blocked', 'pending', 'not_started', 'done'],
  validation_status: ['pending', 'validated', 'failed', 'in_progress', 'not_started'],
};

console.log('Testing user story enum values...\n');

for (const [field, values] of Object.entries(testConfigurations)) {
  console.log(`Testing ${field}...`);
  for (const testValue of values) {
    const testData = {
      id: randomUUID(),
      story_key: `test-${field}-${testValue}`,
      sd_id: 'test',
      prd_id: 'test',
      title: 'test',
      user_role: 'test',
      user_want: 'test',
      user_benefit: 'test',
      priority: 'high',
      e2e_test_status: 'not_created',
      implementation_context: 'test',
      [field]: testValue
    };

    const { error } = await supabase
      .from('user_stories')
      .insert(testData);

    if (!error || !error.message.includes(`${field}_check`)) {
      console.log(`  ✅ Valid ${field}: '${testValue}'`);

      // Clean up
      await supabase
        .from('user_stories')
        .delete()
        .eq('id', testData.id);
      break;
    } else {
      console.log(`  ❌ Invalid: '${testValue}'`);
    }
  }
  console.log('');
}
