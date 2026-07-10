-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-STAGE0-ENVELOPE-REGISTRATION-001 (FR-1)
--
-- Additive-only: venture_capabilities has 0 rows today (zero blast radius). No aspirational
-- (undelivered) capability may be registered without a populated evidence citation -- a live
-- URL, an account ID, or a named provider integration -- so the envelope reflects delivered
-- reality, not intent.
--
-- Shape: {type: 'live_url'|'account_id'|'provider_integration', value: string,
--          verified_at: ISO8601 string, notes?: string}
-- Deliberately JSONB with a documented-but-not-DB-enforced shape so future evidence types
-- don't require another migration.

ALTER TABLE venture_capabilities
  ADD COLUMN IF NOT EXISTS evidence jsonb;

COMMENT ON COLUMN venture_capabilities.evidence IS
  'Delivery evidence citation ({type, value, verified_at, notes?}). Required for any row registered by SD-LEO-INFRA-STAGE0-ENVELOPE-REGISTRATION-001''s registration script -- no aspirational entries.';
