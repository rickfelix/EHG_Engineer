-- 20260819_gha_cron_liveness_source_github_actions_api.sql
-- QF-20260728-069 (consolidates QF-20260729-497, QF-20260801-527) — ceremony lane; chairman-gated DATA migration
-- on periodic_process_registry (UPDATE = chairman-only class per delegated-apply scope); NOT auto-applied.
-- @approved-by: codestreetlabs@gmail.com (chairman ruling 2A at terminal 2026-08-19T16:07Z; scribe adam-08049808)
--
-- DEFECT (measured live 2026-08-19): 108 periodic_process_registry rows with process_key LIKE 'gha_cron:%' all carry
-- liveness_source='self_stamped' (github_actions_api: 0). scripts/periodic-liveness-watcher.mjs:190/:435 selects ONLY
-- liveness_source='github_actions_api' for the GHA API stamper, so its candidate set is EMPTY every cycle: 108/108 rows
-- have last_fired_at >24h old (OVERDUE 78 / UNVERIFIED 25 / OK 5), e.g. gha_cron:fleet-down-alert-cron.yml last stamped
-- 2026-08-07 while the workflow runs daily. The rows are frozen, not the crons.
-- FIX (DB half): flip the 108 rows so the API stamper owns them. The seeder that labels new gha_cron rows self_stamped is
-- the CODE half (worker item under QF-069) so rows do not revert.
-- VERIFY after one watcher cycle: fleet-down-alert-cron moves to OK with fresh last_fired_at; stale>24h gha_cron count → 0.
-- Rollback: UPDATE periodic_process_registry SET liveness_source='self_stamped' WHERE process_key LIKE 'gha_cron:%';
-- Idempotent: WHERE guard makes a re-run a no-op.

BEGIN;

UPDATE public.periodic_process_registry
   SET liveness_source = 'github_actions_api',
       updated_at = now()
 WHERE process_key LIKE 'gha_cron:%'
   AND liveness_source IS DISTINCT FROM 'github_actions_api';

-- POSTCONDITION: no gha_cron row left self_stamped
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.periodic_process_registry
   WHERE process_key LIKE 'gha_cron:%' AND liveness_source IS DISTINCT FROM 'github_actions_api';
  IF n > 0 THEN RAISE EXCEPTION 'POSTCONDITION FAILED: % gha_cron rows still not github_actions_api', n; END IF;
END $$;

COMMIT;
