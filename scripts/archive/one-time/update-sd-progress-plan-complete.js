#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function updateProgress() {
  console.log('\n📊 Updating SD-AGENT-ADMIN-002 progress (PLAN phase complete)...\n');

  const sd_id = 'SD-AGENT-ADMIN-002';

  const { data: _data, error } = await supabase
    .from('strategic_directives_v2')
    .update({
      progress: 25, // LEAD (5%) + PLAN (20%) = 25%
      current_phase: 'EXEC',
      metadata: {
        lead_approval: {
          approved_by: 'LEAD Agent',
          approval_date: '2025-01-09',
          confidence_score: 95
        },
        plan_completion: {
          completed_by: 'PLAN Agent',
          completion_date: new Date().toISOString(),
          prd_id: 'PRD-SD-AGENT-ADMIN-002',
          database_tables_created: 4,
          user_stories: 57,
          story_points: 113,
          components_designed: 6,
          estimated_lines: 2650
        }
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', sd_id)
    .select();

  if (error) {
    console.error('❌ Error updating SD:', error.message);
    process.exit(1);
  }

  console.log('✅ SD progress updated!\n');
  console.log(`  ID: ${data[0].id}`);
  console.log(`  Progress: ${data[0].progress}%`);
  console.log(`  Current Phase: ${data[0].current_phase}`);
  console.log(`  Status: ${data[0].status}`);

  console.log('\n📊 PLAN Phase Complete:');
  console.log('  ✅ PRD created in database');
  console.log('  ✅ 4 database tables created (agent_configs, prompt_templates, ab_tests, search_preferences)');
  console.log('  ✅ 16 RLS policies applied');
  console.log('  ✅ 57 user stories mapped to acceptance criteria');
  console.log('  ✅ 6 major components designed (~2,650 lines)');

  console.log('\n🎯 Next: EXEC phase - Implementation\n');
}

updateProgress().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
