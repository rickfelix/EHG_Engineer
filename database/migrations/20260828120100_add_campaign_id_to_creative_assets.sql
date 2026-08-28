-- Add a nullable campaign_id uuid column to creative_assets so sibling variants
-- from one generation run (e.g. RunwayVideoService) can be grouped by a typed
-- uuid instead of the current unvalidated `campaign-${Date.now()}` string format.
--
-- SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-D (FR-3 / US-003).
--
-- Deliberately a typed uuid column, NOT jsonb provenance and NOT a new campaigns
-- table (DATABASE sub-agent recommendation): jsonb would silently accept the
-- current non-UUID string-id format this SD exists to remove, and a new table
-- would add another RLS tenant-scoping surface. Additive, nullable, no backfill,
-- no default -- existing rows and existing queries are unaffected.
--
-- Idempotent by construction (IF NOT EXISTS guards).

ALTER TABLE public.creative_assets
  ADD COLUMN IF NOT EXISTS campaign_id UUID;

CREATE INDEX IF NOT EXISTS idx_creative_assets_campaign_id
  ON public.creative_assets (campaign_id)
  WHERE campaign_id IS NOT NULL;

COMMENT ON COLUMN public.creative_assets.campaign_id IS
  'Groups sibling variants produced by one generation run (e.g. RunwayVideoService). Nullable; NULL for assets not part of a multi-variant generation run. SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-D.';
