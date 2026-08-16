-- SD-LEO-FIX-BELT-CAPACITY-VERDICTS-001 (FR-1) -- companion ALTER to
-- database/chairman-gated/20260807_belt_capacity_verdicts.sql. Does NOT edit that file (migrations
-- in this repo are append-only, matching every other family this session has touched).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, CHAIRMAN-GATED. DO NOT RUN THIS FILE without chairman sign-off, matching the original
-- 20260807 file's own established gating convention for this exact table.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- THE GAP THIS CLOSES: scoreCapacityLeg (scripts/cron/drive-report-sweep.mjs) reports leg4
-- unavailable() on ANY failure without persisting any row -- a run that could not be measured is
-- indistinguishable from a run that was never swept. The literal fix (a verdict=UNAVAILABLE
-- sentinel row) is blocked today: verdict is NOT NULL text CHECK'd to exactly the four real
-- verdicts, and belt_depth/demand_soon/deficit are all NOT NULL integer.
--
-- WHY A SEPARATE FILE, NOT AN EDIT TO 20260807: that file is itself the historical record of what
-- was true when this table was created (its own test, tests/unit/capacity-verdict-migration.test.js,
-- reads it verbatim). Widening it in place would rewrite history. This file is additive-only:
-- ADD COLUMN, widen one CHECK constraint (drop + recreate, Postgres has no in-place CHECK-widen),
-- DROP NOT NULL on three columns. No existing row is rewritten, no existing reader's query shape
-- changes -- verified in the $verify$ block below before COMMIT.
--
-- WHY 'UNAVAILABLE' NEVER JOINS VERDICTS (lib/drive-loop/score/leg4-capacity.js): VERDICTS is
-- dual-purpose there -- persistence vocabulary AND scoreLeg4's own scoring-input guard (line 66).
-- Admitting UNAVAILABLE into THAT list would make scoreLeg4 accept and SCORE it as 0
-- (HEALTHY_VERDICTS=['TIGHT']), silently recreating the exact "indistinguishable from a genuine
-- DEFICIT" defect this SD exists to close. This migration widens ONLY this table's own CHECK
-- constraint -- a separate, narrower vocabulary that the application-side sentinel writer
-- (scripts/lib/capacity-verdict-store.mjs, UNAVAILABLE_VERDICT) uses directly, never routed
-- through scoreLeg4 at all.
--
-- ROLLBACK (manual, if needed -- see the paired _DOWN file)
-- SEC-L1/L2 convention (this session, matching the original file and its sibling migrations):
-- bounded lock wait, own transaction, trailing PostgREST reload so a rollback leaves the schema
-- cache consistent with pg_catalog immediately.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ============================================================
-- 0. PRE-FLIGHT GUARD: refuse to adopt a table this migration did not expect. Mirrors the
--    original file's own "a pre-condition must refuse to adopt a table it did not create" idiom.
-- ============================================================
DO $preflight$
BEGIN
  IF to_regclass('public.belt_capacity_verdicts') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: public.belt_capacity_verdicts does not exist -- apply database/chairman-gated/20260807_belt_capacity_verdicts.sql first';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'belt_capacity_verdicts' AND column_name = 'read_failed'
  ) THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: public.belt_capacity_verdicts.read_failed already exists -- this migration has already applied';
  END IF;
END
$preflight$;

-- ============================================================
-- 1. read_failed marker (FR-1). Additive, defaulted, backfills every existing row to false --
--    every row written before this migration was, by definition, a measured run.
-- ============================================================
ALTER TABLE public.belt_capacity_verdicts
  ADD COLUMN read_failed boolean NOT NULL DEFAULT false;

-- ============================================================
-- 2. Widen the verdict CHECK to also admit the sentinel value. Postgres has no ALTER CONSTRAINT
--    to widen a CHECK in place -- drop and recreate under the SAME constraint name so nothing
--    downstream that references the name (there is no such reference today, confirmed by Explore
--    + validation-agent -- see PRD FR-1 evidence) needs to change.
-- ============================================================
ALTER TABLE public.belt_capacity_verdicts
  DROP CONSTRAINT belt_capacity_verdicts_verdict_check;

ALTER TABLE public.belt_capacity_verdicts
  ADD CONSTRAINT belt_capacity_verdicts_verdict_check
  CHECK (verdict IN ('DEFICIT-URGENT', 'DEFICIT', 'TIGHT', 'SURPLUS', 'UNAVAILABLE'));

-- ============================================================
-- 3. The three measurement columns cannot stay NOT NULL: a read-failure run genuinely has no
--    belt_depth/demand_soon/deficit to report. A verdict with null measurements on this table now
--    ALWAYS means read_failed=true (enforced by the writer, not the DB -- see FR-2), never a
--    normal-path row silently missing data.
-- ============================================================
ALTER TABLE public.belt_capacity_verdicts ALTER COLUMN belt_depth DROP NOT NULL;
ALTER TABLE public.belt_capacity_verdicts ALTER COLUMN demand_soon DROP NOT NULL;
ALTER TABLE public.belt_capacity_verdicts ALTER COLUMN deficit DROP NOT NULL;

-- ============================================================
-- 4. Self-verify in-transaction rather than exiting green on a partial apply -- same discipline
--    as the original file's own $verify$ block.
-- ============================================================
DO $verify$
DECLARE
  v_count int;
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'belt_capacity_verdicts'
        AND column_name = 'read_failed' AND data_type = 'boolean' AND is_nullable = 'NO') <> 1 THEN
    RAISE EXCEPTION 'POSTCONDITION FAILED: read_failed is not boolean NOT NULL';
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_constraint
  WHERE conrelid = 'public.belt_capacity_verdicts'::regclass
    AND conname = 'belt_capacity_verdicts_verdict_check'
    AND pg_get_constraintdef(oid) LIKE '%DEFICIT-URGENT%'
    AND pg_get_constraintdef(oid) LIKE '%UNAVAILABLE%';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'POSTCONDITION FAILED: belt_capacity_verdicts_verdict_check does not admit both the original four verdicts and UNAVAILABLE';
  END IF;

  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'belt_capacity_verdicts'
        AND column_name IN ('belt_depth', 'demand_soon', 'deficit') AND is_nullable = 'YES') <> 3 THEN
    RAISE EXCEPTION 'POSTCONDITION FAILED: belt_depth/demand_soon/deficit are not all nullable';
  END IF;

  -- Every pre-existing row backfilled read_failed=false and remains a real measured verdict.
  IF EXISTS (SELECT 1 FROM public.belt_capacity_verdicts WHERE read_failed IS NULL) THEN
    RAISE EXCEPTION 'POSTCONDITION FAILED: a row has read_failed IS NULL after a NOT NULL DEFAULT false backfill -- should be structurally impossible';
  END IF;
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
