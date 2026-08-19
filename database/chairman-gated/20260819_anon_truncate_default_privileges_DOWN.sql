-- SD-LEO-INFRA-ANON-TRUNCATE-SWEEP-001 (FR-5) -- ROLLBACK companion
-- @approved-by:
--
-- Re-grants EXACTLY TRUNCATE-by-default to anon on the two postgres-owned defaults this SD's UP
-- file closed (public, storage) -- restoring the exact pre-UP default-ACL shape, never broader.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT TRUNCATE ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage
  GRANT TRUNCATE ON TABLES TO anon;

COMMIT;
