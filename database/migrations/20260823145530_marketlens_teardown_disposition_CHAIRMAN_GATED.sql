-- SD-LEO-INFRA-VENTURE-KILL-CANCEL-001 FR-3 -- record the explicit teardown_disposition for
-- the live MarketLens Cloud Run zombie (venture id=ecbba50e-3c98-4493-9e77-1719cf6b6f00).
-- @chairman-gated
--
-- ⚠ THERE IS DELIBERATELY NO `-- @approved-by:` LINE IN THIS FILE.
--   This is a live-data UPDATE on a specific production row, which is unconditionally
--   TIER-2 per scripts/lib/migration-tier-classifier.mjs's FORBIDDEN_TOPLEVEL set (UPDATE
--   is forbidden top-level regardless of how narrowly scoped the WHERE clause is). The
--   builder that authored this file holds none of the 3-factor chairman-gate credentials
--   and MUST NOT forge the attestation. The chairman adds the `@approved-by` line and runs:
--       node scripts/apply-migration.js database/migrations/20260823145530_marketlens_teardown_disposition_CHAIRMAN_GATED.sql --prod-deploy
--   Observable proof of application:
--       SELECT teardown_disposition, teardown_disposition_reason FROM public.ventures
--       WHERE id = 'ecbba50e-3c98-4493-9e77-1719cf6b6f00';
--       -- Expected before: NULL, NULL. Expected after: 'pending_teardown', non-null reason.
--
-- Depends on: 20260823145041_ventures_teardown_disposition.sql (adds the teardown_disposition
-- columns this UPDATE writes to -- must be applied first).
--
-- Context: MarketLens (id=ecbba50e, killed 2026-07-08) was still serving HTTP 200 at its
-- Cloud Run URL 46 days later (probed live during LEAD Explore and PLAN VALIDATION passes,
-- 2026-08-23). It is the only real (non-demo) Cloud Run zombie of the 2 non-demo
-- terminal+deployed ventures (CronGenius is replit.dev, AltifyAI is Cloudflare Workers).
-- Actual gcloud teardown execution is deferred to a credentialed follow-up SD (no GCP admin
-- credentials exist in this repo/session per VALIDATION evidence bfd1beef) -- this migration
-- records the explicit, chairman-reviewable disposition only.
--
-- ⚠ NO EXPLICIT BEGIN/COMMIT. apply-migration.js already wraps the file in BEGIN/COMMIT.

UPDATE public.ventures
SET
  teardown_disposition = 'pending_teardown',
  teardown_disposition_reason = 'SD-LEO-INFRA-VENTURE-KILL-CANCEL-001: live Cloud Run zombie, probed HTTP 200 2026-08-23 (46 days after 2026-07-08 kill). Actual gcloud teardown deferred to a credentialed follow-up SD (no GCP admin credentials exist in this repo/session).',
  teardown_disposition_by = 'SD-LEO-INFRA-VENTURE-KILL-CANCEL-001',
  teardown_disposition_at = now()
WHERE id = 'ecbba50e-3c98-4493-9e77-1719cf6b6f00'
  AND teardown_disposition IS NULL;
