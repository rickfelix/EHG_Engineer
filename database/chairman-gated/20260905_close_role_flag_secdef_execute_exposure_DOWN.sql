-- Rollback for 20260905_close_role_flag_secdef_execute_exposure.sql.
-- SD: SD-LEO-INFRA-CLOSE-ANON-EXECUTE-001
--
-- All seven functions carried NO explicit REVOKE/GRANT before the forward migration (PostgreSQL's
-- default PUBLIC EXECUTE grant applied to each). This restores that default -- PUBLIC (which
-- anon/authenticated inherit) EXECUTE -- on every one of the seven that exists at rollback time,
-- using the same to_regprocedure() existence guard as the forward migration.
--
-- @approved-by:
--   ^ INTENTIONALLY BLANK, same chairman-gate discipline as the forward migration.

BEGIN;

DO $restore_grant$
DECLARE
  targets text[] := ARRAY[
    'public.set_solomon_flag(text)', 'public.clear_solomon_flag(text)',
    'public.set_coordinator_flag(text)', 'public.clear_coordinator_flag(text)',
    'public.set_adam_flag(text)', 'public.clear_adam_flag(text)',
    'public.set_session_awaiting_approval(text, boolean)'
  ];
  fn text;
BEGIN
  FOREACH fn IN ARRAY targets
  LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', fn);
    END IF;
  END LOOP;
END;
$restore_grant$;

COMMIT;
