-- @chairman-gated
-- SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001 (FR-1) -- org_role_base_versions: the portfolio-level
-- BASE layer of the versioned role registry, replacing the developer-written JS constant
-- STANDARD_VENTURE_TEMPLATE (lib/agents/venture-ceo-factory.js:44) as the source of truth for
-- the 28 venture role templates.
--
-- @approved-by: <PENDING -- chairman must add this line + a token before apply>
--   Chairman verification NOT yet obtained. This file is staged only, per R1 (reserved chairman
--   decision, ratification bb2175d2): "new tables need the ceremony." This SD's own scope states
--   "the PLAN phase names the exact files and stops at the ceremony" -- this migration is that
--   naming. It is NOT applied to any environment by this SD.
--   WHY chairman-gated rather than database/migrations/: this file creates TRIGGERS (append-only
--   history plumbing lives in the companion migration 20260914_org_role_registry_change_log.sql,
--   but the RLS policy + REVOKE/GRANT DO block below and the only-one-active partial index put
--   this file's own DDL shape in scripts/lib/migration-tier-classifier.mjs's FORBIDDEN_TOPLEVEL
--   set too (DO blocks, GRANT/REVOKE) -- TIER-2, same classification as the two precedents below.
--
-- ============================================================================
-- WHY THIS TABLE EXISTS.
--
-- Chairman directive cba1573f (captured 2026-09-14): "the 28 role templates become
-- database-driven ... in the same way that we identify learnings and improve Adam and Solomon
-- ... We can maintain some history of the different versions we made." Diagnosis (feedback
-- ba5860af, MEASURED): STANDARD_VENTURE_TEMPLATE is a JS constant, identical for 656 of 660
-- ventures, with no version, no history, and -- via the SEPARATE org_agent_roles table -- a
-- global-singleton write path that a prior bug used to clobber 28 of 33 canonical titles with
-- per-venture test names (fixed by the dependency SD, SD-LEO-INFRA-STOP-ORG-ROLE-001).
--
-- Design (Solomon AI Agent Organization Architecture v2, feedback 20b858dc section 3.2): "A role
-- is versioned data in three layers. STRUCTURE (why, mandate, decision rights, KPIs, stage
-- ownership, reporting line), FUNCTION (named workflows, each with a trigger binding, required
-- inputs, skills, expected output, termination, receiver), NORMS (obligations, permissions,
-- prohibitions, budget, what the role may change about itself) -- norms are chairman-owned and
-- never agent-editable. The adopted roles become a portfolio BASE."
--
-- MODELLED ON: this repo's OWN leo_protocols precedent (database/schema/007_leo_protocol_schema.sql)
-- -- the exact pattern the chairman named as proof this works ("we have database versioning for
-- Adam Solomon Coordinator ... we need to do the same thing for the 28 role templates"). Same
-- only-one-active-per-key mechanism (a partial UNIQUE index, no trigger), same supersede-by-
-- two-UPDATEs function shape. DIFFERS in one load-bearing way: leo_protocols versions the WHOLE
-- protocol as one row; this table versions PER ROLE (role_key), because each of the 28 roles is
-- adopted, superseded, and rolled back independently -- a venture pins one base version PER ROLE,
-- not one version for the entire registry (see the companion overlay/pin migration).
--
-- norms is NOT writable by any venture-scoped path: this table has no venture_id column at all,
-- so a venture-context write to it is structurally impossible, not merely disallowed by
-- convention (E1a). Compare org_role_venture_overlays (companion migration), which has NO norms
-- column either, for the symmetric guarantee on the venture-write side.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.org_role_base_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  role_key      TEXT NOT NULL,
  version       INTEGER NOT NULL CHECK (version >= 1),
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('active', 'superseded', 'draft', 'deprecated')),

  -- Section 3.2 STRUCTURE: why, mandate, decision_rights, kpis, stage_ownership, reporting_line.
  structure     JSONB NOT NULL CHECK (jsonb_typeof(structure) = 'object'),

  -- Section 3.2 FUNCTION: { workflows: [{ trigger_binding, required_inputs, skills,
  -- expected_output, termination, receiver }] }.
  function      JSONB NOT NULL CHECK (jsonb_typeof(function) = 'object'),

  -- Section 3.2 NORMS: obligations, permissions, prohibitions, budget, self_change_scope.
  -- Chairman-owned. This column exists ONLY on this table -- no overlay or pin row can ever
  -- carry a norms value (E1a, structural).
  norms         JSONB NOT NULL CHECK (jsonb_typeof(norms) = 'object'),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    TEXT NOT NULL,

  superseded_by UUID REFERENCES public.org_role_base_versions(id),
  superseded_at TIMESTAMPTZ,

  CONSTRAINT org_role_base_versions_role_key_nonempty CHECK (btrim(role_key) <> ''),
  CONSTRAINT org_role_base_versions_created_by_nonempty CHECK (btrim(created_by) <> ''),
  CONSTRAINT org_role_base_versions_supersede_consistent CHECK (
    (superseded_by IS NULL AND superseded_at IS NULL)
    OR (superseded_by IS NOT NULL AND superseded_at IS NOT NULL)
  ),
  UNIQUE (role_key, version)
);

