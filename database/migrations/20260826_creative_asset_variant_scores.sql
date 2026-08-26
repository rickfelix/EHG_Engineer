-- SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C (FR-1) -- asset<->variant scoring join.
--
-- Links a produced creative_assets row to the marketing_content_variants row it is being
-- tested as, so lib/creative/variant-scoring-bridge.js can resolve a thompson-sampler.js
-- selection back to the originating asset. A join table, NOT a creative_assets.variant_id
-- column: marketing_content_variants.content_id is NOT NULL, so a bare FK would force
-- minting a synthetic marketing_content parent for every generated asset.
--
-- RLS is scoped through creative_assets.venture_id (a direct uuid NOT NULL column), which
-- is one hop; the marketing_content_variants side would need two.
--
-- TIER-1 CONSTRAINTS THIS FILE MUST HOLD (measured, DATABASE evidence
-- e4a15210-082f-49b1-a45e-2dbd3e121641 -- verify with classifyMigration() before merging):
--   * NO referential action clause anywhere. The classifier's whole-file FORBIDDEN_TOPLEVEL
--     sweep bans the bare token DELETE, which any ON DELETE clause necessarily contains.
--     KNOWN CONSEQUENCE (FR-9): these FKs are NO ACTION, so they block the ventures cascade
--     that delete_venture() relies on once this table holds rows. Teardown is an explicit,
--     separate, deliberately chairman-gated follow-up, not cascade. Do not "fix" this by
--     adding ON DELETE CASCADE -- it silently demotes the file to TIER-2 and it stops
--     auto-applying.
--   * NO "COMMENT ON TABLE" (only COMMENT ON COLUMN is allow-listed).
--   * NO partial index (a WHERE predicate on CREATE INDEX is TIER-2).
--
-- Rollback: paired 20260826_creative_asset_variant_scores_DOWN.sql drops the table.

CREATE TABLE IF NOT EXISTS creative_asset_variant_scores (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_asset_id UUID NOT NULL REFERENCES creative_assets(id),
  variant_id        UUID NOT NULL REFERENCES marketing_content_variants(id),
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (creative_asset_id, variant_id)
);

-- (creative_asset_id, variant_id) UNIQUE already provides a btree with creative_asset_id
-- leading, which serves both the RLS subquery and the FR-3 per-venture filter. Only the
-- variant_id side needs its own index (FR-2 joins daily_rollups on variant_id).
CREATE INDEX IF NOT EXISTS creative_asset_variant_scores_variant_idx
  ON creative_asset_variant_scores (variant_id);

-- FR-8 retention sweep scans by created_at.
CREATE INDEX IF NOT EXISTS creative_asset_variant_scores_created_at_idx
  ON creative_asset_variant_scores (created_at);

ALTER TABLE creative_asset_variant_scores ENABLE ROW LEVEL SECURITY;

-- Mirrors creative_assets_venture_access verbatim in shape, one hop further out. Follows the
-- creative_assets / user_company_access ownership model (NOT marketing_content_variants',
-- which uses ventures.created_by and is SELECT-only) because that is the table the scoping
-- actually traverses.
CREATE POLICY cavs_venture_access ON creative_asset_variant_scores
  FOR ALL TO authenticated
  USING (
    creative_asset_id IN (
      SELECT ca.id FROM creative_assets ca
      WHERE ca.venture_id IN (
        SELECT v.id FROM ventures v
        WHERE v.company_id IN (
          SELECT company_id FROM user_company_access WHERE user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY cavs_service_role ON creative_asset_variant_scores
  FOR ALL TO service_role
  USING (true);
