-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-STAGE0-ENVELOPE-REGISTRATION-001 (FR-1, addendum)
--
-- venture_capabilities.origin_venture_id was NOT NULL, forcing every registered
-- capability to be attributed to a specific venture -- but some capabilities are
-- genuinely PLATFORM-level (the org's Cloud Run deploy pipeline, Stripe test rail,
-- LLM client factory, Resend email integration): usable by any future venture, not
-- owned by one. The table already supports SD-only attribution via origin_sd_key
-- (no FK to ventures), so this NOT NULL was an oversight from an earlier
-- venture-only design, not an intentional invariant.
--
-- Additive-only: relaxes a constraint on a table with 0 rows (zero blast radius),
-- does not touch existing data or drop anything.

ALTER TABLE venture_capabilities
  ALTER COLUMN origin_venture_id DROP NOT NULL;

COMMENT ON COLUMN venture_capabilities.origin_venture_id IS
  'Which venture first proved this capability, if any. NULL for platform-level capabilities registered directly by an infra SD (see origin_sd_key) rather than originating from a specific venture build.';
