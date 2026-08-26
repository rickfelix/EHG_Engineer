-- DOWN migration for 20260826_creative_asset_variant_scores.sql
-- SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C (FR-1) -- drop the asset<->variant scoring join.

DROP POLICY IF EXISTS cavs_venture_access ON creative_asset_variant_scores;
DROP POLICY IF EXISTS cavs_service_role ON creative_asset_variant_scores;
DROP INDEX IF EXISTS creative_asset_variant_scores_variant_idx;
DROP INDEX IF EXISTS creative_asset_variant_scores_created_at_idx;
DROP TABLE IF EXISTS creative_asset_variant_scores;
