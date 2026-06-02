-- SD-LEO-INFRA-PORTFOLIO-PRODUCT-KPI-001: product-KPI storage + RLS tightening (FR-3, FR-4).
-- Additive + idempotent. Adds a validated-KPI-subset column to venture_telemetry and tightens the
-- read policy off `anon USING(true)`, since the KPI subset is dashboard-exposed. Safe to run
-- alongside active sessions: one new NULLable-with-default column + a policy swap. No data loss.

-- FR-4: store the VALIDATED, allowlisted product-KPI subset (written by the pull consumer's
--       validateKpis()). Aggregates only — never PII/raw rows (enforced in code by the allowlist,
--       NOT by this column). KILL/SCALE + portfolio rollups DERIVE from these (deriveVenturePortfolio).
ALTER TABLE public.venture_telemetry
  ADD COLUMN IF NOT EXISTS kpis jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.venture_telemetry.kpis IS
  'SD-LEO-INFRA-PORTFOLIO-PRODUCT-KPI-001: validated, allowlisted product-KPI aggregates (signups/active_users/revenue/usage_volume/health/churn) extracted from /v1/metrics. Populated ONLY via scripts/venture-telemetry-pull.mjs validateKpis() — unknown/malformed keys are DROPPED before persistence. Aggregates only; never PII/raw rows. Feeds ventures portfolio columns via deriveVenturePortfolio().';

-- FR-3: tighten the read RLS. The prior policy granted anon+authenticated SELECT USING(true);
-- since whatever lands is dashboard-readable, an egress leak would be EXPOSED, not just stored.
-- Restrict SELECT to authenticated (chairman dashboard); service_role keeps ALL (the pull writer).
-- Remove anon read entirely.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='venture_telemetry' AND policyname='venture_telemetry_read') THEN
    DROP POLICY venture_telemetry_read ON public.venture_telemetry;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='venture_telemetry' AND policyname='venture_telemetry_read_authenticated') THEN
    CREATE POLICY venture_telemetry_read_authenticated ON public.venture_telemetry
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Rollback (manual):
--   ALTER TABLE public.venture_telemetry DROP COLUMN IF EXISTS kpis;
--   DROP POLICY IF EXISTS venture_telemetry_read_authenticated ON public.venture_telemetry;
--   CREATE POLICY venture_telemetry_read ON public.venture_telemetry FOR SELECT TO anon, authenticated USING (true);
