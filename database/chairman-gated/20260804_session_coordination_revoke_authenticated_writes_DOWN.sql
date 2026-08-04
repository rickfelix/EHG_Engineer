-- SD-LEO-INFRA-CONTROL-SURFACE-POSTURE-001 (FR-1) — ROLLBACK companion.
--
-- ⚠️ STAGED, NOT APPLIED. Same gate as its forward file. The builder does not apply this either.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- THIS IS GRANT-PRECISE ON PURPOSE
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- It restores EXACTLY the four privileges the forward file revoked — TRUNCATE, DELETE, INSERT,
-- UPDATE — and nothing else. It deliberately does NOT issue `GRANT ALL`, because a blanket
-- re-grant would silently hand `authenticated` any privilege it did not hold before (and would
-- mask, rather than reverse, whatever else had changed in the meantime).
--
-- PRE-CHANGE POSTURE THIS RESTORES (measured 2026-08-04, before the forward file):
--   authenticated : DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--
-- REFERENCES, SELECT and TRIGGER are NOT re-granted here because the forward file never touched
-- them. If they are missing at rollback time, something other than this migration removed them
-- and a blind re-grant here would paper over that.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- BEFORE ROLLING BACK — confirm you are reversing THIS change and not something else
-- ════════════════════════════════════════════════════════════════════════════════════════════
--   SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
--     FROM information_schema.role_table_grants
--    WHERE table_schema = 'public' AND table_name = 'session_coordination'
--    GROUP BY grantee ORDER BY grantee;
--
-- Expected before rollback: authenticated : REFERENCES,SELECT,TRIGGER
-- If authenticated already holds TRUNCATE/DELETE/INSERT/UPDATE, the forward file is not in
-- effect and this rollback is a no-op at best — STOP and find out why.
--
-- ⚠️ WHAT YOU ARE RE-OPENING: TRUNCATE is not gated by RLS. Restoring it returns an ungatable
-- destructive path on a 5000+ row fleet-control bus to every `authenticated` holder. Do this
-- only to reverse a demonstrated breakage, and prefer fixing forward.
-- ════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

GRANT TRUNCATE, DELETE, INSERT, UPDATE
   ON public.session_coordination
   TO authenticated;

DO $$
DECLARE
  restored text;
BEGIN
  SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) INTO restored
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name = 'session_coordination'
     AND grantee = 'authenticated'
     AND privilege_type IN ('TRUNCATE', 'DELETE', 'INSERT', 'UPDATE');

  IF restored IS DISTINCT FROM 'DELETE,INSERT,TRUNCATE,UPDATE' THEN
    RAISE EXCEPTION 'ROLLBACK POST-CONDITION FAILED: expected DELETE,INSERT,TRUNCATE,UPDATE restored, got %', COALESCE(restored, '(none)');
  END IF;

  RAISE NOTICE 'OK: the four write grants restored to authenticated. The ungatable TRUNCATE path is open again.';
END $$;

COMMIT;
