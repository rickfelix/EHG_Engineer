#!/usr/bin/env node
/**
 * Cancel SD-VISION-ALIGN-001 and clean up associated data
 *
 * This script:
 * 1. Checks for data dependencies in chairman_interests columns
 * 2. Updates SD status to 'cancelled'
 * 3. Cleans up orphaned backlog mappings
 * 4. Creates rollback migration for chairman_interests columns
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cancelSDVisionAlign001() {
  console.log('\n🔍 Checking SD-VISION-ALIGN-001 dependencies...\n');

  // Step 1: Check if any data uses the new columns
  const { data: chairmanInterests, error: checkError } = await supabase
    .from('chairman_interests')
    .select('id, name, story_beats, vision_signals, coverage_nav_item_ids, feasibility_score')
    .or('story_beats.not.is.null,vision_signals.not.is.null,coverage_nav_item_ids.not.is.null,feasibility_score.not.is.null');

  if (checkError) {
    console.error('❌ Error checking chairman_interests:', checkError);
    process.exit(1);
  }

  const hasData = chairmanInterests && chairmanInterests.length > 0;

  if (hasData) {
    console.log(`⚠️  WARNING: ${chairmanInterests.length} chairman_interests records have data in new columns:`);
    chairmanInterests.forEach(ci => {
      console.log(`   - ${ci.name} (${ci.id})`);
      if (ci.story_beats && ci.story_beats.length > 0) console.log(`     story_beats: ${ci.story_beats.length} items`);
      if (ci.vision_signals && ci.vision_signals.length > 0) console.log(`     vision_signals: ${ci.vision_signals.length} items`);
      if (ci.coverage_nav_item_ids && ci.coverage_nav_item_ids.length > 0) console.log(`     coverage_nav_item_ids: ${ci.coverage_nav_item_ids.length} items`);
      if (ci.feasibility_score !== null) console.log(`     feasibility_score: ${ci.feasibility_score}`);
    });
    console.log('\n⚠️  Data will be lost when columns are dropped. Continue? (Run with --force to proceed)\n');

    if (!process.argv.includes('--force')) {
      console.log('❌ Cancellation aborted. Run with --force to proceed anyway.\n');
      process.exit(1);
    }
  } else {
    console.log('✅ No data found in new columns - safe to rollback\n');
  }

  // Step 2: Delete orphaned backlog mappings
  console.log('🗑️  Cleaning up orphaned backlog mappings...');
  const { error: deleteError } = await supabase
    .from('sd_backlog_map')
    .delete()
    .eq('sd_id', 'SD-VISION-ALIGN-001');

  if (deleteError) {
    console.log('⚠️  Warning: Could not delete backlog mappings:', deleteError.message);
  } else {
    console.log('✅ Orphaned backlog mappings cleaned up\n');
  }

  // Step 3: Update SD status to cancelled
  console.log('📝 Updating SD status to cancelled...');

  // First, get current governance_metadata
  const { data: currentSD } = await supabase
    .from('strategic_directives_v2')
    .select('governance_metadata')
    .eq('id', 'SD-VISION-ALIGN-001')
    .single();

  const { error: updateError } = await supabase
    .from('strategic_directives_v2')
    .update({
      is_active: false,
      archived_at: new Date().toISOString(),
      archived_by: 'system',
      governance_metadata: {
        ...(currentSD?.governance_metadata || {}),
        cancellation_reason: 'Scope too complex, replaced with simplified AI-powered Russian Judge quality gates SD',
        cancelled_at: new Date().toISOString(),
        cancelled_phase: 'LEAD_APPROVAL'
      }
    })
    .eq('id', 'SD-VISION-ALIGN-001');

  if (updateError) {
    console.error('❌ Error updating SD:', updateError);
    process.exit(1);
  }

  console.log('✅ SD-VISION-ALIGN-001 marked as cancelled\n');

  // Step 4: Create rollback migration
  console.log('📄 Creating rollback migration...');
  const rollbackMigration = `-- Rollback: Remove vision alignment columns from chairman_interests
-- Reverses: 20251204_sd_vision_align_001_chairman_interests_extensions.sql
-- SD: SD-VISION-ALIGN-001 (CANCELLED)
-- Date: 2025-12-05

DO $$
BEGIN
    -- Drop story_beats column
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chairman_interests' AND column_name = 'story_beats'
    ) THEN
        ALTER TABLE public.chairman_interests DROP COLUMN story_beats;
        RAISE NOTICE '✅ Dropped story_beats column';
    END IF;

    -- Drop vision_signals column
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chairman_interests' AND column_name = 'vision_signals'
    ) THEN
        ALTER TABLE public.chairman_interests DROP COLUMN vision_signals;
        RAISE NOTICE '✅ Dropped vision_signals column';
    END IF;

    -- Drop coverage_nav_item_ids column
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chairman_interests' AND column_name = 'coverage_nav_item_ids'
    ) THEN
        ALTER TABLE public.chairman_interests DROP COLUMN coverage_nav_item_ids;
        RAISE NOTICE '✅ Dropped coverage_nav_item_ids column';
    END IF;

    -- Drop feasibility_score column
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'chairman_interests' AND column_name = 'feasibility_score'
    ) THEN
        ALTER TABLE public.chairman_interests DROP COLUMN feasibility_score;
        RAISE NOTICE '✅ Dropped feasibility_score column';
    END IF;

    RAISE NOTICE '✅ Rollback complete: chairman_interests restored to base schema';
END $$;

-- Verification
DO $$
DECLARE
  remaining_columns TEXT[] := ARRAY[]::TEXT[];
  col TEXT;
BEGIN
  FOREACH col IN ARRAY ARRAY['story_beats', 'vision_signals', 'coverage_nav_item_ids', 'feasibility_score']
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'chairman_interests' AND column_name = col
    ) THEN
      remaining_columns := array_append(remaining_columns, col);
    END IF;
  END LOOP;

  IF array_length(remaining_columns, 1) > 0 THEN
    RAISE EXCEPTION 'Rollback verification failed: Columns still exist: %', remaining_columns;
  END IF;

  RAISE NOTICE '✅ Verification passed: All 4 columns removed successfully';
END $$;
`;

  const migrationPath = join(
    process.cwd(),
    'database/migrations/20251205_rollback_vision_align_chairman_interests.sql'
  );

  writeFileSync(migrationPath, rollbackMigration);
  console.log(`✅ Rollback migration created: ${migrationPath}\n`);

  // Step 5: Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ SD-VISION-ALIGN-001 CANCELLATION COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('Next steps:');
  console.log('1. Apply rollback migration:');
  console.log('   npx supabase db execute database/migrations/20251205_rollback_vision_align_chairman_interests.sql');
  console.log('');
  console.log('2. Archive original migration (for audit trail):');
  console.log('   mkdir -p database/migrations/archived');
  console.log('   mv database/migrations/20251204_sd_vision_align_001_chairman_interests_extensions.sql database/migrations/archived/');
  console.log('');
  console.log('3. Create new simplified SD for AI-powered Russian Judge quality gates');
  console.log('');
}

// Execute
cancelSDVisionAlign001().catch(console.error);
