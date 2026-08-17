-- DOWN migration for database/chairman-gated/20260803_current_wave_must_carry_items.sql
-- SD-LEO-INFRA-PLAN-POSITION-READABLE-001 (FR-2)
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, CHAIRMAN-GATED. DO NOT RUN except to reverse a completed apply of the paired UP migration.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Exact inverse of the UP file's own documented ROLLBACK comment (UP file lines 69-71) — this
-- migration simply promotes that comment into a runnable file, unchanged.
--
-- NOT DESTRUCTIVE OF DATA: this is a CONSTRAINT TRIGGER + its function, not a column or table.
-- Dropping it does not delete or alter any row in public.roadmap_waves or public.roadmap_wave_items
-- — it only removes the enforcement that an approved, current (time_horizon='now') wave must carry
-- at least one item. Detection (lib/roadmap/plan-position-check.js) is unaffected either way; only
-- the database-level ENFORCEMENT half (UP migration's own stated purpose) is reversed.
--
-- WHY IF EXISTS ON BOTH STATEMENTS: this file may be run against a database where the UP migration
-- was never applied (e.g. a chairman-ceremony dry run, or recovering from a partial apply) — both
-- DROPs are no-ops in that case rather than errors.

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP TRIGGER IF EXISTS trg_current_wave_carries_items ON public.roadmap_waves;
DROP FUNCTION IF EXISTS public.assert_current_wave_carries_items();

NOTIFY pgrst, 'reload schema';

COMMIT;
