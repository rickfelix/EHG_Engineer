-- Migration: Gauge Finding Dispositions
-- SD: SD-LEO-INFRA-GAUGE-FINDING-KNOWN-STATE-ACK-001
-- Purpose: Durable "accepted-known-state" disposition surface for legitimately-known
--          gauge/governance findings (e.g. WAVE_LINKAGE_STARVATION), so the sourcing/
--          refill engine stops re-promoting an accepted-pending finding as a fresh SD
--          candidate on every cycle. A live disposition suppresses promotion until its
--          re_review_at date, then AUTO-EXPIRES via query-time filtering (no cleanup
--          job) so the finding resurfaces exactly once when the decision is due.
-- @chairman-gated: staged, not yet applied
-- Date: 2026-07-16

BEGIN;

-- ============================================================
-- 1. Table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gauge_finding_dispositions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable finding identity (the dedup key, NOT a row id) -- e.g. 'WAVE_LINKAGE_STARVATION'
  -- for single global gauge findings, or lib/shared/content-fingerprint.cjs's fingerprint()
  -- output for parameterized finding types.
  fingerprint      text NOT NULL,
  disposition      text NOT NULL DEFAULT 'accepted_known_state'
                     CHECK (disposition IN ('accepted_known_state')),
  re_review_at     timestamptz NOT NULL,
  reason           text NOT NULL,
  dispositioned_by text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- One LIVE disposition per fingerprint -- re-dispositioning the same finding upserts
  -- (refreshes re_review_at/reason) rather than accumulating duplicate rows.
  CONSTRAINT gauge_finding_dispositions_fingerprint_key UNIQUE (fingerprint)
);

COMMENT ON TABLE public.gauge_finding_dispositions IS
  'Coordinator-writable accepted-known-state disposition per finding fingerprint (SD-LEO-INFRA-GAUGE-FINDING-KNOWN-STATE-ACK-001). A live row (re_review_at in the future) suppresses sourcing/refill promotion for that fingerprint; the suppression auto-expires at re_review_at via query-time filtering in scripts/sourcing-engine/refill-cron.mjs -- never a permanent mute.';
COMMENT ON COLUMN public.gauge_finding_dispositions.fingerprint IS
  'Stable finding identity (dedup key), e.g. WAVE_LINKAGE_STARVATION. Matched against roadmap_wave_items.metadata.dedup_key by lib/sourcing-engine/refill-candidate-validity.js opts.acceptedFingerprintSet.';
COMMENT ON COLUMN public.gauge_finding_dispositions.re_review_at IS
  'Suppression expiry -- a disposition with re_review_at in the past is excluded from the live suppression Set on the next refill-cron run, so the finding promotes again exactly once.';

CREATE INDEX IF NOT EXISTS idx_gauge_finding_dispositions_re_review_at
  ON public.gauge_finding_dispositions (re_review_at);

-- ============================================================
-- 2. updated_at trigger (mirrors the repo's standard set-updated-at pattern)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_gauge_finding_dispositions_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gauge_finding_dispositions_updated_at ON public.gauge_finding_dispositions;
CREATE TRIGGER trg_gauge_finding_dispositions_updated_at
  BEFORE UPDATE ON public.gauge_finding_dispositions
  FOR EACH ROW EXECUTE FUNCTION public.set_gauge_finding_dispositions_updated_at();

-- ============================================================
-- 3. RLS -- enabled + service_role policy in the SAME migration
--    (SPINE-001-B anon-writable-table recurrence: an RLS-less table, even briefly,
--    is a blocking condition, not a follow-up.)
-- ============================================================
ALTER TABLE public.gauge_finding_dispositions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gauge_finding_dispositions_service_role ON public.gauge_finding_dispositions;
CREATE POLICY gauge_finding_dispositions_service_role
  ON public.gauge_finding_dispositions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- No authenticated/anon policy by design: dispositions are coordinator-authored and
-- read only by server-side sourcing/refill tooling, both running under service_role.
-- An anon/authenticated grant would let a non-coordinator actor suppress legitimate
-- findings -- least-privilege: service_role only.

COMMIT;
