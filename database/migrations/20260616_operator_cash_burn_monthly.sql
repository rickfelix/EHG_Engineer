-- @approved-by: chairman-directed survivability cockpit (SD-EHG-OPERATOR-RUNWAY-SUBSTRATE-001)
-- SD: SD-EHG-OPERATOR-RUNWAY-SUBSTRATE-001
-- Additive (TIER-1): new operator-grain cash/burn snapshot table. No destructive DDL.
--
-- Operator-grain monthly cash/burn substrate for the distance-to-broke gauge.
-- CORE CONTRACT: every input is honest. A value column is NULL (unattested) when its
-- source has never fed it — NEVER 0. Each input carries its own *_last_synced_at so a
-- stale feed can be suppressed ('stale / not yet measurable') rather than shown as live.

CREATE TABLE IF NOT EXISTS public.operator_cash_burn_monthly (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month             date NOT NULL,                 -- first-of-month period key

  -- CASH (operator liquid cash on hand) — fed by the sibling cash/bank-feed SD (not this one)
  cash_usd                 numeric(14,2),                 -- NULL = unattested (no source yet)
  cash_last_synced_at      timestamptz,

  -- AI BURN (rolling-30d fleet AI spend) — fed hourly by this SD; ALWAYS a lower bound
  ai_burn_usd              numeric(14,2),                 -- NULL = unattested
  ai_burn_last_synced_at   timestamptz,
  ai_burn_is_lower_bound   boolean NOT NULL DEFAULT true, -- main-session Opus tokens uncaptured

  -- OTHER BURN (non-AI business expenses) — optional; NULL = unattested
  other_burn_usd           numeric(14,2),
  other_burn_last_synced_at timestamptz,

  -- REVENUE (auto-derived recurring revenue) — fed from income_capture_monthly
  revenue_usd              numeric(14,2),                 -- NULL = unattested
  revenue_last_synced_at   timestamptz,
  revenue_livemode         boolean,                       -- false = Stripe TEST-mode (not live income)

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT operator_cash_burn_period_unique UNIQUE (period_month),
  CONSTRAINT operator_cash_burn_first_of_month CHECK (date_trunc('month', period_month) = period_month)
);

CREATE INDEX IF NOT EXISTS idx_operator_cash_burn_period
  ON public.operator_cash_burn_monthly (period_month DESC);

ALTER TABLE public.operator_cash_burn_monthly ENABLE ROW LEVEL SECURITY;

-- RLS: service_role writes (feeds), authenticated reads (cockpit); anon write-revoked.
DROP POLICY IF EXISTS operator_cash_burn_service ON public.operator_cash_burn_monthly;
CREATE POLICY operator_cash_burn_service ON public.operator_cash_burn_monthly
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS operator_cash_burn_auth_read ON public.operator_cash_burn_monthly;
CREATE POLICY operator_cash_burn_auth_read ON public.operator_cash_burn_monthly
  FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.operator_cash_burn_monthly FROM anon, authenticated;
