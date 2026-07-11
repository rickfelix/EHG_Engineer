-- SD-LEO-INFRA-SHIP-WITNESS-TRIO-001 (FR-3)
-- Create ship_escape_audit: a dual-key audit trail for admin-override merges
-- (the `gh pr merge --admin` bypass path already observed live via
-- attemptAutoMerge()'s adminUsed:true outcome, lib/ship/auto-merge.mjs).
--
-- requires-chairman-apply
--
-- WHY: retro 98e6619a (SD-LEO-INFRA-SHIP-WITNESS-ENFORCE-001) item #1: "Build
-- the escapeAuth DDL + dual-key audit substrate so P4 (protection integrity)
-- can move from permanently not_applicable to a genuinely evaluable rung."
-- ship-witness-enforcement.mjs's own header comment explicitly defers this:
-- "P4 (protection integrity) stays not_applicable pre-escapeAuth infra (not
-- built by this SD)." This migration builds that infra.
--
-- "Dual-key": every row REQUIRES two independent identifying keys -- the
-- merge identity (pr_number + repo) AND the actor identity (session_id) --
-- so an audit row can never exist without durably answering both "what was
-- bypassed" and "who bypassed it." Neither key alone is sufficient; both are
-- NOT NULL by design (not an app-level convention -- enforced by the schema).
--
-- Ordinary (non-admin-override) branch-protection detection is UNAFFECTED --
-- it already works via the existing checkProtection wiring in
-- evaluateP4ProtectionIntegrity(). This table is consulted ONLY for the
-- admin-override case (adminOverride=true), per lib/ship/merge-witness-ladder.mjs's
-- evaluateEscapeAuth().
--
-- APPLY (chairman-gated, requires_chairman_apply pre-flagged at sourcing):
--   node scripts/apply-migration.js database/migrations/20260711_ship_escape_audit.sql --prod-deploy
--   with the chairman @approved-by stamp per standing policy.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.ship_escape_audit;
--
-- @approved-by: codestreetlabs@gmail.com

BEGIN;

CREATE TABLE IF NOT EXISTS public.ship_escape_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_number integer NOT NULL,
  repo text NOT NULL,
  session_id text NOT NULL,
  reason text NOT NULL,
  merge_commit_sha text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ship_escape_audit IS
  'SD-LEO-INFRA-SHIP-WITNESS-TRIO-001 FR-3: dual-key audit trail for admin-override '
  '(--admin) merges. Every row requires BOTH the merge identity (pr_number, repo) AND '
  'the actor identity (session_id) -- neither key alone is sufficient. Consulted by '
  'evaluateP4ProtectionIntegrity()''s escapeAuth sub-field for the admin-override case only.';

CREATE INDEX IF NOT EXISTS idx_ship_escape_audit_pr ON public.ship_escape_audit (pr_number, repo);

ALTER TABLE public.ship_escape_audit ENABLE ROW LEVEL SECURITY;

-- service_role only (this is an internal harness audit trail, not user-facing data).
CREATE POLICY ship_escape_audit_service_role ON public.ship_escape_audit
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
