-- Narrows the switchon_auto_actions / switchon_decision_audit authenticated-read RLS
-- policies from an unconditional USING (true) to fn_is_chairman()-gated reads.
-- SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C follow-up.
--
-- WHY: these two tables are internal governance/audit trails (switch-on decision log,
-- rate/soak history), not tenant/customer data. Their original migrations
-- (20260718_switchon_auto_actions.sql, 20260718_switchon_decision_audit.sql) shipped an
-- authenticated_read SELECT policy with USING (true) -- correctly flagged by CI's
-- rls-anon-tenant-predicate-lint (unconditional_anon_select class: any logged-in user
-- can read every component's audit/rate history). The two migration FILES have already
-- been corrected in this same PR to declare fn_is_chairman() from the start (so a fresh
-- environment bootstrapping from migrations gets the restrictive predicate immediately);
-- THIS file is the live-DB correction for the environment where the original,
-- unrestricted policy was already TIER-1 auto-applied before the lint caught it.
--
-- TIER-2 (DROP POLICY / effectively ALTER POLICY) -- CHAIRMAN-GATED APPLY. Per RCA
-- (SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C completion investigation): the
-- original CREATE TABLE + ENABLE RLS + CREATE POLICY was legitimate TIER-1 auto-apply
-- (scripts/run-sql-migration.js, the database-agent's canonical execution path -- no
-- chairman ceremony required, per CLAUDE_CORE.md's own TIER-1 allow-list). But
-- NARROWING an already-live policy is DROP POLICY + CREATE POLICY, and DROP POLICY is a
-- TIER-2 forbidden top-level verb (scripts/lib/migration-tier-classifier.mjs) with no
-- additive-rewrite escape -- it requires the 3-factor chairman ceremony
-- (`node scripts/apply-migration.js <this-file> --prod-deploy`, after --issue-token,
-- with a `-- @approved-by: <email>` attestation line added below by the ceremony).
--
-- Do NOT auto-apply. Do NOT route through scripts/run-sql-migration.js (that would
-- execute it but bypass the chairman gate for an access-control change).
--
-- Fail-closed: RLS stays enabled throughout; DROP+CREATE in one transaction means no
-- observable window between the old and new predicate.

BEGIN;

DROP POLICY IF EXISTS switchon_auto_actions_authenticated_read ON public.switchon_auto_actions;
CREATE POLICY switchon_auto_actions_authenticated_read ON public.switchon_auto_actions
  FOR SELECT TO authenticated USING (fn_is_chairman());

DROP POLICY IF EXISTS switchon_decision_audit_authenticated_read ON public.switchon_decision_audit;
CREATE POLICY switchon_decision_audit_authenticated_read ON public.switchon_decision_audit
  FOR SELECT TO authenticated USING (fn_is_chairman());

COMMIT;
