-- @approved-by:
-- SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001 — per-role default-ACL REVOKE, schema public, functions.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE except at the named ceremony.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AWAITING CHAIRMAN REVIEW — no @approved-by stamp exists for this file yet, deliberately (house
-- convention: never write an approval stamp until an approval actually happened). Anchored to
-- ceremony N+1 per this SD's metadata.migration_plan (anchor #6 in that list).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- THE MECHANISM THIS CLOSES — FUTURE-SCOPED ONLY (measured live 2026-08-16, LEAD phase, see
-- scripts/one-off/verify-defacl-anon-auth-axis-mechanism-001.mjs; re-confirmed EXEC phase via
-- .artifacts/defacl-full-census.json)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- pg_default_acl for schema public, objtype='f' (functions), grants EXECUTE to anon and
-- authenticated BY NAME for both roles that mint functions here (postgres, supabase_admin) — NOT
-- via a literal PUBLIC entry. Live-measured raw_acl for (postgres, public):
--   {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- and for (supabase_admin, public):
--   {postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}
-- Consequence: a REVOKE EXECUTE ... FROM PUBLIC-only ADP (the shape SD-LEO-INFRA-CLOSE-REMAINING-
-- SECURITY-001 originally scoped for its own descoped FR-4) removes a grant that was never there
-- and leaves the anon/authenticated defaults fully intact — every CREATE FUNCTION issued by either
-- role since then has inherited anon/authenticated EXECUTE by default, which is the recurrence
-- engine behind repeated SECDEF exposure findings on this database.
--
-- CRITICAL SCOPE NOTE (prospective TESTING sub-agent finding, PLAN phase, evidence row
-- d2d233ca-0c2c-4c5c-8982-5be923c28a61): ALTER DEFAULT PRIVILEGES is FUTURE-SCOPED ONLY. This
-- statement changes nothing about the 145 functions that already exist in public today — it only
-- changes what a function CREATEd by postgres/supabase_admin AFTER this applies will inherit. The
-- separate, already-triaged existing-function exposure (28 anon-EXEC / 18 literal-PUBLIC) is
-- closed by a DIFFERENT, already-staged migration:
--   database/chairman-gated/20260816_close_remaining_secdef_execute_exposure.sql
-- (SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001, completed, authoring done, ceremony-apply pending —
-- this SD does not re-author or duplicate that work). Applying THIS file alone does not revoke any
-- currently-anon-executable function; applying that OTHER file alone does not stop new functions
-- from being born anon/authenticated-executable. Both are required for full closure; they are
-- independent, non-overlapping, and safely apply in either order.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY PER-ROLE, NOT BARE PER-SCHEMA (TR-1 / the ADP-IN-SCHEMA=ADD-ONLY trap)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ...` with no FOR ROLE clause only affects
-- defaults for the role RUNNING this statement (the chairman's own connection role at apply
-- time) — it does NOT retroactively change postgres/supabase_admin's own default-ACL rows, and a
-- per-schema-only ADP is additive-only (cannot subtract an existing role-scoped grant). This is
-- the exact trap that caused SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001's original FR-4 to fail
-- identically across three independent fix attempts before being descoped. Both target roles are
-- named explicitly below with their own FOR ROLE clause.
--
-- Does NOT touch: service_role grants (unaffected — service_role keeps its default EXECUTE);
-- any function body; any already-existing function's grants (see the separate migration above).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- REVOKE ... FROM PUBLIC IS ALSO A NO-OP TODAY — KEPT FOR HYGIENE, NOT RESTORED BY THE DOWN FILE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- (SECURITY sub-agent, EXEC review, evidence 3bcccfb8-abf0-4a88-9751-c8e81e0bf120). The live
-- raw_acl strings quoted above name exactly three grantees each (postgres/supabase_admin,anon,
-- authenticated,service_role) — never a bare `=X/<role>` (which is how a literal-PUBLIC default-
-- ACL entry renders). So, same as this SD's entire premise about the PREDECESSOR migration's
-- PUBLIC-only REVOKE: revoking PUBLIC here removes a grant that isn't there. It is kept in this
-- statement only as forward-looking hygiene (so a literal-PUBLIC default can never silently
-- reappear), NOT because it changes today's state. Consequence for the paired DOWN file: it does
-- NOT re-grant PUBLIC — doing so would GRANT something this UP never actually revoked, leaving
-- post-DOWN state broader than pre-UP state. See that file's own header for the full reasoning.

BEGIN;

-- ACCESS EXCLUSIVE is not required for ALTER DEFAULT PRIVILEGES (it only mutates pg_default_acl
-- catalog rows, not any live object), but a bounded wait is still the house convention for every
-- statement in a chairman-gated transaction.
SET LOCAL lock_timeout = '5s';

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, PUBLIC;

-- No PostgREST schema-cache reload needed: default-ACL rows are not part of the exposed API
-- surface PostgREST introspects (they govern FUTURE objects, not any live route).

COMMIT;
