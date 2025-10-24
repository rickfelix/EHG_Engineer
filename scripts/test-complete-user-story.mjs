#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Test with complete structure matching STORIES sub-agent
const userStory = {
  id: randomUUID(),
  story_key: 'TEST-COMPLETE',
  sd_id: 'SD-PROGRESS-CALC-FIX',
  prd_id: 'PRD-SD-PROGRESS-CALC-FIX',
  title: 'Test story with all fields',
  user_role: 'developer',
  user_want: 'test',
  user_benefit: 'testing',
  acceptance_criteria: [
    'Test criterion',
    'Implementation verified through unit tests',
    'E2E test validates user-facing behavior',
    'No regressions in related functionality'
  ],
  definition_of_done: [
    'Code implemented and reviewed',
    'Unit tests passing',
    'E2E tests passing',
    'Acceptance criteria validated'
  ],
  priority: 'high',
  status: 'todo',
  validation_status: 'pending',
  e2e_test_status: 'not_created',
  implementation_context: 'Test context string',
  architecture_references: [],
  example_code_patterns: [],
  testing_scenarios: [],
  created_at: new Date().toISOString(),
  created_by: 'PLAN',
  updated_at: new Date().toISOString(),
  updated_by: 'PLAN'
};

console.log('Testing complete user story insert...\n');
console.log('Struct:', JSON.stringify(userStory, null, 2).substring(0, 500), '...\n');

const { data, error } = await supabase
  .from('user_stories')
  .insert(userStory)
  .select()
  .single();

if (error) {
  console.log('❌ Insert failed:', error.message);
  console.log('Details:', error.detail);
  console.log('Code:', error.code);
} else {
  console.log('✅ Insert succeeded!');
  console.log('Story ID:', data.id);

  // Clean up
  await supabase.from('user_stories').delete().eq('id', data.id);
  console.log('✅ Cleaned up test record');
}
