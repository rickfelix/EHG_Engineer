-- =============================================================================
-- Migration: cost_governor_log — durable decision log for the cost/token governor
-- SD: SD-LEO-INFRA-COST-TOKEN-GOVERNANCE-001 (FR-3)
-- Date: 2026-07-16
--
-- Additive only. Creates the durable record the ENFORCING cost governor writes on
-- every decision (regen throttle / down-tier / anomaly / threshold tune). This is the
-- shadow-data substrate that closed-loop self-tuning (FR-1d) and audit read from.
--
-- RLS + policy are authored in THIS SAME FILE (SPINE-001-B lesson: never split a table
-- create from its RLS enablement). Service-role only — the governor CLI/cron run under
-- the service key; no anon/authenticated access to cost-decision internals.
--
-- Rollback: DROP TABLE IF EXISTS public.cost_governor_log;  (no data migration to unwind)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cost_governor_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  decision_type text        NOT NULL CHECK (decision_type = ANY (ARRAY['regen','tier','anomaly','tune']::text[])),
  action        text        NOT NULL,
  target_key    text,
  mode          text        NOT NULL DEFAULT 'observe' CHECK (mode = ANY (ARRAY['observe','enforce']::text[])),
  measured      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  reason        text        NOT NULL DEFAULT '',
  thresholds    jsonb       NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.cost_governor_log IS
'Durable decision log for the cost/token governor (SD-LEO-INFRA-COST-TOKEN-GOVERNANCE-001).
One row per governor decision. decision_type: regen|tier|anomaly|tune. mode: observe (logged,
not enforced) | enforce (throttle/route actually applied). measured holds the numbers behind
the decision (count/window/threshold, spend/avg, etc). Read by the self-tuner + audit.';

CREATE INDEX IF NOT EXISTS idx_cost_governor_log_created_at
  ON public.cost_governor_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_governor_log_type_target
  ON public.cost_governor_log (decision_type, target_key);

-- RLS: service-role only (same file as the table create — SPINE-001-B).
ALTER TABLE public.cost_governor_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cost_governor_log_service_role ON public.cost_governor_log;
CREATE POLICY cost_governor_log_service_role
  ON public.cost_governor_log
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
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cost_governor_log'
  ) THEN
    RAISE EXCEPTION 'cost_governor_log was not created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'cost_governor_log' AND c.relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS not enabled on cost_governor_log';
  END IF;
END $$;
