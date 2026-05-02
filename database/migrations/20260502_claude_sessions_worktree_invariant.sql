-- ============================================================================
-- Migration: claude_sessions worktree-state invariant CHECK constraint
-- SD: SD-LEO-INFRA-LEO-INFRA-SESSION-001 (FR-5)
-- Date: 2026-05-02
-- Purpose: Final layer of defense for the worktree-state atomicity fix.
--          Phase 1 (writer module + backfill) and Phase 2 (FR-1 SQL +
--          claim-swapper wiring) prevent the bug from recurring at the
--          application layer; this migration enforces the invariant at the
--          schema layer so even a hand-rolled UPDATE in some future script
--          cannot create a partial-state row.
--
-- INVARIANT:
--   sd_key IS NOT NULL OR (worktree_path IS NULL AND worktree_branch IS NULL)
--
-- A row holds a worktree only when it holds an SD claim. Releasing the claim
-- without nulling the worktree columns is a bug — this constraint refuses
-- such rows at INSERT/UPDATE time.
--
-- DEPLOYMENT ORDER:
--   1. Phase 1 backfill (scripts/one-off/backfill-stale-worktree-state.mjs)
--      — must run first to clear pre-existing violators. Done 2026-05-02:
--      1254 rows cleared, 0 remaining.
--   2. Phase 2 migration (20260502_claim_sd_worktree_columns.sql) —
--      wires claim_sd / release_sd to NULL the columns atomically. Done
--      2026-05-02 (verified via TS-1 + TS-7 integration tests).
--   3. THIS migration — guarded by SELECT count(*); aborts if any row
--      currently violates the invariant. DOWN section drops the constraint
--      cleanly.
--
-- ROLLBACK:
--   ALTER TABLE claude_sessions
--     DROP CONSTRAINT IF EXISTS ck_claude_sessions_worktree_state_consistency;
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Pre-deployment guard — abort if any row would violate the invariant
-- ============================================================================
-- Use a DO block so we can RAISE EXCEPTION on a non-zero count. PostgreSQL
-- aborts the BEGIN/COMMIT block automatically on the unhandled exception,
-- so the constraint is never added if any violators remain.
DO $$
DECLARE
  violator_count integer;
BEGIN
  SELECT COUNT(*)
    INTO violator_count
    FROM claude_sessions
   WHERE sd_key IS NULL
     AND (worktree_path IS NOT NULL OR worktree_branch IS NOT NULL);

  IF violator_count > 0 THEN
    RAISE EXCEPTION
      '[FR5_GUARD_ABORT] Cannot add ck_claude_sessions_worktree_state_consistency: % rows currently violate the invariant. Run scripts/one-off/backfill-stale-worktree-state.mjs first.',
      violator_count;
  END IF;
END $$;

-- ============================================================================
-- STEP 2: Add the CHECK constraint
-- ============================================================================
-- NOT VALID is intentionally NOT used. The Step 1 guard ensures all existing
-- rows pass; we want the constraint to be VALID immediately so future
-- INSERTs / UPDATEs are checked from the moment the migration commits.
ALTER TABLE claude_sessions
  ADD CONSTRAINT ck_claude_sessions_worktree_state_consistency
  CHECK (
    sd_key IS NOT NULL
    OR (worktree_path IS NULL AND worktree_branch IS NULL)
  );

COMMENT ON CONSTRAINT ck_claude_sessions_worktree_state_consistency
  ON claude_sessions IS
  'SD-LEO-INFRA-LEO-INFRA-SESSION-001 FR-5: enforces (sd_key IS NOT NULL) OR (worktree_path IS NULL AND worktree_branch IS NULL). Closes the partial-state class where a session released its sd_key but kept worktree_path / worktree_branch populated. Defense-in-depth backstop for Phase 1 (writer module) + Phase 2 (claim_sd / release_sd SQL) + Phase 3 (atomic rollback). Drop with: ALTER TABLE claude_sessions DROP CONSTRAINT IF EXISTS ck_claude_sessions_worktree_state_consistency.';

COMMIT;

-- ============================================================================
-- ROLLBACK NOTES:
--
-- Forward path on this migration is safe — the guard refuses to apply if
-- violators remain. The constraint blocks future INSERT/UPDATE that would
-- create a partial-state row.
--
-- To remove (e.g., during incident response or schema rework):
--   BEGIN;
--     ALTER TABLE claude_sessions
--       DROP CONSTRAINT IF EXISTS ck_claude_sessions_worktree_state_consistency;
--   COMMIT;
--
-- After rollback, the application-layer guards (writer module, claim_sd /
-- release_sd SQL, atomic rollback in worktree-manager) still prevent the
-- partial-state class. The constraint is the schema-level enforcement; its
-- removal does not introduce data corruption, only loosens the guarantee.
-- ============================================================================
