-- SD-LEO-INFRA-CONTROL-SURFACE-POSTURE-001 (FR-1)
-- Revoke the write-class grants held by `authenticated` on the fleet coordination bus.
--
-- ⚠️ STAGED, NOT APPLIED. chairman_gated_ddl=true, pre-flagged at sourcing. This directory is
-- outside all three auto-applied migration paths precisely so this file waits for a deliberate
-- human apply. The builder does not apply it — not even inside a rolled-back transaction.
-- See database/chairman-gated/README.md.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT IS ACTUALLY WRONG (measured 2026-08-04, not inherited)
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- MEASURED via information_schema.role_table_grants on public.session_coordination:
--
--   anon          : REFERENCES, SELECT, TRIGGER
--   authenticated : DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--   service_role  : full   <- OUT OF SCOPE, the workers' path, deliberately untouched
--   postgres      : full
--
-- MEASURED via pg_policy on the same table: RLS is ENABLED (relrowsecurity=true,
-- relforcerowsecurity=false) with EXACTLY ONE policy —
--   service_role_full_access : polcmd='r' (SELECT), PERMISSIVE, polroles=PUBLIC, USING (true)
--
-- TWO CONSEQUENCES, and the second is the one that motivates the wider revoke:
--
-- 1. TRUNCATE IS THE ONE WRITE-CLASS OPERATION RLS CANNOT GATE. It is not an RLS-checked
--    operation at all, so no policy on this table — however carefully written — can stop a role
--    holding the grant. That is exactly why the sourcing probe observed TRUNCATE SUCCEED against
--    an otherwise-blocking posture. This is the live exposure.
--
-- 2. DELETE / INSERT / UPDATE ARE DORMANT, NOT SAFE. They are currently denied because NO POLICY
--    COVERS THOSE COMMANDS — denial by absence, not by design. The moment anyone adds an INSERT
--    or UPDATE policy for `authenticated`, every one of those grants goes live in the same
--    instant, and nothing in the system would notice. That trigger condition is one somebody will
--    plausibly meet WHILE TRYING TO FIX SOMETHING ELSE.
--
--    An earlier draft of this SD scoped these three OUT as a follow-on. That was the weaker call,
--    and the correction is the coordinator's (reply 323019d9): their safety depends on a policy
--    nobody has been told is load-bearing. Revoking them costs nothing today and removes a trap
--    that is invisible precisely when it matters.
--
-- CORRECTION TO THE SD TEXT, recorded here because the file outlives the ticket: the SD as
-- sourced said "REVOKE TRUNCATE ... FROM anon, authenticated". ANON HOLDS NO TRUNCATE AND NO
-- WRITE GRANTS OF ANY KIND. The anon half was a no-op arising from a routing error, corrected at
-- source by the coordinator. Issuing an over-broad revoke would be harmless to execute and
-- harmful to read — it teaches the next person a wrong threat model. This file names
-- `authenticated` only.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES NOT DO
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- - Does NOT touch service_role or postgres. The fleet's own send/read path is out of scope.
-- - Does NOT create, alter or drop any policy. Grant-only.
-- - Does NOT touch anon. It holds nothing write-class to revoke.
-- - Does NOT resolve the file-vs-live drift on the 20260309 policy definition. That is disputed
--   between two captures and belongs with the pre-apply capture demanded by the sibling staged
--   file (20260803_session_coordination_scope_anon_reads.sql). Reauthoring from the wrong capture
--   restores the wrong grant.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- BEFORE APPLYING — capture the posture so the _DOWN is provably correct
-- ════════════════════════════════════════════════════════════════════════════════════════════
--   SELECT grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
--     FROM information_schema.role_table_grants
--    WHERE table_schema = 'public' AND table_name = 'session_coordination'
--    GROUP BY grantee ORDER BY grantee;
--
-- Expected at capture time (if this differs, STOP — the world moved and the _DOWN below is wrong):
--   authenticated : DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--
-- ════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

REVOKE TRUNCATE, DELETE, INSERT, UPDATE
    ON public.session_coordination
  FROM authenticated;

-- Post-conditions. These run INSIDE the transaction, so a failure rolls the whole thing back
-- rather than leaving a half-applied grant posture.
DO $$
DECLARE
  remaining text;
  still_reads boolean;
BEGIN
  -- 1. The four write grants are gone from authenticated.
  SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) INTO remaining
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name = 'session_coordination'
     AND grantee = 'authenticated'
     AND privilege_type IN ('TRUNCATE', 'DELETE', 'INSERT', 'UPDATE');
  IF remaining IS NOT NULL THEN
    RAISE EXCEPTION 'POST-CONDITION FAILED: authenticated still holds write grants: %', remaining;
  END IF;

  -- 2. authenticated CAN STILL READ. A revoke that removes the read path breaks the bus, which
  --    is worse than the exposure this file closes. Asserted, not assumed.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'session_coordination'
       AND grantee = 'authenticated' AND privilege_type = 'SELECT'
  ) INTO still_reads;
  IF NOT still_reads THEN
    RAISE EXCEPTION 'POST-CONDITION FAILED: authenticated lost SELECT — the read path was collateral damage';
  END IF;

  -- 3. service_role is untouched. Explicitly asserted because it is the workers' path and its
  --    loss would silence the entire fleet.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public' AND table_name = 'session_coordination'
       AND grantee = 'service_role' AND privilege_type = 'INSERT'
  ) THEN
    RAISE EXCEPTION 'POST-CONDITION FAILED: service_role lost INSERT — the fleet write path is broken';
  END IF;

  RAISE NOTICE 'OK: authenticated write grants revoked; SELECT retained; service_role untouched.';
END $$;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- AFTER APPLYING — the observable
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Re-run the capture query above. `authenticated` should read: REFERENCES,SELECT,TRIGGER.
-- That before/after difference is the only proof the ceremony ran; the file cannot self-apply.
--
-- Then run the two-sided acceptance (FR-2), which must show BOTH:
--   (a) TRUNCATE as authenticated is REFUSED, and
--   (b) the bus still works — service_role send/read succeeds and the anon SELECT path returns.
-- A run proving only (a) has not demonstrated the change was safe.
