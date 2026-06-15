-- @approved-by: codestreetlabs@gmail.com
-- Attestation: chairman confirmed in-session (AskUserQuestion, session 7c76f0db) under
-- SD-LEO-INFRA-MIGRATION-DEPLOY-DRIFT-001 to apply the genuine deploy-drift gaps. This
-- closes a genuine live security hole surfaced by the SD's adversarial review.
--
-- SD-LEO-INFRA-MIGRATION-DEPLOY-DRIFT-001 — close the 3 always-true PUBLIC INSERT
-- policies that drifted onto the append-only audit ledgers AFTER the 2026-06-03
-- rls_policy_always_true tightening (20260603_04). These are PERMISSIVE FOR INSERT
-- WITH CHECK (true) to PUBLIC on RLS-enabled tables, i.e. the anon key can insert
-- arbitrary rows into the bypass audit ledger, the contract-chain integrity log, and
-- the goal-evaluator verdict log — the exact rls_policy_always_true class this SD's
-- deploy-drift charter exists to catch.
--
-- SAFE: all three are append-only ledgers written by the server via the service_role
-- key, which BYPASSES RLS (relrowsecurity=true, relforcerowsecurity=false) — so dropping
-- the PUBLIC INSERT policy does not affect the legitimate writer. There is no live
-- anon/authenticated INSERT path to these tables (bypass_ledger ← service_role only;
-- contract_chain_links / goal_evaluator_verdicts have only SELECT-side readers). The
-- companion FOR SELECT USING(true) read policies are intentionally left intact.
--
-- We DROP rather than re-run the historical 20260603_04 transform (a one-time, dynamic-
-- predicate remediation); this names the exact 3 policies for auditability.

DROP POLICY IF EXISTS bypass_ledger_insert_only ON public.bypass_ledger;
DROP POLICY IF EXISTS contract_chain_links_insert_only ON public.contract_chain_links;
DROP POLICY IF EXISTS goal_evaluator_verdicts_insert_only ON public.goal_evaluator_verdicts;

-- Verify: 0 permissive always-true non-SELECT non-service_role policies remain on these 3.
DO $verify$
DECLARE
  v_bad INTEGER;
BEGIN
  SELECT count(*) INTO v_bad
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('bypass_ledger', 'contract_chain_links', 'goal_evaluator_verdicts')
    AND pol.polpermissive
    AND pol.polcmd <> 'r'
    AND (pg_get_expr(pol.polqual, pol.polrelid) = 'true'
         OR pg_get_expr(pol.polwithcheck, pol.polrelid) = 'true')
    AND NOT (pol.polroles <> '{0}'
             AND (SELECT bool_and(rolname = 'service_role') FROM pg_roles WHERE oid = ANY(pol.polroles)));
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'NOT cleared: % always-true write policy(ies) remain on the 3 audit ledgers', v_bad;
  END IF;
  RAISE NOTICE 'CLEARED: 0 always-true PUBLIC write policies remain on bypass_ledger / contract_chain_links / goal_evaluator_verdicts.';
END
$verify$;
