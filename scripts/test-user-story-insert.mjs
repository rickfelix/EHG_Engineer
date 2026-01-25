#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('Testing minimal user story insert...\n');

const userStory = {
  id: randomUUID(),
  story_key: 'TEST-001',
  sd_id: 'SD-PROGRESS-CALC-FIX',
  prd_id: 'PRD-SD-PROGRESS-CALC-FIX',
  title: 'Test story',
  user_role: 'developer',
  user_want: 'test',
  user_benefit: 'testing',
  priority: 'HIGH',
  status: 'pending',
  validation_status: 'pending',
  e2e_test_status: 'pending',
  implementation_context: 'Test context',
  created_at: new Date().toISOString(),
  created_by: 'PLAN',
  updated_at: new Date().toISOString(),
  updated_by: 'PLAN'
};

console.log('Attempting to insert:', userStory);

const { data, error } = await supabase
  .from('user_stories')
  .insert(userStory)
  .select()
  .single();

if (error) {
  console.log('\n❌ Insert failed:', error.message);
  console.log('Error details:', error);
} else {
  console.log('\n✅ Insert successful!');
  console.log('Created story:', data.id);

  // Clean up
  await supabase.from('user_stories').delete().eq('id', data.id);
  console.log('✅ Cleaned up test record');
}
