-- DOWN migration for database/chairman-gated/20260816_defacl_anon_auth_axis.sql
-- SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE except to reverse a completed apply of
-- the paired UP migration above.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Restores PostgreSQL's built-in default (PUBLIC — and therefore every role — inherits EXECUTE on
-- newly created functions) for both target roles, by re-issuing the corresponding GRANT default.
-- This is the exact inverse of the UP file's two REVOKE statements: same two roles, same schema,
-- same privilege, same three grantees, GRANT instead of REVOKE. Nothing else in this database is
-- touched — existing functions' actual grants are governed by the separate, independent migration
-- database/chairman-gated/20260816_close_remaining_secdef_execute_exposure.sql and its own DOWN
-- file, not by this one.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, PUBLIC;

COMMIT;
