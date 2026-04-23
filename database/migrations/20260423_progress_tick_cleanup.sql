-- Migration: Clean up orphan functions left by an earlier aborted attempt.
-- SD: SD-LEO-INFRA-SD-INTRAPHASE-PROGRESS-001
-- Date: 2026-04-23
--
-- Context: An earlier draft of this SD's migration assumed the `sd_phase_progress`
-- table exists and attempted to extend it. That table never reached the
-- consolidated database (migration 20251012 was not applied during the
-- 2025-11-30 consolidation). The draft migration was applied via the buggy
-- `splitPostgreSQLStatements` helper, which successfully ran two CREATE OR
-- REPLACE FUNCTION statements whose bodies reference the non-existent table:
--
--   * `mark_phase_complete_on_handoff()` — body references sd_phase_progress.current_phase_tick
--   * `recompute_sd_progress_on_tick()`  — body references sd_phase_progress.sd_id
--
-- Neither function has a trigger invoking it (verified 2026-04-23 by direct
-- pg_trigger lookup — zero rows for either name), so they are orphan dead code
-- in pg_proc, not a runtime hazard. This migration removes them so future
-- migration authors don't trip over the mismatched signatures.
--
-- The pivoted implementation (see scripts/progress-tick.js) writes directly
-- to strategic_directives_v2.progress_percentage and does not require any
-- schema changes.
--
-- Idempotent: uses DROP FUNCTION IF EXISTS.

DROP FUNCTION IF EXISTS recompute_sd_progress_on_tick() CASCADE;
DROP FUNCTION IF EXISTS mark_phase_complete_on_handoff() CASCADE;

-- Note: If the real `sd_phase_progress` migration lands in a future SD, its
-- author should re-create `mark_phase_complete_on_handoff` with the correct
-- body for the table as it exists at that time.

DO $$
BEGIN
  RAISE NOTICE 'Cleaned up orphan functions from SD-LEO-INFRA-SD-INTRAPHASE-PROGRESS-001 first-draft migration.';
END $$;
