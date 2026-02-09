-- Migration: Add task hierarchy columns to eva_todoist_intake
-- Purpose: Store Todoist parent-child relationships and ordering so the
--          classifier can read sibling/parent context when evaluating ideas.
-- Columns: todoist_parent_id, todoist_section_id, todoist_child_order

-- ============================================================================
-- Add hierarchy columns
-- ============================================================================

ALTER TABLE eva_todoist_intake
  ADD COLUMN IF NOT EXISTS todoist_parent_id TEXT,
  ADD COLUMN IF NOT EXISTS todoist_section_id TEXT,
  ADD COLUMN IF NOT EXISTS todoist_child_order INTEGER DEFAULT 0;

-- Index for efficient parent lookups (find children of a task)
CREATE INDEX IF NOT EXISTS idx_eva_todoist_intake_parent
  ON eva_todoist_intake(todoist_parent_id)
  WHERE todoist_parent_id IS NOT NULL;

-- Index for section grouping
CREATE INDEX IF NOT EXISTS idx_eva_todoist_intake_section
  ON eva_todoist_intake(todoist_section_id)
  WHERE todoist_section_id IS NOT NULL;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
-- 1. Added todoist_parent_id (TEXT, nullable) - links to parent task's todoist_task_id
-- 2. Added todoist_section_id (TEXT, nullable) - Todoist section grouping
-- 3. Added todoist_child_order (INTEGER, default 0) - sort order among siblings
-- 4. Added partial indexes for parent and section lookups
