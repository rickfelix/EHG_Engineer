-- SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-D (FR-1) — creative engine satellite.
--
-- Creates the venture-scoped `creative_assets` table: the SSOT for generated creative
-- production (layered hero images, brand assets, short-form video) that VP_GROWTH consumes
-- for venture landing pages and demand-engine channel execution. Every row carries its
-- generation provenance (generator + prompt + brand-source refs + cost) so an asset is
-- always traceable to how it was made, and a nullable `consumed_at` that the FR-3
-- artifact-theater guard keys on (an asset with no consuming channel action within its plan
-- window is flagged, not counted — assets are execution inputs, never deliverables).
--
-- CHAIRMAN-GATED APPLY: this migration adds an RLS policy, so per the repo DDL-approval rule
-- it is NOT self-applicable by an autonomous worker. The fleet AUTHORS + TESTS it here; it is
-- applied to prod only via scripts/apply-migration.js --prod-deploy under the 3-factor guard
-- (flag + pre-issued MIGRATION_APPLY_TOKEN + `-- @approved-by: <chairman-email>` matching
-- git config user.email). metadata.requires_chairman_apply=true is set on the SD. Dependent
-- FR-1 code (lib/creative/) must fail soft (to_regclass existence check, never a head-count
-- probe) until this lands live. MERGED != LIVE — flag the apply step.
--
-- Additive + reversible: CREATE TABLE only; rollback = DROP TABLE creative_assets.
-- venture_id FK is ON DELETE CASCADE by design — a venture's creative assets are owned by that
-- venture and should not outlive it (unlike run/audit evidence, which is teardown-exempt).

CREATE TABLE IF NOT EXISTS creative_assets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id        UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  -- capability lane: image ships first; video is gated behind the FR-1 capability-envelope
  -- flag (a plan step requiring video fails at PLAN time until the video path is registered
  -- with delivery evidence) — the CHECK admits both, the flag governs which is drivable.
  capability        TEXT NOT NULL CHECK (capability IN ('image', 'video')),
  -- provenance (never trust the prompt's description of the pixels — the actual generator + inputs):
  generator         TEXT NOT NULL,                         -- provider name, e.g. 'runwayml' | 'gemini'
  prompt            TEXT,                                  -- the generation prompt actually sent
  brand_source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,    -- refs into S17 design-system artifacts
  cost              NUMERIC,                               -- per-asset cost, attributed to venture x role x activity
  provenance        JSONB NOT NULL DEFAULT '{}'::jsonb,    -- full generation provenance (model, params, task id, provider recipe)
  -- theater-guard seam (FR-3): set when a distribution_channel_config row references this asset
  -- as an EXECUTED channel action; NULL past the plan window => flagged by the sweep.
  consumed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Theater-guard sweep reads unconsumed assets per venture within a plan window — index both.
CREATE INDEX IF NOT EXISTS creative_assets_venture_idx      ON creative_assets (venture_id);
CREATE INDEX IF NOT EXISTS creative_assets_unconsumed_idx   ON creative_assets (venture_id, created_at) WHERE consumed_at IS NULL;

COMMENT ON TABLE  creative_assets                 IS 'SD-...-SPINE-001-D FR-1: venture-scoped generated creative assets (image/video) with generation provenance; consumed_at feeds the FR-3 artifact-theater guard.';
COMMENT ON COLUMN creative_assets.consumed_at     IS 'When a channel action referenced this asset (reach). NULL past the plan window => artifact-theater finding (reference != reach).';
COMMENT ON COLUMN creative_assets.brand_source_refs IS 'Refs into S17 design-system artifacts used as brand source (array of artifact ids/keys).';

-- Venture-scoped RLS (this is what makes the migration chairman-gated). Mirrors the canonical
-- venture-access pattern (20260704_marketlens_owned_audience_caps.sql vdc_venture_access):
-- authenticated users see only assets for ventures in companies they can access; the FR-1
-- generation service runs as service_role with full access.
ALTER TABLE creative_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY creative_assets_venture_access ON creative_assets
  FOR ALL TO authenticated
  USING (
    venture_id IN (
      SELECT v.id FROM ventures v
      WHERE v.company_id IN (
        SELECT company_id FROM user_company_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY creative_assets_service_role ON creative_assets
  FOR ALL TO service_role
  USING (true);
