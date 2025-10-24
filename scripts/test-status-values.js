#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const testStatuses = ['backlog', 'todo', 'in_progress', 'review', 'done', 'draft', 'ready', 'pending', 'active', 'blocked'];

console.log('Testing status values...\n');

for (const status of testStatuses) {
  const { error: testError } = await supabase
    .from('user_stories')
    .insert([{
      story_key: `TEST-STATUS-${status.toUpperCase()}`,
      title: 'Test story for status validation',
      status: status,
      priority: 'low',
      implementation_context: 'Test context'
    }])
    .select();

  if (!testError) {
    console.log(`✅ "${status}" is valid`);

    // Clean up test record
    await supabase
      .from('user_stories')
      .delete()
      .eq('story_key', `TEST-STATUS-${status.toUpperCase()}`);
  } else if (testError.message.includes('status_check') || testError.message.includes('violates check constraint')) {
    console.log(`❌ "${status}" is invalid`);
  } else {
    console.log(`⚠️  "${status}" - other error: ${testError.message.substring(0, 100)}`);
  }
}

console.log('\n✅ Status value testing complete');
