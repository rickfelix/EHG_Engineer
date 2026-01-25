#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Test without acceptance_criteria and definition_of_done
const userStory = {
  id: randomUUID(),
  story_key: 'TEST-NO-ARRAYS',
  sd_id: 'SD-PROGRESS-CALC-FIX',
  prd_id: 'PRD-SD-PROGRESS-CALC-FIX',
  title: 'Test story without arrays',
  user_role: 'developer',
  user_want: 'test',
  user_benefit: 'testing',
  // acceptance_criteria: [], // REMOVED
  // definition_of_done: [], // REMOVED
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

console.log('Testing user story without acceptance_criteria/definition_of_done...\n');

const { data, error } = await supabase
  .from('user_stories')
  .insert(userStory)
  .select()
  .single();

if (error) {
  console.log('❌ Insert failed:', error.message);

  // Now try with only acceptance_criteria
  console.log('\nTrying with acceptance_criteria only...');
  const withAc = { ...userStory, acceptance_criteria: ['test'] };
  const { error: acError } = await supabase.from('user_stories').insert(withAc);
  console.log(acError ? `❌ Failed: ${acError.message}` : '✅ Succeeded with acceptance_criteria');

  // Now try with only definition_of_done
  console.log('\nTrying with definition_of_done only...');
  const withDod = { ...userStory, definition_of_done: ['test'], id: randomUUID(), story_key: 'TEST-DOD' };
  const { error: dodError } = await supabase.from('user_stories').insert(withDod);
  console.log(dodError ? `❌ Failed: ${dodError.message}` : '✅ Succeeded with definition_of_done');

} else {
  console.log('✅ Insert succeeded WITHOUT arrays!');
  await supabase.from('user_stories').delete().eq('id', data.id);
}
