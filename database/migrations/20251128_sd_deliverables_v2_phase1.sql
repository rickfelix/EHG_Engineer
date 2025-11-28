-- ============================================================================
-- Migration: SD-DELIVERABLES-V2-001 Phase 1 - Data Model Enhancement
-- ============================================================================
-- Implements FR-1, FR-2, FR-3 from PRD-SD-DELIVERABLES-V2-001
--
-- Changes:
--   1. Add user_story_id FK to sd_scope_deliverables (US-001)
--   2. Add checkpoint_sd_id for parent/child SD linking (US-002)
--   3. Create sd_exec_file_operations tracking table (US-003)
--   4. Create bi-directional sync triggers (US-004)
--
-- Date: 2025-11-28
-- Related SD: SD-DELIVERABLES-V2-001
-- Phase: 1 of 5 (Data Model Enhancement)
-- ============================================================================

-- ============================================================================
-- SECTION 1: Add user_story_id FK to sd_scope_deliverables (US-001)
-- ============================================================================
-- Links deliverables directly to user stories for automatic sync

-- Add column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sd_scope_deliverables'
    AND column_name = 'user_story_id'
  ) THEN
    ALTER TABLE sd_scope_deliverables
      ADD COLUMN user_story_id UUID REFERENCES user_stories(id) ON DELETE SET NULL;

    RAISE NOTICE 'Added user_story_id column to sd_scope_deliverables';
  ELSE
    RAISE NOTICE 'user_story_id column already exists - skipping';
  END IF;
END $$;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_scope_deliverables_user_story
  ON sd_scope_deliverables(user_story_id);

COMMENT ON COLUMN sd_scope_deliverables.user_story_id IS
  'Links deliverable to user story for bi-directional sync. When story validated, linked deliverables complete.';

-- ============================================================================
-- SECTION 2: Add checkpoint_sd_id for parent/child linking (US-002)
-- ============================================================================
-- Enables parent SD progress to roll up child SD deliverables

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sd_scope_deliverables'
    AND column_name = 'checkpoint_sd_id'
  ) THEN
    ALTER TABLE sd_scope_deliverables
      ADD COLUMN checkpoint_sd_id VARCHAR(100) REFERENCES strategic_directives_v2(id) ON DELETE SET NULL;

    RAISE NOTICE 'Added checkpoint_sd_id column to sd_scope_deliverables';
  ELSE
    RAISE NOTICE 'checkpoint_sd_id column already exists - skipping';
  END IF;
END $$;

-- Create index for parent/child lookups
CREATE INDEX IF NOT EXISTS idx_scope_deliverables_checkpoint
  ON sd_scope_deliverables(checkpoint_sd_id);

COMMENT ON COLUMN sd_scope_deliverables.checkpoint_sd_id IS
  'Links deliverable to parent SD checkpoint. Enables progress rollup from child to parent SDs.';

-- ============================================================================
-- SECTION 3: Create sd_exec_file_operations tracking table (US-003)
-- ============================================================================
-- Tracks all file operations during EXEC phase for automatic deliverable matching

CREATE TABLE IF NOT EXISTS sd_exec_file_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id VARCHAR(100) NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,

  -- File operation details
  operation_type VARCHAR(20) NOT NULL CHECK (operation_type IN ('create', 'modify', 'delete', 'rename')),
  file_path TEXT NOT NULL,
  commit_hash VARCHAR(40),
  commit_message TEXT,

  -- Linking to tracking systems
  deliverable_id UUID REFERENCES sd_scope_deliverables(id) ON DELETE SET NULL,
  user_story_id UUID REFERENCES user_stories(id) ON DELETE SET NULL,

  -- Matching metadata
  matched_by VARCHAR(50) CHECK (matched_by IN ('manual', 'pattern', 'commit_message', 'hook', 'unmatched')),
  match_confidence INTEGER DEFAULT 0 CHECK (match_confidence >= 0 AND match_confidence <= 100),

  -- Timestamps
  operation_timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Additional context
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_exec_file_ops_sd ON sd_exec_file_operations(sd_id);
CREATE INDEX IF NOT EXISTS idx_exec_file_ops_deliverable ON sd_exec_file_operations(deliverable_id);
CREATE INDEX IF NOT EXISTS idx_exec_file_ops_story ON sd_exec_file_operations(user_story_id);
CREATE INDEX IF NOT EXISTS idx_exec_file_ops_path ON sd_exec_file_operations(file_path);
CREATE INDEX IF NOT EXISTS idx_exec_file_ops_commit ON sd_exec_file_operations(commit_hash);

-- Enable RLS
ALTER TABLE sd_exec_file_operations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY IF NOT EXISTS sd_exec_file_operations_select_policy
  ON sd_exec_file_operations FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS sd_exec_file_operations_insert_policy
  ON sd_exec_file_operations FOR INSERT
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS sd_exec_file_operations_update_policy
  ON sd_exec_file_operations FOR UPDATE
  USING (true);

-- Comments
COMMENT ON TABLE sd_exec_file_operations IS
  'Tracks file operations during EXEC phase for automatic deliverable matching. Part of SD-DELIVERABLES-V2-001.';
COMMENT ON COLUMN sd_exec_file_operations.matched_by IS
  'How the file operation was matched to a deliverable: manual, pattern matching, commit message parsing, or Claude hook';
COMMENT ON COLUMN sd_exec_file_operations.match_confidence IS
  'Confidence score 0-100 for automatic matches';

-- ============================================================================
-- SECTION 4: Bi-directional sync triggers (US-004)
-- ============================================================================
-- Syncs completion status between user_stories and sd_scope_deliverables

