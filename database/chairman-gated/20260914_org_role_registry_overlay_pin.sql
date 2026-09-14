-- @chairman-gated
-- SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001 (FR-2, FR-3) -- org_role_venture_overlays and
-- org_role_venture_pins: the per-venture OVERLAY and PIN layers of the versioned role registry.
--
-- @approved-by: <PENDING -- chairman must add this line + a token before apply>
--   Chairman verification NOT yet obtained. Staged only, per R1 (ratification bb2175d2). Not
--   applied to any environment by this SD. See the companion base migration
--   (20260914_org_role_registry_base.sql) for the full provenance and design citation.
--   WHY chairman-gated: RLS policies + REVOKE/GRANT DO block land this in
--   scripts/lib/migration-tier-classifier.mjs's FORBIDDEN_TOPLEVEL set (TIER-2).
--
-- ============================================================================
-- WHY THESE TWO TABLES EXIST.
--
-- Design section 3.2: "each venture holds an OVERLAY (structure and function only); a venture
-- writes only its overlay, so clobbering is impossible by construction; each venture PINS base
-- vN + overlay vM; rollback is a repoint." This is the direct structural fix for the incident
-- SD-LEO-INFRA-STOP-ORG-ROLE-001 patched at the application layer: org_agent_roles is a single
-- global row per role_key with no venture dimension, so the LAST venture to instantiate
-- overwrote the title for EVERY other venture. Splitting into a base table (no venture_id column
-- at all, see the companion migration) and this venture-scoped overlay table makes that failure
-- mode structurally unreachable -- a venture's write statement has no column to even target a
-- shared row through.
--
-- org_role_venture_overlays deliberately has NO norms column (E1a): a venture overlay can only
-- ever describe structure and function, never obligations/permissions/prohibitions/budget.
--
-- org_role_venture_pins is the resolution layer: given a role_key and a venture_id, it names
-- exactly which base version and which (optional) overlay version apply. Repointing a venture to
-- an earlier base_version or overlay_version is the ENTIRE rollback mechanism -- a single-row
-- UPDATE on this table, never a mutation of the base or overlay data itself (FR-3, TS-3).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.org_role_venture_overlays (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  role_key     TEXT NOT NULL,
  venture_id   UUID NOT NULL REFERENCES public.ventures(id),
  version      INTEGER NOT NULL CHECK (version >= 1),
  status       TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('active', 'superseded', 'draft')),

  -- Structure and function ONLY -- no norms column exists on this table. A venture cannot write
  -- norms through this schema no matter what write path is used to reach it.
  structure    JSONB CHECK (structure IS NULL OR jsonb_typeof(structure) = 'object'),
  function     JSONB CHECK (function IS NULL OR jsonb_typeof(function) = 'object'),

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   TEXT NOT NULL,

  CONSTRAINT org_role_venture_overlays_role_key_nonempty CHECK (btrim(role_key) <> ''),
  CONSTRAINT org_role_venture_overlays_created_by_nonempty CHECK (btrim(created_by) <> ''),
  CONSTRAINT org_role_venture_overlays_has_content CHECK (structure IS NOT NULL OR function IS NOT NULL),
  UNIQUE (role_key, venture_id, version)
);

CREATE INDEX IF NOT EXISTS org_role_venture_overlays_venture_idx
  ON public.org_role_venture_overlays (venture_id, role_key);

CREATE TABLE IF NOT EXISTS public.org_role_venture_pins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  role_key        TEXT NOT NULL,
  venture_id      UUID NOT NULL REFERENCES public.ventures(id),

  base_version    INTEGER NOT NULL,
  -- Nullable: a venture with no overlay yet resolves purely from its pinned base version.
  overlay_version INTEGER,

  pinned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  pinned_by       TEXT NOT NULL,

  CONSTRAINT org_role_venture_pins_role_key_nonempty CHECK (btrim(role_key) <> ''),
  CONSTRAINT org_role_venture_pins_pinned_by_nonempty CHECK (btrim(pinned_by) <> ''),

  -- One pin per (role_key, venture_id) -- repointing UPDATEs this row, it never inserts a second.
  UNIQUE (role_key, venture_id),

  FOREIGN KEY (role_key, base_version)
    REFERENCES public.org_role_base_versions (role_key, version),

  FOREIGN KEY (role_key, venture_id, overlay_version)
    REFERENCES public.org_role_venture_overlays (role_key, venture_id, version)
);

CREATE INDEX IF NOT EXISTS org_role_venture_pins_venture_idx
  ON public.org_role_venture_pins (venture_id, role_key);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- POSTURE. Same threat model as the base migration and this repo's chairman-gated precedents.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.org_role_venture_overlays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_role_venture_pins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_role_venture_overlays_service_role ON public.org_role_venture_overlays;
CREATE POLICY org_role_venture_overlays_service_role
  ON public.org_role_venture_overlays
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS org_role_venture_pins_service_role ON public.org_role_venture_pins;
CREATE POLICY org_role_venture_pins_service_role
  ON public.org_role_venture_pins
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.org_role_venture_overlays FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.org_role_venture_pins FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.org_role_venture_overlays TO service_role;
GRANT ALL ON public.org_role_venture_pins TO service_role;

COMMENT ON TABLE public.org_role_venture_overlays IS
  'SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001 (FR-2). Per-venture OVERLAY -- structure and function '
  'only, NO norms column. A venture writes only its own overlay row; the base table '
  '(org_role_base_versions) has no venture_id column, so clobbering the shared base is '
  'structurally impossible (E1a).';

COMMENT ON TABLE public.org_role_venture_pins IS
  'SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001 (FR-3). Names, per (role_key, venture_id), exactly '
  'which base_version and (optional) overlay_version resolve for that venture. Repointing '
  'base_version/overlay_version to an earlier value IS the rollback mechanism -- a single-row '
  'UPDATE here, never a data mutation of the base or overlay tables themselves.';

COMMIT;
