-- SD-EHG-CONSOLE-ERROR-STATES-001 (console assessment ledger #6, P1)
-- MECHANISM (root-caused in-session): v_unified_capabilities is security_invoker=on
-- (PLATFORM-ENFORCED: the leo_enforce_view_security_invoker event trigger re-asserts
-- invoker-on for every view — a deliberate definer-view ban; do not fight it). The
-- authenticated chairman role was therefore evaluated against the BASE tables, where
-- exactly two gaps produced the ledger's 403/blank Capabilities tab:
--   1. agent_skills: RLS SELECT policy for authenticated EXISTS, but the table-level
--      SELECT GRANT was missing -> hard "permission denied" (the observed 403).
--   2. venture_capabilities: SELECT GRANT exists, but no authenticated SELECT policy
--      -> RLS filters every row (silent empty).
-- The other two base tables (agent_registry, strategic_directives_v2) already carry
-- both the grant and an authenticated SELECT policy.
--
-- FIX (minimal, platform-conformant — invoker stays ON):

GRANT SELECT ON public.agent_skills TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'venture_capabilities'
      AND policyname = 'authenticated_read_venture_capabilities'
  ) THEN
    CREATE POLICY authenticated_read_venture_capabilities
      ON public.venture_capabilities FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- The capability catalog is a chairman (authenticated) surface; anon SELECT on the
-- view was an over-grant. Idempotent.
REVOKE ALL ON public.v_unified_capabilities FROM anon;