-- Trigger function: When user story is validated, complete linked deliverables
CREATE OR REPLACE FUNCTION sync_story_to_deliverables()
RETURNS TRIGGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  -- Prevent infinite loops: check trigger depth
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Only proceed if validation_status changed to 'validated'
  IF NEW.validation_status = 'validated' AND
     (OLD.validation_status IS NULL OR OLD.validation_status != 'validated') THEN

    -- Update all deliverables linked to this user story
    UPDATE sd_scope_deliverables
    SET
      completion_status = 'completed',
      verified_by = 'EXEC',
      verified_at = NOW(),
      completion_evidence = format('User story %s validated. Trigger: sync_story_to_deliverables', NEW.story_key),
      completion_notes = format('Auto-completed when user story %s validation_status changed to validated', NEW.story_key),
      updated_at = NOW(),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'auto_completed', true,
        'auto_completed_at', NOW(),
        'trigger', 'sync_story_to_deliverables',
        'user_story_id', NEW.id,
        'user_story_key', NEW.story_key,
        'confidence', 100
      )
    WHERE user_story_id = NEW.id
    AND completion_status != 'completed';

    GET DIAGNOSTICS updated_count = ROW_COUNT;

    IF updated_count > 0 THEN
      RAISE NOTICE 'sync_story_to_deliverables: Completed % deliverables for user story %',
        updated_count, NEW.story_key;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function: When all linked deliverables complete, validate user story
CREATE OR REPLACE FUNCTION sync_deliverables_to_story()
RETURNS TRIGGER AS $$
DECLARE
  total_deliverables INTEGER;
  completed_deliverables INTEGER;
  story_record RECORD;
BEGIN
  -- Prevent infinite loops: check trigger depth
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Only proceed if completion_status changed to 'completed' and we have a linked story
  IF NEW.completion_status = 'completed' AND
     (OLD.completion_status IS NULL OR OLD.completion_status != 'completed') AND
     NEW.user_story_id IS NOT NULL THEN

    -- Check if all deliverables for this story are now complete
    SELECT COUNT(*),
           SUM(CASE WHEN completion_status = 'completed' THEN 1 ELSE 0 END)
    INTO total_deliverables, completed_deliverables
    FROM sd_scope_deliverables
    WHERE user_story_id = NEW.user_story_id;

    -- If all deliverables complete, validate the user story
    IF total_deliverables > 0 AND completed_deliverables = total_deliverables THEN
      -- Get story info for logging
      SELECT story_key, validation_status INTO story_record
      FROM user_stories
      WHERE id = NEW.user_story_id;

      -- Only update if not already validated
      IF story_record.validation_status != 'validated' THEN
        UPDATE user_stories
        SET
          validation_status = 'validated',
          updated_at = NOW()
        WHERE id = NEW.user_story_id;

        RAISE NOTICE 'sync_deliverables_to_story: Validated user story % (all % deliverables complete)',
          story_record.story_key, total_deliverables;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_sync_story_to_deliverables ON user_stories;
DROP TRIGGER IF EXISTS trigger_sync_deliverables_to_story ON sd_scope_deliverables;

-- Create triggers
CREATE TRIGGER trigger_sync_story_to_deliverables
  AFTER UPDATE ON user_stories
  FOR EACH ROW
  WHEN (NEW.validation_status IS DISTINCT FROM OLD.validation_status)
  EXECUTE FUNCTION sync_story_to_deliverables();

CREATE TRIGGER trigger_sync_deliverables_to_story
  AFTER UPDATE ON sd_scope_deliverables
  FOR EACH ROW
  WHEN (NEW.completion_status IS DISTINCT FROM OLD.completion_status)
  EXECUTE FUNCTION sync_deliverables_to_story();

-- Comments
COMMENT ON FUNCTION sync_story_to_deliverables() IS
  'Bi-directional sync: When user story validated, complete all linked deliverables. Uses pg_trigger_depth() to prevent loops.';
COMMENT ON FUNCTION sync_deliverables_to_story() IS
  'Bi-directional sync: When all linked deliverables complete, validate user story. Uses pg_trigger_depth() to prevent loops.';

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
  -- Check user_story_id column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sd_scope_deliverables'
    AND column_name = 'user_story_id'
  ) INTO user_story_col_exists;

  -- Check checkpoint_sd_id column
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sd_scope_deliverables'
    AND column_name = 'checkpoint_sd_id'
  ) INTO checkpoint_col_exists;

  -- Check sd_exec_file_operations table
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'sd_exec_file_operations'
  ) INTO file_ops_table_exists;

  -- Check sync triggers
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_sync_story_to_deliverables'
  ) AND EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_sync_deliverables_to_story'
  ) INTO sync_triggers_exist;

  -- Report results
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'SD-DELIVERABLES-V2-001 Phase 1 Migration Verification';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'US-001 user_story_id column: %', CASE WHEN user_story_col_exists THEN 'PASS' ELSE 'FAIL' END;
  RAISE NOTICE 'US-002 checkpoint_sd_id column: %', CASE WHEN checkpoint_col_exists THEN 'PASS' ELSE 'FAIL' END;
  RAISE NOTICE 'US-003 sd_exec_file_operations table: %', CASE WHEN file_ops_table_exists THEN 'PASS' ELSE 'FAIL' END;
  RAISE NOTICE 'US-004 bi-directional sync triggers: %', CASE WHEN sync_triggers_exist THEN 'PASS' ELSE 'FAIL' END;
  RAISE NOTICE '============================================================';

  IF user_story_col_exists AND checkpoint_col_exists AND file_ops_table_exists AND sync_triggers_exist THEN
    RAISE NOTICE 'Phase 1 Migration: SUCCESS';
  ELSE
    RAISE EXCEPTION 'Phase 1 Migration: FAILED - see above for details';
  END IF;
END $$;
