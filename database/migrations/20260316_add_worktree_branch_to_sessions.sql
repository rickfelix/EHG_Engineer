-- Migration: Add worktree_branch column to claude_sessions
-- SD: SD-MAN-INFRA-FIX-WORKTREE-TRACKING-001
-- Purpose: Enable coordinator to distinguish session branch from worktree branch
--          for reliable worktree conflict detection across concurrent sessions.

ALTER TABLE claude_sessions
  ADD COLUMN IF NOT EXISTS worktree_branch TEXT;

COMMENT ON COLUMN claude_sessions.worktree_branch IS
  'Git branch checked out in the worktree (e.g. feat/SD-XXX-001). '
  'Set by resolve-sd-workdir.js at claim time and concurrent-session-worktree hook. '
  'Cleared by heartbeat when worktree_path directory no longer exists on disk.';