-- Only one ACTIVE version per role_key -- same mechanism as leo_protocols (a partial unique
-- index, not a trigger). A role with no active version is unadopted (draft-only) or fully
-- deprecated; instantiation must treat that as "no callable role," never fall back silently.
CREATE UNIQUE INDEX IF NOT EXISTS org_role_base_versions_one_active_idx
  ON public.org_role_base_versions (role_key)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS org_role_base_versions_role_key_idx
  ON public.org_role_base_versions (role_key);

-- Mirrors leo_protocols' supersede_leo_protocol(): two UPDATEs in one function, old row flips to
-- superseded + superseded_by/superseded_at, new row flips to active. No implicit version bump --
-- the caller supplies both version numbers explicitly, matching the precedent's own contract.
CREATE OR REPLACE FUNCTION public.supersede_org_role(
  p_role_key TEXT,
  p_old_version INTEGER,
  p_new_version INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
AS $supersede$
DECLARE
  v_new_id UUID;
BEGIN
  SELECT id INTO v_new_id
  FROM public.org_role_base_versions
  WHERE role_key = p_role_key AND version = p_new_version;

  IF v_new_id IS NULL THEN
    RAISE EXCEPTION 'supersede_org_role: role_key=% version=% does not exist -- create it before superseding', p_role_key, p_new_version;
  END IF;

  UPDATE public.org_role_base_versions
  SET status = 'superseded', superseded_by = v_new_id, superseded_at = now()
  WHERE role_key = p_role_key AND version = p_old_version AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'supersede_org_role: role_key=% version=% was not active -- nothing to supersede', p_role_key, p_old_version;
  END IF;

  UPDATE public.org_role_base_versions
  SET status = 'active'
  WHERE id = v_new_id;
END
$supersede$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- POSTURE. Same threat model as this repo's chairman-gated precedents: pg_default_acl grants
-- anon/authenticated arwdDxtm on every new public-schema table by default; RLS-with-no-policy
-- blocks rows but the grant itself still exists until revoked.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.org_role_base_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_role_base_versions_service_role ON public.org_role_base_versions;
CREATE POLICY org_role_base_versions_service_role
  ON public.org_role_base_versions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.org_role_base_versions FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.org_role_base_versions TO service_role;

COMMENT ON TABLE public.org_role_base_versions IS
  'SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001 (FR-1). Portfolio-level BASE layer of the versioned '
  'role registry -- structure/function/norms in three JSONB columns per role_key per version. '
  'norms is chairman-owned; this table has NO venture_id column, so a venture-scoped write to it '
  'is structurally impossible. Replaces STANDARD_VENTURE_TEMPLATE '
  '(lib/agents/venture-ceo-factory.js:44) as the eventual source of truth -- NOT wired to any '
  'caller by this SD (TR-2); instantiateVenture()/_getTemplate() are unchanged.';

COMMENT ON COLUMN public.org_role_base_versions.norms IS
  'Chairman-owned. Obligations, permissions, prohibitions, budget, self_change_scope. NEVER '
  'writable via a venture-scoped path -- see org_role_venture_overlays, which has no norms '
  'column at all.';

COMMIT;
