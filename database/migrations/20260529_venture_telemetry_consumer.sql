-- SD-LEO-INFRA-VENTURE-TELEMETRY-PULL-001-C: EHG-side venture telemetry consumer (Layer 2).
-- Additive + idempotent. Creates the venture_telemetry rollup table and adds the per-venture
-- metrics endpoint + read-key REFERENCE columns to applications. EHG PULLS aggregated rollups
-- from each venture's GET /v1/metrics (one-way) — it never writes into a venture DB.
-- Safe to run alongside active sessions: only new objects + new NULLable columns.

-- 1) applications: per-venture metrics endpoint + read-key REFERENCE.
--    D5 — metrics_api_key_ref stores the NAME of an env var / secret, NEVER the raw key.
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS metrics_base_url text,
  ADD COLUMN IF NOT EXISTS metrics_api_key_ref text;

COMMENT ON COLUMN public.applications.metrics_base_url IS
  'Base URL of the venture''s authenticated GET /v1/metrics endpoint (e.g. https://crongenius.<acct>.workers.dev). NULL => the daily telemetry pull skips this venture.';
COMMENT ON COLUMN public.applications.metrics_api_key_ref IS
  'D5: NAME of the env var / secret holding the venture read key (NOT the raw secret). The pull job resolves it at runtime via process.env[metrics_api_key_ref]. Rotation = update the secret value; this reference is unchanged.';

-- 2) venture_telemetry: one upserted current-rollup row per venture, mirroring the
--    /v1/metrics MetricsAggregate contract + ingest metadata. KILL/SCALE is DERIVED from
--    these fields in the chairman dashboard (not stored as invented percents).
CREATE TABLE IF NOT EXISTS public.venture_telemetry (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  venture_id      uuid REFERENCES public.ventures(id) ON DELETE SET NULL,
  -- contract (mirrors the producer MetricsAggregate)
  contract_version text,
  window_days     integer,
  since           timestamptz,
  generated_at    timestamptz,
  total           integer NOT NULL DEFAULT 0,
  by_verdict      jsonb   NOT NULL DEFAULT '{}'::jsonb,
  by_mode         jsonb   NOT NULL DEFAULT '{}'::jsonb,
  by_model        jsonb   NOT NULL DEFAULT '{}'::jsonb,
  avg_confidence  numeric,
  dry_run_count   integer,
  raw_payload     jsonb,   -- full response, for forward-compat with additive contract fields
  -- ingest metadata
  source_url      text,
  http_status     integer,
  ingest_status   text NOT NULL DEFAULT 'ok'
                    CHECK (ingest_status IN ('ok','skipped','version_mismatch','error')),
  ingest_note     text,
  pulled_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_venture_telemetry_application UNIQUE (application_id)
);

CREATE INDEX IF NOT EXISTS idx_venture_telemetry_application_id ON public.venture_telemetry(application_id);
CREATE INDEX IF NOT EXISTS idx_venture_telemetry_pulled_at     ON public.venture_telemetry(pulled_at DESC);

-- 3) RLS: service-role writes (the pull job); anon/authenticated read (chairman dashboard).
--    Aggregates only — no raw venture input/output is ever pulled or stored.
ALTER TABLE public.venture_telemetry ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='venture_telemetry' AND policyname='venture_telemetry_service_all') THEN
    CREATE POLICY venture_telemetry_service_all ON public.venture_telemetry
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='venture_telemetry' AND policyname='venture_telemetry_read') THEN
    CREATE POLICY venture_telemetry_read ON public.venture_telemetry
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

-- Rollback (manual):
--   DROP TABLE IF EXISTS public.venture_telemetry;
--   ALTER TABLE public.applications DROP COLUMN IF EXISTS metrics_base_url, DROP COLUMN IF EXISTS metrics_api_key_ref;
