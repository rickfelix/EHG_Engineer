-- =============================================================================
-- Migration: market_signal_scanner_budget — scanner-scoped FinOps ceiling
-- SD: SD-LEO-INFRA-MARKET-SIGNAL-SCANNER-001 (FR-5)
-- Date: 2026-07-16
-- @approved-by: codestreetlabs@gmail.com
--
-- Additive only. Home for the market-signal-scanner's monthly FinOps cap
-- ($25/mo default), read/written by lib/market-signal-scanner/budget-guard.js
-- (checkBudget/recordSpend/getBudgetSummary). Deliberately a NEW, small,
-- scanner-scoped table -- NOT a reuse of the marketing domain's
-- channel_budgets table (venture_id/platform-keyed, daily-stop-loss shape
-- this scanner doesn't need) nor agent_budgets (agent_id-keyed, FK'd to
-- agent_registry -- wrong coupling for a single shared periodic process)
-- nor cost_governor_log (a decision log, not a cap/spent tracking row, and
-- currently STAGED/chairman-gated for an unrelated governor).
--
-- One row per calendar month (month_key e.g. '2026-07'), unique. The guard
-- auto-provisions a row at the default cap on first read/write of a new
-- month rather than blocking outright -- see budget-guard.js's file-header
-- comment for the documented fail-closed-vs-auto-provision rationale.
--
-- RLS + policy are authored in THIS SAME FILE (SPINE-001-B lesson: never
-- split a table create from its RLS enablement). Service-role only -- the
-- scanner CLI/cron runs under the service key; no anon/authenticated access.
--
-- Rollback: DROP TABLE IF EXISTS public.market_signal_scanner_budget;  (no data migration to unwind)
-- =============================================================================

-- NOTE: unqualified table name (resolves to public via search_path) -- matches
-- the convention in 20260716_market_signal_observations.sql / 20260716_cost_governor_log.sql
-- so the D8 operator-contract gate's diff parser (which stops at '.') keys the
-- operator triple correctly.
CREATE TABLE IF NOT EXISTS market_signal_scanner_budget (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month_key  text        NOT NULL,
  spent_usd  numeric     NOT NULL DEFAULT 0,
  cap_usd    numeric     NOT NULL DEFAULT 25,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_signal_scanner_budget_month_key_unique UNIQUE (month_key)
);

COMMENT ON TABLE public.market_signal_scanner_budget IS
'Scanner-scoped FinOps ceiling for the market-signal-scanner (SD-LEO-INFRA-MARKET-SIGNAL-SCANNER-001).
One row per calendar month (month_key). spent_usd/cap_usd track the running spend against the
monthly cap (default $25); since v1 sources are $0 direct-cost APIs this is effectively a
compute/LLM-adjudication budget. Read/written exclusively by
lib/market-signal-scanner/budget-guard.js -- do not write to this table directly elsewhere.';

CREATE INDEX IF NOT EXISTS idx_market_signal_scanner_budget_month_key
  ON public.market_signal_scanner_budget (month_key);

-- RLS: service-role only (same file as the table create -- SPINE-001-B).
ALTER TABLE public.market_signal_scanner_budget ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_signal_scanner_budget_service_role ON public.market_signal_scanner_budget;
CREATE POLICY market_signal_scanner_budget_service_role
  ON public.market_signal_scanner_budget
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
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'market_signal_scanner_budget'
  ) THEN
    RAISE EXCEPTION 'market_signal_scanner_budget was not created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'market_signal_scanner_budget' AND c.relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'RLS not enabled on market_signal_scanner_budget';
  END IF;
END $$;
