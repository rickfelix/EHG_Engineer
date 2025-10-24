#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function queryRemainingStories() {
  console.log('📝 Querying remaining user stories for SD-VWC-PHASE1-001...\n');

  // Get PRD ID first
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('id')
    .eq('sd_id', 'SD-VWC-PHASE1-001')
    .single();

  if (!prd) {
    console.error('❌ PRD not found');
    return;
  }

  // Get incomplete user stories
  const { data: stories, error } = await supabase
    .from('user_stories')
    .select('*')
    .eq('prd_id', prd.id)
    .neq('status', 'completed')
    .order('story_points', { ascending: false });

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  console.log(`📊 Found ${stories.length} remaining user stories:\n`);
  console.log('=' .repeat(80));

  stories.forEach((story, i) => {
    console.log(`\n[${i + 1}] ${story.title}`);
    console.log(`    ID: ${story.id}`);
    console.log(`    Story Points: ${story.story_points}`);
    console.log(`    Status: ${story.status}`);
    console.log(`    Priority: ${story.priority || 'N/A'}`);
    
    if (story.description) {
      console.log(`    Description: ${story.description.substring(0, 200)}${story.description.length > 200 ? '...' : ''}`);
    }
    
    if (story.acceptance_criteria && story.acceptance_criteria.length > 0) {
      console.log(`    Acceptance Criteria (${story.acceptance_criteria.length}):`);
      story.acceptance_criteria.forEach((ac, j) => {
        console.log(`      ${j + 1}. ${ac}`);
      });
    }
    
    if (story.implementation_context) {
      console.log(`    Implementation Context: ${story.implementation_context.substring(0, 150)}...`);
    }
  });

  console.log('\n' + '='.repeat(80));
  console.log(`\n📈 Total Story Points Remaining: ${stories.reduce((sum, s) => sum + (s.story_points || 0), 0)}`);
}

queryRemainingStories()
  .then(() => process.exit(0))
  .catch(e => {
    console.error('\n❌ Query failed:', e.message);
    process.exit(1);
  });
