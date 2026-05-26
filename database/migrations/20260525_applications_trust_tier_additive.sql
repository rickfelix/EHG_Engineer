-- ============================================================================
-- Migration: 20260525_applications_trust_tier_additive.sql
-- SD: SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 (C2 / SECURITY VB-2) — ADDITIVE
-- Purpose: Add a trust_tier to the applications registry so the auto-merge path
--          (lib/ship/auto-merge.mjs) and future routing have a DB-backed SSOT for
--          which repos may be merged unattended vs. require a human gate.
-- Mode: IDEMPOTENT + ADDITIVE ONLY. Safe to re-run.
--
-- Tiers:
--   'platform' — EHG platform repos; eligible for unattended auto-merge.
--   'trusted'  — vetted internal repos that may auto-merge (none by default).
--   'external' — venture / third-party repos; auto-merge REFUSED, human merge required.
--
-- Note: auto-merge.mjs ALSO hard-codes the two platform repos as a fail-closed
--   default (defense-in-depth), so a missing/corrupt registry can never widen the
--   auto-merge surface beyond ehg + EHG_Engineer. This column is the broader SSOT.
-- ============================================================================

BEGIN;

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS trust_tier varchar(20) NOT NULL DEFAULT 'external';

-- Constraint added separately so re-runs don't error if it already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_applications_trust_tier'
  ) THEN
    ALTER TABLE public.applications
      ADD CONSTRAINT ck_applications_trust_tier
      CHECK (trust_tier IN ('platform','trusted','external'));
  END IF;
END $$;

-- Platform repos are the only unattended-auto-merge tier by default.
UPDATE public.applications
  SET trust_tier = 'platform'
  WHERE kind = 'platform' AND trust_tier <> 'platform';

-- Ventures default to 'external' (the column default already enforces this for
-- new rows); make existing venture rows explicit.
UPDATE public.applications
  SET trust_tier = 'external'
  WHERE kind = 'venture' AND trust_tier NOT IN ('external','trusted');

COMMENT ON COLUMN public.applications.trust_tier IS
  'auto-merge eligibility: platform=unattended OK, trusted=vetted internal, external=human merge required (venture/3rd-party). SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 C2/VB-2.';

COMMIT;

-- ============================================================================
-- ROLLBACK (manual, if needed):
--   ALTER TABLE public.applications DROP CONSTRAINT IF EXISTS ck_applications_trust_tier;
--   ALTER TABLE public.applications DROP COLUMN IF EXISTS trust_tier;
-- ============================================================================
