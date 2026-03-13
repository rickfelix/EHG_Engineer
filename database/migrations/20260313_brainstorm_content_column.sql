-- Migration: Add content column to brainstorm_sessions
-- Purpose: Store brainstorm markdown content directly in the database
--          instead of relying on filesystem files (DB-only pattern)
-- Date: 2026-03-13
-- Idempotent: Yes (IF NOT EXISTS guard)

ALTER TABLE brainstorm_sessions
  ADD COLUMN IF NOT EXISTS content TEXT;

COMMENT ON COLUMN brainstorm_sessions.content IS 'Brainstorm markdown content stored directly in DB (replaces filesystem storage)';

-- Rollback:
-- ALTER TABLE brainstorm_sessions DROP COLUMN IF EXISTS content;
