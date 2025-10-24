#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const lengths = [10, 50, 100, 200];

for (const len of lengths) {
  const implContext = 'x'.repeat(len);
  console.log(`Testing implementation_context length: ${len}...`);

  const { error } = await supabase.from('user_stories').insert({
    id: randomUUID(),
    story_key: `test-len-${len}`,
    sd_id: 'test',
    prd_id: 'test',
    title: 'test',
    user_role: 'test',
    user_want: 'test',
    user_benefit: 'test',
    priority: 'high',
    e2e_test_status: 'not_created',
    implementation_context: implContext,
    status: 'todo'
  });

  if (!error || !error.message.includes('implementation_context_required')) {
    console.log(`✅ Succeeded with length ${len}\n`);
    if (!error) {
      await supabase.from('user_stories').delete().eq('story_key', `test-len-${len}`);
    }
    break;
  } else {
    console.log(`❌ Failed at length ${len}: ${error.message}\n`);
  }
}
