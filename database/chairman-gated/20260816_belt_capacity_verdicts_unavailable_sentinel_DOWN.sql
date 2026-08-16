-- DOWN migration for database/chairman-gated/20260816_belt_capacity_verdicts_unavailable_sentinel.sql
-- SD-LEO-FIX-BELT-CAPACITY-VERDICTS-001
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, CHAIRMAN-GATED. DO NOT RUN except to reverse a completed apply of the paired UP migration.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ⚠️  DESTRUCTIVE ON ANY SENTINEL ROW WRITTEN SINCE THE UP MIGRATION APPLIED. Narrowing the verdict
-- CHECK back to the original four values, and re-adding NOT NULL to belt_depth/demand_soon/deficit,
-- will FAIL if even one row has verdict='UNAVAILABLE' or a null measurement column -- exactly the
-- rows this SD exists to create. Those rows are the record of "this run could not be measured";
-- their inputs were never retained anywhere and CANNOT BE RECOMPUTED after the fact (same
-- irrecoverability the original 20260807_belt_capacity_verdicts_DOWN.sql already documents for the
-- table as a whole).
--
-- BEFORE RUNNING THIS FILE: take a copy of any read_failed=true rows you want to keep --
--   CREATE TABLE public.belt_capacity_verdicts_unavailable_backup AS
--     SELECT * FROM public.belt_capacity_verdicts WHERE read_failed = true;
-- -- and then either DELETE those rows or otherwise reconcile them, or this migration's own
-- pre-flight guard below will refuse to run rather than fail with a raw constraint-violation
-- mid-transaction.
--
-- WHAT HAPPENS TO leg4: nothing. scoreCapacityLeg's unavailable()-on-failure contract is
-- unaffected by this rollback either way -- rolling back only removes the DURABLE RECORD of a
-- past read failure, it does not change how a future read failure is scored (still unavailable(),
-- never a fabricated DEFICIT, with or without this migration).

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $preflight$
DECLARE
  v_sentinel_count int;
BEGIN
  SELECT count(*) INTO v_sentinel_count
  FROM public.belt_capacity_verdicts
  WHERE read_failed = true OR verdict = 'UNAVAILABLE'
     OR belt_depth IS NULL OR demand_soon IS NULL OR deficit IS NULL;
  IF v_sentinel_count > 0 THEN
    RAISE EXCEPTION 'PRECONDITION FAILED: % sentinel/null-measurement row(s) exist and would be DESTROYED by narrowing this table back -- their inputs cannot be recomputed. Back them up (see this file''s header) and delete or reconcile them before re-running this rollback.', v_sentinel_count;
  END IF;
END
$preflight$;

ALTER TABLE public.belt_capacity_verdicts ALTER COLUMN belt_depth SET NOT NULL;
ALTER TABLE public.belt_capacity_verdicts ALTER COLUMN demand_soon SET NOT NULL;
ALTER TABLE public.belt_capacity_verdicts ALTER COLUMN deficit SET NOT NULL;

ALTER TABLE public.belt_capacity_verdicts
  DROP CONSTRAINT belt_capacity_verdicts_verdict_check;

ALTER TABLE public.belt_capacity_verdicts
  ADD CONSTRAINT belt_capacity_verdicts_verdict_check
  CHECK (verdict IN ('DEFICIT-URGENT', 'DEFICIT', 'TIGHT', 'SURPLUS'));

ALTER TABLE public.belt_capacity_verdicts
  DROP COLUMN read_failed;

NOTIFY pgrst, 'reload schema';

COMMIT;
