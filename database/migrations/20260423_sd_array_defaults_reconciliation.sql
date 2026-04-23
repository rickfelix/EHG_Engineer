-- =============================================================================
-- Migration: Reconcile JSONB array defaults with check constraints
-- SD:        SD-LEO-INFRA-SD-CREATION-TOOLING-001 (Phase 3 / EXEC)
-- Date:      2026-04-23
-- Author:    database-agent (Opus 4.7)
-- =============================================================================
--
-- BUG (failure mode #3 from SD description):
--   strategic_directives_v2 has four JSONB array columns — key_principles,
--   success_metrics, success_criteria, key_changes — with default '[]'::jsonb.
--   Three of them also carry a *_not_empty CHECK constraint that requires
--   `col IS NULL OR jsonb_array_length(col) >= 1`. Any INSERT that omits these
--   columns receives the `[]` default and immediately trips the CHECK.
--
-- DECISION (per PRD metadata.plan_decision):
--   Option A — drop the empty-array defaults. Columns are already nullable and
--   the CHECK constraints already permit NULL, so INSERTs that omit these
--   columns will simply get NULL and pass validation. Empty arrays are
--   surfaced (not silently produced) if a caller explicitly supplies them.
--
-- PER-COLUMN DETERMINATION (inspected 2026-04-23):
--   key_principles    — constraints: is_array + not_empty (both allow NULL) → OPTION A (drop default)
--   success_metrics   — constraints: is_array + not_empty (both allow NULL) → OPTION A (drop default)
--   success_criteria  — constraints: is_array + not_empty (both allow NULL) → OPTION A (drop default)
--   key_changes       — constraint:  is_array ONLY (no not_empty)
--                       '[]'::jsonb is LEGAL, so default does not trip any CHECK.
--                       515 existing rows contain []. LEAVING AS-IS (NO-OP).
--
-- EXISTING DATA (pre-migration counts):
--   key_principles:    11 NULL,  0 empty  (all-NULL except for populated rows)
--   success_metrics:   16 NULL,  0 empty
--   success_criteria:  10 NULL,  0 empty
--   key_changes:        5 NULL, 515 empty  ← intentionally untouched
--   No row-level data is modified by this migration.
--
-- ROLLBACK:
--   ALTER TABLE public.strategic_directives_v2
--       ALTER COLUMN key_principles   SET DEFAULT '[]'::jsonb,
--       ALTER COLUMN success_metrics  SET DEFAULT '[]'::jsonb,
--       ALTER COLUMN success_criteria SET DEFAULT '[]'::jsonb;
-- =============================================================================

BEGIN;

-- Option A: drop the incompatible '[]'::jsonb defaults.
-- DROP DEFAULT is idempotent (no error if already no default).
ALTER TABLE public.strategic_directives_v2
    ALTER COLUMN key_principles   DROP DEFAULT,
    ALTER COLUMN success_metrics  DROP DEFAULT,
    ALTER COLUMN success_criteria DROP DEFAULT;

-- key_changes left alone — its only CHECK is is_array, which '[]' satisfies.

COMMIT;
