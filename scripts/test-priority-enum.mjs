#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const testValues = ['high', 'medium', 'low', 'critical', 'HIGH', 'MEDIUM', 'LOW', 'CRITICAL', 'p0', 'p1', 'p2', 'p3'];

console.log('Testing priority values...\n');

for (const testValue of testValues) {
  const { error } = await supabase
    .from('user_stories')
    .insert({
      id: randomUUID(),
      story_key: `test-${testValue}`,
      sd_id: 'test',
      prd_id: 'test',
      title: 'test',
      user_role: 'test',
      user_want: 'test',
      user_benefit: 'test',
      priority: testValue,
      e2e_test_status: 'not_created',
      implementation_context: 'test'
    });

  if (!error || !error.message.includes('priority_check')) {
    console.log(`✅ Valid priority: '${testValue}'`);

    // Clean up
    await supabase
      .from('user_stories')
      .delete()
      .eq('story_key', `test-${testValue}`);
    break;
  } else {
    console.log(`❌ Invalid: '${testValue}'`);
  }
}
