-- @chairman-gated: staged, not yet applied
-- SD: SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-E1
-- Additive (TIER-1): new venture-scoped cash/burn snapshot table. No destructive DDL,
-- no ALTER of any existing table. Disjoint from operator_cash_burn_monthly and
-- income_capture_monthly -- both remain fleet-wide singletons (UNIQUE(period_month[,
-- livemode])) with no venture_id/source_application scoping, and neither is touched by
-- this migration or by the writer that feeds this table.
--
-- Shared, multi-venture burn ledger for the "instrument venture operating cost" pattern
-- (parent SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-E). Keyed by (venture_id,
-- source_application, period_month) so any venture (ApexNiche AI first; MarketLens and
-- future ventures later) onboards onto the SAME table rather than a per-venture silo.
--
-- CORE CONTRACT (mirrors lib/operator/cash-burn-substrate.js): a value column is NULL
-- (unattested) when its source has never fed it -- NEVER a fabricated 0. ai_cost_status
-- defaults to 'unattested' because, as of this SD's authoring, no venture in this table
-- has AI-calling code routed through a Cloudflare AI Gateway yet -- the honest starting
-- state, not an error condition.

CREATE TABLE IF NOT EXISTS public.venture_operating_burn (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id                  uuid NOT NULL,
  source_application          text NOT NULL,                -- e.g. 'apex_niche_ai', set server-side by the writer only
  period_month                date NOT NULL,                 -- first-of-month period key

  -- INFRA BURN (Cloudflare Workers/D1/R2 usage-derived cost) — buildable now
  infra_cost_usd              numeric(14,2),                 -- NULL = unattested (no source yet)
  infra_cost_last_synced_at   timestamptz,

  -- AI BURN (LLM/AI provider cost via Cloudflare AI Gateway) — honest until a gateway exists
  ai_cost_usd                 numeric(14,2),                 -- NULL = unattested
  ai_cost_status               text NOT NULL DEFAULT 'unattested'
                                 CHECK (ai_cost_status IN ('unattested', 'measured')),
  ai_cost_last_synced_at      timestamptz,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT venture_operating_burn_period_unique UNIQUE (venture_id, source_application, period_month),
  CONSTRAINT venture_operating_burn_first_of_month CHECK (date_trunc('month', period_month) = period_month)
);

CREATE INDEX IF NOT EXISTS idx_venture_operating_burn_period
  ON public.venture_operating_burn (period_month DESC);

CREATE INDEX IF NOT EXISTS idx_venture_operating_burn_venture
  ON public.venture_operating_burn (venture_id, source_application);

ALTER TABLE public.venture_operating_burn ENABLE ROW LEVEL SECURITY;

-- RLS: service_role writes (the platform-side feeder only), authenticated reads (future
-- dashboards); anon write-revoked. No venture app is ever granted a write path here --
-- ApexNiche AI (Cloudflare Workers/D1/R2, CD30) has no Supabase client at all.
DROP POLICY IF EXISTS venture_operating_burn_service ON public.venture_operating_burn;
CREATE POLICY venture_operating_burn_service ON public.venture_operating_burn
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS venture_operating_burn_auth_read ON public.venture_operating_burn;
CREATE POLICY venture_operating_burn_auth_read ON public.venture_operating_burn
  FOR SELECT TO authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.venture_operating_burn FROM anon, authenticated;

-- ROLLBACK: DROP TABLE public.venture_operating_burn; (no data to preserve pre-apply)
