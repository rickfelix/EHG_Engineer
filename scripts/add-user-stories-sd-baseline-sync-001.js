#!/usr/bin/env node
/**
 * Add User Stories for SD-BASELINE-SYNC-001
 * Automatic Baseline Sync for Strategic Directives
 *
 * STORIES Agent v2.0.0 - Lessons Learned Edition
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const SD_KEY = 'SD-BASELINE-SYNC-001';
const PRD_KEY = 'PRD-SD-BASELINE-SYNC-001';

async function addUserStories() {
  console.log('📋 Adding User Stories for SD-BASELINE-SYNC-001...\n');

  // Get SD UUID
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title')
    .eq('sd_key', SD_KEY)
    .single();

  if (sdError || !sd) {
    console.error('❌ SD not found:', SD_KEY);
    process.exit(1);
  }

  // Get PRD UUID
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('id, title')
    .eq('id', PRD_KEY)
    .maybeSingle();

  console.log('✓ SD found:', sd.sd_key);
  if (prd) console.log('✓ PRD found:', PRD_KEY);

  const userStories = [
    {
      story_key: 'SD-BASELINE-SYNC-001:US-001',
      title: 'Auto-add new Strategic Directives to active baseline when created',
      user_role: 'Baseline Manager',
      user_want: 'New Strategic Directives automatically added to active baseline when created',
      user_benefit: 'Maintain complete SD tracking without manual baseline updates',
      priority: 'high',
      story_points: 5,
      status: 'draft',
      implementation_context: 'Database trigger approach: CREATE TRIGGER on strategic_directives_v2 AFTER INSERT. Trigger function auto_add_sd_to_active_baseline() queries for active baseline, calculates next sequence_rank, inserts into baseline_items with ON CONFLICT DO NOTHING for idempotency. All operations logged to governance_audit_log. Graceful degradation - warnings logged to leo_error_log but SD creation never blocked.',
      architecture_references: [
        'database/schema/baseline_management.sql',
        'database/schema/strategic_directives_v2.sql',
        'scripts/add-sd-to-database.js'
      ],
      acceptance_criteria: [
        {
          id: 'AC-001-1',
          scenario: 'Happy path - New SD auto-added to active baseline',
          given: 'Active baseline exists AND new SD created',
          when: 'SD creation completes',
          then: 'baseline_items record created with sd_key link, status=not_started, audit logged'
        },
        {
          id: 'AC-001-2',
          scenario: 'No active baseline warning',
          given: 'No active baseline exists',
          when: 'New SD created',
          then: 'Warning logged, SD creation proceeds'
        }
      ]
    },
    {
      story_key: 'SD-BASELINE-SYNC-001:US-002',
      title: 'Auto-update baseline item status when SD status changes to completed',
      user_role: 'Baseline Manager',
      user_want: 'Baseline item status automatically updates when SD completed',
      user_benefit: 'Maintain accurate baseline progress without manual updates',
      priority: 'high',
      story_points: 5,
      status: 'draft',
      implementation_context: 'Database trigger on strategic_directives_v2 AFTER UPDATE. Trigger condition: WHEN (OLD.status != NEW.status AND NEW.status = completed). Bidirectional sync handles both completed→in_progress and in_progress→completed. Updates baseline_items.completed_at timestamp. All operations logged to governance_audit_log.',
      architecture_references: [
        'database/schema/baseline_management.sql',
        'database/schema/strategic_directives_v2.sql'
      ],
      acceptance_criteria: [
        {
          id: 'AC-002-1',
          scenario: 'SD completed, baseline updated',
          given: 'SD in baseline with in_progress status',
          when: 'SD status updated to completed',
          then: 'baseline_items.status=completed, completed_at set, audit logged'
        },
        {
          id: 'AC-002-2',
          scenario: 'Rollback handling',
          given: 'SD completed with baseline_items.status=completed',
          when: 'SD reverted to in_progress',
          then: 'baseline_items.status=in_progress, completed_at=NULL'
        }
      ]
    },
    {
      story_key: 'SD-BASELINE-SYNC-001:US-003',
      title: 'Enforce sd_key (not uuid) as the linking field',
      user_role: 'Database Administrator',
      user_want: 'Baseline items linked using sd_key string instead of uuid',
      user_benefit: 'Human-readable references, stable links across imports',
      priority: 'high',
      story_points: 3,
      status: 'draft',
      implementation_context: 'Migration script adds sd_key VARCHAR(50) NOT NULL column, populates from existing sd_id, adds foreign key constraint to strategic_directives_v2.sd_key ON DELETE CASCADE, creates unique index on (baseline_id, sd_key), creates performance index on sd_key. Old sd_id column deprecated but not dropped for rollback safety.',
      architecture_references: [
        'database/schema/baseline_management.sql',
        'database/migrations/',
        'scripts/baseline/'
      ],
      acceptance_criteria: [
        {
          id: 'AC-003-1',
          scenario: 'Schema validation',
          given: 'Database schema',
          when: 'Migration complete',
          then: 'baseline_items.sd_key exists, NOT NULL, indexed, foreign key to strategic_directives_v2.sd_key'
        },
        {
          id: 'AC-003-2',
          scenario: 'Data integrity',
          given: 'Existing baseline_items',
          when: 'Data validation run',
          then: 'Zero NULL sd_key values, all sd_keys match pattern, all exist in strategic_directives_v2'
        }
      ]
    }
  ];

  console.log('\nInserting', userStories.length, 'user stories...\n');

  let successCount = 0;

  for (const story of userStories) {
    const { error } = await supabase
      .from('user_stories')
      .insert({
        ...story,
        sd_id: sd.id,
        prd_id: prd?.id || PRD_KEY
      })
      .select();

    if (error) {
      console.error('❌', story.story_key, '-', error.message);
    } else {
      console.log('✓', story.story_key, '-', story.title, `(${story.story_points} pts)`);
      successCount++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`✓ Successfully added: ${successCount}/${userStories.length} user stories`);
  console.log('  Total: 13 story points');
  console.log('\nNext Steps:');
  console.log('  1. Create E2E tests for each user story');
  console.log('  2. Implement database triggers (US-001, US-002)');
  console.log('  3. Run migration for sd_key linkage (US-003)');
}

addUserStories();
