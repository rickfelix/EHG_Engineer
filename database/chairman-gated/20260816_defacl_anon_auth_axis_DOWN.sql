-- DOWN migration for database/chairman-gated/20260816_defacl_anon_auth_axis.sql
-- SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE except to reverse a completed apply of
-- the paired UP migration above.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Restores PostgreSQL's built-in default (anon and authenticated inherit EXECUTE on newly created
-- functions) for both target roles, by re-issuing the corresponding GRANT default.
--
-- CORRECTED (SECURITY sub-agent, EXEC review, evidence 3bcccfb8-abf0-4a88-9751-c8e81e0bf120): this
-- file does NOT re-grant PUBLIC, and that is deliberate, not an oversight -- an earlier draft did
-- and was wrong. Live-measured pre-apply pg_default_acl for both roles carries NO empty-grantee
-- (PUBLIC) aclitem at all: `{postgres=X/<role>,anon=X/<role>,authenticated=X/<role>,
-- service_role=X/<role>}` -- three named grantees, never a bare `=X/<role>`. The UP file's own
-- `REVOKE ... FROM PUBLIC` is therefore ALSO a no-op on the live pre-apply state (nothing to
-- revoke) -- kept there only as forward-looking hygiene against a literal-PUBLIC entry ever being
-- added later, exactly the same asymmetry this SD's whole premise documents for the ANON/
-- AUTHENTICATED axis of the PREDECESSOR migration. A DOWN file re-granting PUBLIC here would GRANT
-- something that was never revoked from the true baseline, leaving post-DOWN state strictly
-- BROADER than pre-UP state: every role that inherits PUBLIC's default (dashboard_user,
-- authenticator, pgbouncer, any future role) would gain default EXECUTE it never had. This file
-- restores EXACTLY anon and authenticated -- the two grantees the pre-apply catalog actually shows
-- -- and nothing more. Existing functions' actual grants are governed by the separate, independent
-- migration database/chairman-gated/20260816_close_remaining_secdef_execute_exposure.sql and its
-- own DOWN file, not by this one.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;

COMMIT;
