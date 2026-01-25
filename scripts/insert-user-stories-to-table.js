import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const effortToPoints = { S: 2, M: 5, L: 8, XL: 13 };

async function insertUserStories() {
  try {
    console.log('\n=== INSERTING USER STORIES TO DATABASE TABLE ===\n');

    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('backlog_items')
      .eq('id', 'PRD-SD-VIF-TIER-001')
      .single();

    const stories = prd.backlog_items.map((story, index) => ({
      id: randomUUID(),
      story_key: `SD-VIF-TIER-001:US-${String(index + 1).padStart(3, '0')}`,
      prd_id: 'PRD-SD-VIF-TIER-001',
      sd_id: 'SD-VIF-TIER-001',
      title: story.title,
      user_role: story.as_a,
      user_want: story.i_want,
      user_benefit: story.so_that,
      acceptance_criteria: story.acceptance_criteria,
      priority: story.priority.toLowerCase(),
      story_points: effortToPoints[story.estimated_effort] || 5,
      depends_on: null,  // Will populate later if needed
      status: 'ready',
      created_at: new Date().toISOString(),
      created_by: 'PLAN (Claude Code)',
      updated_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('user_stories')
      .insert(stories)
      .select();

    if (error) {
      console.error('Error:', error.message);
      return;
    }

    console.log('✅ Successfully inserted', data.length, 'user stories\n');
    console.log('User Stories:');
    data.forEach(s => console.log(`  • ${s.story_key}: ${s.title} (${s.story_points} points, ${s.priority})`));

  } catch (err) {
    console.error('Failed:', err.message);
  }
}

insertUserStories();
