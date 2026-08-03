-- SD-LEO-INFRA-COORDINATION-BUS-ACCESS-001 (FR-1)
-- Scope anon reads off the coordination bus.
--
-- ⚠️ STAGED, NOT APPLIED. chairman_gated_ddl=true, pre-flagged at sourcing. This directory is
-- outside all three auto-applied migration paths precisely so this file waits for a deliberate
-- human apply. The builder does not apply it. See database/chairman-gated/README.md.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT IS ACTUALLY WRONG (measured, not inherited)
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- An anon-key client reads the ENTIRE bus. Measured live 2026-08-03T03:59Z from one process with
-- two clients: service_role returned 5295 rows, anon returned 5295 rows — identical. That bus now
-- carries a fleet-control primitive (the enforcement kill-switch sentinel), so anyone holding the
-- anon key — a by-convention PUBLIC credential — can read every control message.
--
-- The single policy is named `service_role_full_access` and is actually
-- cmd=SELECT, roles={public}, qual=true. It is NEITHER service-role-scoped NOR full access. That
-- name is very likely why this survived audits: an operator scanning pg_policies on a sensitive
-- table reads "service_role_full_access" and moves on. The rename is therefore PART OF THE FIX,
-- not cosmetic — leaving a truthful policy beside a lying name rebuilds the blind spot.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- WHY THIS MIGRATION IS A DROP AND NOT A REPLACEMENT — read before "improving" it
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- The SD's scope says "replace the public-read policy with SEAT-SCOPED access — a session reads
-- rows it sends or receives". Authoring that predicate revealed it has NO PRINCIPAL TO APPLY TO:
--
--   1. service_role has rolbypassrls = TRUE (captured evidence, Delta 64b7328a). RLS policies are
--      NOT CONSULTED for it at all. So a policy granting service_role access is DECORATIVE — it
--      changes nothing, and its presence would imply a control that is not operating.
--   2. There is NO per-seat authentication in this system. Three Supabase keys exist (ANON,
--      SCHEMA_READER, SERVICE_ROLE) and all are SHARED; there is no sign-in flow for fleet seats.
--      A seat-scoped predicate for `authenticated` would key on an identity nothing ever presents.
--   3. Therefore every real reader is either service_role (bypasses RLS) or anon (the thing being
--      removed). A seat-scoped policy would be a rule that CAN NEVER FIRE, sitting in pg_policies
--      looking like protection. That is the exact defect class this SD exists to remove, and
--      shipping it inside the fix would be self-refuting.
--
-- So the honest change is: remove anon's ability to read, and add NOTHING that cannot fire.
-- Seat-scoping becomes meaningful only if per-seat credentials are introduced; that is a separate
-- SD and is called out in the PRD rather than pre-built here as dead protection.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- PRE-APPLY REQUIREMENT (do not skip — this IS the rollback plan)
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Capture the live policy state IMMEDIATELY BEFORE applying:
--
--   SELECT policyname, roles::text, cmd, qual, with_check
--     FROM pg_policies WHERE tablename = 'session_coordination';
--   SELECT relrowsecurity, relforcerowsecurity
--     FROM pg_class WHERE oid = 'public.session_coordination'::regclass;
--
-- NO `CREATE POLICY` for this table exists anywhere in git, so that capture is the ONLY rollback
-- source. The definition below was captured 2026-08-02 and is POINT-IN-TIME — it is a reference,
-- not a substitute for a fresh read.
--
-- Captured state as of 2026-08-02:
--   policy   : service_role_full_access | cmd=SELECT | roles={public} | qual=true
--   table    : rowsecurity=true, forcerowsecurity=false
--   grants   : anon holds SELECT, no INSERT
--   roles    : rolbypassrls = true for service_role only
--
-- ROLLBACK (restores the prior, deliberately-permissive state):
--   CREATE POLICY service_role_full_access ON public.session_coordination
--     FOR SELECT TO public USING (true);
--   GRANT SELECT ON public.session_coordination TO anon;
--
-- ════════════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- DROP + CREATE, never CREATE POLICY IF NOT EXISTS: that syntax is NOT valid PostgreSQL and fails
-- with "syntax error at or near NOT". This repo has already paid for that once — see
-- docs/retrospectives/lessons-learned-database-agent-rls-policy-chain.md (PAT-RLS-001).
DROP POLICY IF EXISTS service_role_full_access ON public.session_coordination;

-- Remove the grant as well as the policy. Anon needs BOTH a table GRANT and a permitting policy;
-- dropping only one leaves the other in place as a latent re-enable — the next permissive policy
-- added to this table would silently restore anon read access with nobody deciding to.
REVOKE SELECT ON public.session_coordination FROM anon;

-- Belt-and-braces: FORCE row security so a future table OWNER is also subject to policy, closing
-- the "owner quietly bypasses RLS" path. service_role is unaffected — rolbypassrls outranks this.
ALTER TABLE public.session_coordination FORCE ROW LEVEL SECURITY;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- POST-APPLY VERIFICATION — both halves are required
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Run the two-sided probe from the repo root. ANON must read 0-or-denied AND service_role must
-- still read the full count. Anon-denied alone could mean the table broke; service-full alone says
-- nothing about anon. Assert the RELATION, not a literal — the count was 5295 at 03:59Z and 5322
-- hours later, so a pinned number turns ordinary row growth into a false failure.
--
-- Then confirm a live seat still reads its own lanes by ROUND-TRIP: send one row, read it back.
-- An EMPTY inbox is a FAILURE, not a pass. FR-3 (shipped, c2bf834dda8) removed the anon fallback
-- that would otherwise have turned a credential failure into a silent empty read at exactly this
-- moment.
