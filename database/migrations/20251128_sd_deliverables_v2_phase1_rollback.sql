-- ============================================================================
-- ROLLBACK: SD-DELIVERABLES-V2-001 Phase 1 - Data Model Enhancement
-- ============================================================================
-- Reverts all changes from Phase 1 migration
--
-- ⚠️  WARNING: This will remove all Phase 1 enhancements
-- ⚠️  Data in sd_exec_file_operations will be LOST
-- ⚠️  user_story_id and checkpoint_sd_id columns will be removed
--
-- Date: 2025-11-28
-- Related SD: SD-DELIVERABLES-V2-001
-- ============================================================================

-- ============================================================================
-- SECTION 1: Drop bi-directional sync triggers (US-004)
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_sync_story_to_deliverables ON user_stories;
DROP TRIGGER IF EXISTS trigger_sync_deliverables_to_story ON sd_scope_deliverables;

DROP FUNCTION IF EXISTS sync_story_to_deliverables();
DROP FUNCTION IF EXISTS sync_deliverables_to_story();

RAISE NOTICE 'Dropped bi-directional sync triggers and functions';

-- ============================================================================
-- SECTION 2: Drop sd_exec_file_operations table (US-003)
-- ============================================================================

-- Drop policies first
DROP POLICY IF EXISTS sd_exec_file_operations_select_policy ON sd_exec_file_operations;
DROP POLICY IF EXISTS sd_exec_file_operations_insert_policy ON sd_exec_file_operations;
DROP POLICY IF EXISTS sd_exec_file_operations_update_policy ON sd_exec_file_operations;

-- Drop indexes
DROP INDEX IF EXISTS idx_exec_file_ops_sd;
DROP INDEX IF EXISTS idx_exec_file_ops_deliverable;
DROP INDEX IF EXISTS idx_exec_file_ops_story;
DROP INDEX IF EXISTS idx_exec_file_ops_path;
DROP INDEX IF EXISTS idx_exec_file_ops_commit;

-- Drop table
DROP TABLE IF EXISTS sd_exec_file_operations;

RAISE NOTICE 'Dropped sd_exec_file_operations table';

-- ============================================================================
-- SECTION 3: Remove checkpoint_sd_id column (US-002)
-- ============================================================================

DROP INDEX IF EXISTS idx_scope_deliverables_checkpoint;

ALTER TABLE sd_scope_deliverables
  DROP COLUMN IF EXISTS checkpoint_sd_id;

RAISE NOTICE 'Removed checkpoint_sd_id column from sd_scope_deliverables';

-- ============================================================================
-- SECTION 4: Remove user_story_id column (US-001)
-- ============================================================================

DROP INDEX IF EXISTS idx_scope_deliverables_user_story;

ALTER TABLE sd_scope_deliverables
  DROP COLUMN IF EXISTS user_story_id;

RAISE NOTICE 'Removed user_story_id column from sd_scope_deliverables';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  user_story_col_exists BOOLEAN;
  checkpoint_col_exists BOOLEAN;
  file_ops_table_exists BOOLEAN;
  sync_triggers_exist BOOLEAN;
BEGIN
  -- Check user_story_id column is gone
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sd_scope_deliverables'
    AND column_name = 'user_story_id'
  ) INTO user_story_col_exists;

  -- Check checkpoint_sd_id column is gone
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sd_scope_deliverables'
    AND column_name = 'checkpoint_sd_id'
  ) INTO checkpoint_col_exists;

  -- Check sd_exec_file_operations table is gone
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'sd_exec_file_operations'
  ) INTO file_ops_table_exists;

  -- Check sync triggers are gone
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_sync_story_to_deliverables'
  ) OR EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_sync_deliverables_to_story'
  ) INTO sync_triggers_exist;

  -- Report results
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SD-DELIVERABLES-V2-001 Phase 1 ROLLBACK Verification';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'user_story_id column removed: %', CASE WHEN NOT user_story_col_exists THEN 'YES' ELSE 'NO - still exists!' END;
  RAISE NOTICE 'checkpoint_sd_id column removed: %', CASE WHEN NOT checkpoint_col_exists THEN 'YES' ELSE 'NO - still exists!' END;
  RAISE NOTICE 'sd_exec_file_operations table removed: %', CASE WHEN NOT file_ops_table_exists THEN 'YES' ELSE 'NO - still exists!' END;
  RAISE NOTICE 'bi-directional triggers removed: %', CASE WHEN NOT sync_triggers_exist THEN 'YES' ELSE 'NO - still exist!' END;
  RAISE NOTICE '============================================================';

  IF NOT user_story_col_exists AND NOT checkpoint_col_exists AND NOT file_ops_table_exists AND NOT sync_triggers_exist THEN
    RAISE NOTICE 'Phase 1 ROLLBACK: SUCCESS - All changes reverted';
  ELSE
    RAISE WARNING 'Phase 1 ROLLBACK: PARTIAL - Some items may not have been removed';
  END IF;
END $$;
