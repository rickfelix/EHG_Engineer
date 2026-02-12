-- Migration: Add worktree_path to claude_sessions
-- SD: SD-LEO-INFRA-UNIFIED-WORKTREE-LIFECYCLE-001 (FR-2)
-- Purpose: Store resolved worktree path for each session's claimed SD.
--          Enables DB-first worktree lookup in resolve-sd-workdir.js.

-- Add worktree_path column (nullable - not all sessions use worktrees)
ALTER TABLE claude_sessions
  ADD COLUMN IF NOT EXISTS worktree_path TEXT;

-- Comment for schema documentation
COMMENT ON COLUMN claude_sessions.worktree_path IS
  'Absolute path to git worktree for this session''s claimed SD. Populated at claim time by resolve-sd-workdir.js. NULL if no worktree exists.';

-- Partial index for fast lookups (only index rows that have a worktree)
CREATE INDEX IF NOT EXISTS idx_claude_sessions_worktree_path
  ON claude_sessions (worktree_path)
  WHERE worktree_path IS NOT NULL;
