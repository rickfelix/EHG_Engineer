-- SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001 — FR-1 rollback for 20260807_belt_capacity_verdicts.sql.
--
-- ⚠️ WHAT ROLLING BACK RESTORES, STATED BEFORE THE COMMAND SO IT IS READ:
--
--   1. THE VERDICT HISTORY IS DESTROYED, NOT DETACHED. This is the only record of what the belt
--      capacity verdict has been over time; nothing else writes it and nothing else keeps a copy.
--      Dropping the table makes "how long have we been in DEFICIT" unanswerable again — which was
--      the exact gap the SD existed to close. The history cannot be recomputed after the fact: the
--      inputs (live worker states, claimable depth at that instant) are not retained anywhere.
--      TAKE A COPY FIRST if the data has any value:
--        CREATE TABLE belt_capacity_verdicts_backup AS SELECT * FROM belt_capacity_verdicts;
--
--   2. drive_score leg4 GOES DARK AGAIN — back to `unavailable` on every drive-report run, with
--      scoreLeg4 returning to zero production callers. The report keeps producing; the leg simply
--      stops being measurable and is excluded from the denominator rather than scored zero.
--
--   3. THE CAPACITY FORECAST KEEPS RUNNING. Its persist call classifies a missing table by error
--      code and logs a skip, so the 10-minute coordinator tick degrades to its pre-SD behaviour
--      rather than failing. That is the ONE tolerated error class; every other write failure still
--      throws. Rolling this back therefore returns the forecast to computing the verdict and
--      throwing it away — quietly, and by design, which is why it went unnoticed for a whole SD.
--
-- No _DOWN for the application code is needed or wanted: the writer and the leg4 wiring are inert
-- against an absent table by construction, so the code can stay merged while the table is gone.

DROP INDEX IF EXISTS public.belt_capacity_verdicts_recorded_at_idx;
DROP TABLE IF EXISTS public.belt_capacity_verdicts;

DO $$
BEGIN
  IF to_regclass('public.belt_capacity_verdicts') IS NOT NULL THEN
    RAISE EXCEPTION 'ROLLBACK FAILED: belt_capacity_verdicts still exists.';
  END IF;
END $$;
