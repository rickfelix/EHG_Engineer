-- DOWN migration for database/chairman-gated/20260816_defacl_anon_auth_axis.sql
-- SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE except to reverse a completed apply of
-- the paired UP migration above.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Restores PostgreSQL's built-in default (anon and authenticated inherit EXECUTE on newly created
-- functions) for the target role, by re-issuing the corresponding GRANT default.
--
-- REWORK (QF-20260817-193): postgres-only, matching the paired UP file's rework -- the original
-- two-role version's `FOR ROLE supabase_admin` clause is unapplyable from any credential this
-- house's ceremony process can hold (supabase_admin is Supabase-platform-reserved; see the UP
-- file's own REWORK section for the full reasoning). Dropped here for the same reason, not
-- independently -- this file must stay a true inverse of its paired UP file.
--
-- CORRECTED (SECURITY sub-agent, EXEC review, evidence 3bcccfb8-abf0-4a88-9751-c8e81e0bf120): this
-- file does NOT re-grant PUBLIC, and that is deliberate, not an oversight -- an earlier draft did
-- and was wrong. Live-measured pre-apply pg_default_acl for the postgres role carries NO empty-
-- grantee (PUBLIC) aclitem at all: `{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,
-- service_role=X/postgres}` -- three named grantees, never a bare `=X/<role>`. The UP file's own
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

COMMIT;
