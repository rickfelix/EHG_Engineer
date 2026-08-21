-- DOWN migration for 20260821_worker_wind_down_events.sql
-- SD-LEO-INFRA-WIND-DOWN-SURVEY-001 (FR-1) — drop worker_wind_down_events.
-- @chairman-gated
--
-- ⚠ NO `-- @approved-by:` LINE — same reason as the UP. The chairman supplies the attestation and
--   runs `node scripts/apply-migration.js <this file> --prod-deploy`. APPLY IS NOT MINE.
--
-- ⚠ NO EXPLICIT BEGIN/COMMIT — apply-migration.js owns the transaction.
--
-- WHAT THIS DOWN DOES: drops the table entirely, including all accumulated rows. Since this
-- table is write-only telemetry with zero readers by design (matching the feedback-table mirror
-- it replaces), there is no reader to break and no archival step is warranted before drop — this
-- mirrors how the OLD feedback(category='wind_down_survey') rows themselves carried no
-- special-case backup requirement either. If applying this DOWN, note that
-- scripts/hooks/stop-loop-wakeup-reminder.cjs's recordWindDown() must ALSO be reverted (or the
-- code will fail-open/no-op on every stop, same interim-gap shape as the UP's own known gap)
-- unless this DOWN is paired with a code revert in the same deploy.

DROP TABLE IF EXISTS public.worker_wind_down_events;

DO $wwde_down_verify$
BEGIN
  ASSERT to_regclass('public.worker_wind_down_events') IS NULL,
    'DOWN post-assert failed: worker_wind_down_events still exists after DROP';
  RAISE NOTICE 'DOWN complete: worker_wind_down_events dropped';
END
$wwde_down_verify$;
