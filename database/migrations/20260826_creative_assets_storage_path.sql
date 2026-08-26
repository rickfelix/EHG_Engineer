-- SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-A (FR-3) — adds the storage_path column that
-- lib/creative/creative-brief.js now populates via lib/creative/asset-storage.js
-- (lib/storage/private-signed-upload.js, public:false + createSignedUrl). This column holds a
-- PRIVATE storage path only — never a public URL or a long-lived signed URL — so a produced
-- asset is not externally reachable via this column alone. It complements, but does not
-- replace, the future HARD FENCE (child B) enforcing S23+S24 gating on read access.
--
-- Additive, no RLS change (creative_assets' existing RLS from 20260712_creative_assets.sql
-- already covers this new column) — self-applicable, not chairman-gated.

ALTER TABLE creative_assets ADD COLUMN IF NOT EXISTS storage_path TEXT;

COMMENT ON COLUMN creative_assets.storage_path IS
  'SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-A FR-3: private storage path (never a public/signed URL) for the generated asset bytes, written via lib/creative/asset-storage.js#persistAssetPrivately.';
