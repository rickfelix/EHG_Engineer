-- ROLLBACK for 20260823_eva_stage_gate_attempts.sql (SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001)
--
-- @approved-by: PENDING — same ceremony as the UP file.
--
-- Purely additive UP file (new table, new functions, new trigger) means the DOWN is a clean
-- drop with no data-preservation obligation to any OTHER table — eva_stage_gate_results is never
-- touched by either direction. Dropping the table drops its indexes, constraints, trigger, and RLS
-- policy automatically; the two functions and the trigger function are dropped explicitly since
-- they are separate catalog objects.

BEGIN;

DROP TRIGGER IF EXISTS eva_stage_gate_attempts_no_update_after_final ON public.eva_stage_gate_attempts;
DROP FUNCTION IF EXISTS public.eva_stage_gate_attempts_freeze();
DROP FUNCTION IF EXISTS public.open_eva_gate_attempt(UUID, INTEGER, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.finalize_eva_gate_attempt(UUID, TEXT, BOOLEAN, TEXT, JSONB, JSONB);
DROP TABLE IF EXISTS public.eva_stage_gate_attempts;

DO $verify$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'eva_stage_gate_attempts') THEN
    RAISE EXCEPTION 'eva_stage_gate_attempts_DOWN: table still exists after DROP';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname IN ('open_eva_gate_attempt', 'finalize_eva_gate_attempt', 'eva_stage_gate_attempts_freeze')) THEN
    RAISE EXCEPTION 'eva_stage_gate_attempts_DOWN: one or more functions still exist after DROP';
  END IF;
  -- Sibling table is never touched by this SD in either direction — assert row count is stable
  -- as a scope guard, not a functional requirement of this rollback.
  IF NOT EXISTS (SELECT 1 FROM public.eva_stage_gate_results LIMIT 1) THEN
    RAISE NOTICE 'eva_stage_gate_results is empty — scope-guard check skipped (table exists, just no rows)';
  END IF;
END
$verify$;

COMMIT;

-- APPLY:
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token> node scripts/apply-migration.js \
--     "database/chairman-gated/20260823_eva_stage_gate_attempts_DOWN.sql" \
--     --prod-deploy --allow-any-path
