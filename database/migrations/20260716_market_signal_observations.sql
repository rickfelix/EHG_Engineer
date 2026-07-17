-- =============================================================================
-- Migration: market_signal_observations — attested-provenance raw observation store
-- SD: SD-LEO-INFRA-MARKET-SIGNAL-SCANNER-001 (FR-1)
-- Date: 2026-07-16
--
-- Additive only. Home for the raw observation tuples every market-signal-scanner
-- source fetcher writes (source, raw_value, source_url, content_hash, fetched_at,
-- transform_version) per the design doc's attested-provenance rule -- a score that
-- cannot be recomputed from stored raw observations is invalid. Fetchers also
-- query this table's history (same source/query_term/family, trailing 12 months)
-- to compute each family's 90d-vs-baseline slope; a first-ever call for a
-- (source, query_term) has no baseline and returns slope_90d_vs_baseline: null.
--
-- RLS + policy are authored in THIS SAME FILE (SPINE-001-B lesson: never split a
-- table create from its RLS enablement). Service-role only -- the scanner CLI/cron
-- runs under the service key; no anon/authenticated access.
--
-- Rollback: DROP TABLE IF EXISTS public.market_signal_observations;  (no data migration to unwind)
-- =============================================================================

-- NOTE: unqualified table name (resolves to public via search_path) -- matches the
-- convention in 20260716_cost_governor_log.sql so the D8 operator-contract gate's
-- diff parser (which stops at '.') keys the operator triple correctly.
CREATE TABLE IF NOT EXISTS market_signal_observations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source            text        NOT NULL,
  query_term        text        NOT NULL,
  family            text        NOT NULL CHECK (family = ANY (ARRAY['money_in','stickiness','structural','attention']::text[])),
  raw_value         jsonb       NOT NULL,
  content_hash      text        NOT NULL,
  fetched_at        timestamptz NOT NULL,
  transform_version text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.market_signal_observations IS
'Attested-provenance raw observations for the market-signal-scanner (SD-LEO-INFRA-MARKET-SIGNAL-SCANNER-001).
One row per (source, query_term, family) reading per fetch cycle. raw_value is the untransformed
value backing the reading; content_hash is a sha256 of the raw API response text. Queried by each
source fetcher to compute slope_90d_vs_baseline (trailing-90d average vs 12-month baseline average);
no prior rows for a (source, query_term) means no baseline yet -> null slope, not zero/negative.';

CREATE INDEX IF NOT EXISTS idx_market_signal_observations_lookup
  ON public.market_signal_observations (source, query_term, family, fetched_at);

-- RLS: service-role only (same file as the table create -- SPINE-001-B).
ALTER TABLE public.market_signal_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_signal_observations_service_role ON public.market_signal_observations;
CREATE POLICY market_signal_observations_service_role
  ON public.market_signal_observations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Self-verification (advisory; safe to re-run).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'market_signal_observations'
  ) THEN
    RAISE EXCEPTION 'market_signal_observations was not created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'market_signal_observations' AND c.relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS not enabled on market_signal_observations';
  END IF;
END $$;
