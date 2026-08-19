-- SD-LEO-INFRA-ANON-TRUNCATE-SWEEP-001 (FR-6) -- ROLLBACK companion
-- @approved-by:
--
-- Re-grants EXACTLY TRUNCATE to authenticated on the parent public.security_audit_events --
-- restoring the exact pre-UP state (does not touch individual partitions, which never held the
-- grant directly and are not touched by the UP file either).

BEGIN;

SET LOCAL lock_timeout = '5s';

GRANT TRUNCATE ON public.security_audit_events TO authenticated;

COMMIT;
