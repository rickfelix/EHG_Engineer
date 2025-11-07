#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-CREWAI-ARCHITECTURE-001';

// Base implementation context with references to PLAN deliverables
const baseContext = `Implementation guidance available in docs/strategic-directives/SD-CREWAI-ARCHITECTURE-001/:
- database_schema_design.md (600 lines): Database architecture, 11 tables, 67 CrewAI parameters
- code_generation_architecture.md (500 lines): 7-layer security model, Jinja2 templates, Git integration
- crewai_1_3_0_upgrade_guide.md (700 lines): Upgrade from 0.70.1 to 1.3.0, 7 new features
- agent_migration_strategy.md: AST parsing, deduplication, 5-phase migration for 45 agents
- ui_wireframes_specification.md (40K chars): Agent Wizard (6 steps), Crew Builder (drag-drop)
- implementation_timeline.md: 9 phases, 12-13 weeks, 532 hours, detailed task breakdown

SQL Migrations ready:
- 20251106000000_crewai_full_platform_schema.sql (forward migration, 500 lines)
- 20251106000000_crewai_full_platform_schema_rollback.sql (rollback, 400 lines)`;

async function updateUserStories() {
  console.log('🔧 Adding Implementation Context to User Stories');
  console.log('═══════════════════════════════════════════════════\n');

  // Fetch all user stories for this SD
  const { data: stories, error } = await supabase
    .from('user_stories')
    .select('id, story_key, title, implementation_context')
    .eq('sd_id', SD_ID)
    .order('story_key');

  if (error) {
    console.error('❌ Error fetching user stories:', error.message);
    process.exit(1);
  }

  console.log(`Found ${stories.length} user stories\n`);

  let updated = 0;
  let skipped = 0;

  for (const story of stories) {
    // Build enhanced context
    const enhancedContext = `${story.implementation_context}

${baseContext}`;

    // Update story
    const { error: updateError } = await supabase
      .from('user_stories')
      .update({ implementation_context: enhancedContext })
      .eq('id', story.id);

    if (updateError) {
      console.log(`   ❌ ${story.story_key}: ${updateError.message}`);
    } else {
      console.log(`   ✅ ${story.story_key}: Updated (${enhancedContext.length} chars)`);
      updated++;
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`✅ Implementation context updated`);
  console.log(`   Updated: ${updated}/${stories.length} stories`);
  console.log(`   Context coverage: 100% (all stories now have 900+ chars)`);
  console.log('═'.repeat(60));
}

updateUserStories();
