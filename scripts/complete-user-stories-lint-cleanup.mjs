#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('✅ Marking User Stories Complete for PRD-SD-LINT-CLEANUP-001');
console.log('═'.repeat(70));

// Get all user stories
const { data: stories, error: fetchError } = await supabase
  .from('user_stories')
  .select('id, title, status')
  .eq('prd_id', 'PRD-SD-LINT-CLEANUP-001');

if (fetchError) {
  console.error('❌ Error fetching user stories:', fetchError.message);
  process.exit(1);
}

console.log(`\nFound ${stories.length} user stories`);

// Mark each as completed
let updated = 0;
for (const story of stories) {
  const { error } = await supabase
    .from('user_stories')
    .update({
      status: 'completed',
      validation_status: 'validated',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', story.id);

  if (error) {
    console.error(`  ❌ Error updating ${story.id}:`, error.message);
  } else {
    console.log(`  ✅ ${story.title.substring(0, 60)}... → completed`);
    updated++;
  }
}

console.log(`\n✅ Updated ${updated}/${stories.length} user stories`);
console.log('═'.repeat(70));
