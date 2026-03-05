-- Migration: Add soft-delete support to ventures table
-- SD: SD-MAN-INFRA-VENTURE-DATA-LIFECYCLE-001 (Phase 2)
--
-- Adds deleted_at column for soft-delete pattern.
-- Creates views for active and archived ventures.
-- Creates exec_sql helper for FK audit tool.

-- ═══ Phase 2A: Soft-Delete Column ═══

-- Add deleted_at column (NULL = active, non-NULL = soft-deleted)
ALTER TABLE ventures ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Partial index for efficient filtering of soft-deleted records
CREATE INDEX IF NOT EXISTS idx_ventures_deleted_at
  ON ventures(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ═══ Phase 2B: Views ═══

-- Active ventures (default query target)
-- Excludes soft-deleted, archived, and cancelled ventures
CREATE OR REPLACE VIEW v_active_ventures AS
SELECT * FROM ventures WHERE deleted_at IS NULL AND status NOT IN ('archived', 'cancelled');

-- Archived ventures (soft-deleted, awaiting cold storage or restore)
CREATE OR REPLACE VIEW v_archived_ventures AS
SELECT * FROM ventures WHERE deleted_at IS NOT NULL;

-- Note: exec_sql(sql_text TEXT) RPC function already exists in the database.
-- FK audit tool uses it for live constraint discovery.
