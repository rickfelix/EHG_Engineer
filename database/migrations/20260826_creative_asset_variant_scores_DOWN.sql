-- DOWN migration for 20260826_creative_asset_variant_scores.sql
-- SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-C (FR-1) -- drop the asset<->variant scoring join.
--
-- ORDERING NOTE: if the chairman-gated companion
-- database/chairman-gated/20260826_creative_asset_variant_scores_rls_fix.sql has been applied,
-- run ITS paired _DOWN first. That file installs public.cavs_variant_matches_venture(uuid,uuid)
-- and the corrected cavs_venture_access policy that depends on it. Dropping the table here
-- removes the dependent policy but leaves the SECURITY DEFINER resolver orphaned in the
-- schema -- a stray SECURITY DEFINER function with no remaining caller. The DROP POLICY below
-- is IF EXISTS purely so this file stays runnable in either order; it is not a substitute for
-- the companion DOWN.

DROP POLICY IF EXISTS cavs_venture_access ON creative_asset_variant_scores;
DROP POLICY IF EXISTS cavs_service_role ON creative_asset_variant_scores;
DROP INDEX IF EXISTS creative_asset_variant_scores_variant_idx;
DROP INDEX IF EXISTS creative_asset_variant_scores_created_at_idx;
DROP TABLE IF EXISTS creative_asset_variant_scores;
