#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('Test 1: Minimal with test IDs (this worked before)...');
const test1 = {
  id: randomUUID(),
  story_key: 'test-status-todo',
  sd_id: 'test',
  prd_id: 'test',
  title: 'test',
  user_role: 'test',
  user_want: 'test',
  user_benefit: 'test',
  priority: 'high',
  e2e_test_status: 'not_created',
  implementation_context: 'test',
  status: 'todo'
};

const { error: error1 } = await supabase.from('user_stories').insert(test1);
console.log(error1 ? `❌ Failed: ${error1.message}` : '✅ Succeeded');
if (!error1) await supabase.from('user_stories').delete().eq('id', test1.id);

console.log('\nTest 2: Minimal with REAL SD/PRD IDs...');
const test2 = {
  id: randomUUID(),
  story_key: 'test-real-ids',
  sd_id: 'SD-PROGRESS-CALC-FIX',
  prd_id: 'PRD-SD-PROGRESS-CALC-FIX',
  title: 'test',
  user_role: 'test',
  user_want: 'test',
  user_benefit: 'test',
  priority: 'high',
  e2e_test_status: 'not_created',
  implementation_context: 'test',
  status: 'todo'
};

const { error: error2 } = await supabase.from('user_stories').insert(test2);
console.log(error2 ? `❌ Failed: ${error2.message}` : '✅ Succeeded');
if (!error2) await supabase.from('user_stories').delete().eq('id', test2.id);
