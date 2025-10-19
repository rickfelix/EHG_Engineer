#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const sdId = 'SD-CUSTOMER-INTEL-001';
const prdId = 'PRD-SD-CUSTOMER-INTEL-001';

// Get user stories from PRD metadata
const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('backlog_items')
  .eq('id', prdId)
  .single();

if (!prd || !prd.backlog_items || prd.backlog_items.length === 0) {
  console.error('❌ No user stories found in PRD backlog_items');
  process.exit(1);
}

console.log(`📋 Found ${prd.backlog_items.length} user stories in PRD`);
console.log('💾 Inserting into user_stories table...\n');

// Transform user stories to table format
const userStoryRecords = prd.backlog_items.map((story, index) => {
  // Parse description to extract user_role, user_want, user_benefit
  const descMatch = story.description.match(/As an? (.+?), I want to (.+?) so that (.+?)\.?$/);

  const user_role = descMatch ? descMatch[1].trim() : 'user';
  const user_want = descMatch ? descMatch[2].trim() : story.title;
  const user_benefit = descMatch ? descMatch[3].trim() : `support ${story.subsystem}`;

  // Generate simple story key: SD-CUSTOMER-INTEL-001:US-001, US-002, etc.
  const storyNumber = String(index + 1).padStart(3, '0');  // US-001, US-002, etc.
  const simpleStoryKey = `${sdId}:US-${storyNumber}`;

  return {
    story_key: simpleStoryKey,
    sd_id: sdId,
    prd_id: prdId,
    title: story.title,
    user_role: user_role,
    user_want: user_want,
    user_benefit: user_benefit,
    story_points: story.story_points,
    priority: story.priority,
    status: 'ready',
    sprint: `Sprint ${story.sprint}`,
    acceptance_criteria: story.acceptance_criteria || [],
    technical_notes: `[${story.id}] ${story.test_scenario || story.subsystem + ' feature'}`,
    created_by: 'PLAN',
    test_scenarios: story.test_scenario ? [story.test_scenario] : [],
    definition_of_done: [],
    depends_on: [],
    blocks: []
  };
});

// Insert in batches (Supabase has limits on bulk inserts)
const batchSize = 10;
let insertedCount = 0;

for (let i = 0; i < userStoryRecords.length; i += batchSize) {
  const batch = userStoryRecords.slice(i, i + batchSize);

  const { data, error } = await supabase
    .from('user_stories')
    .insert(batch)
    .select();

  if (error) {
    console.error(`❌ Error inserting batch ${Math.floor(i / batchSize) + 1}:`, error.message);
  } else {
    insertedCount += data.length;
    console.log(`✅ Batch ${Math.floor(i / batchSize) + 1}: Inserted ${data.length} stories`);
  }
}

console.log(`\n✅ Inserted ${insertedCount}/${userStoryRecords.length} user stories`);
console.log(`📊 Stories now available for PLAN→EXEC handoff verification`);
console.log(`\n🔄 Retry handoff: node scripts/unified-handoff-system.js execute PLAN-to-EXEC ${sdId}`);
