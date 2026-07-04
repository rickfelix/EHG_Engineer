-- Migration: MarketLens Owned-Audience Channel — Caps, Organic-Only Channel Join, Weekly Rollup
-- SD-LEO-FEAT-MARKETLENS-OWNED-AUDIENCE-001
-- Date: 2026-07-04
-- Purpose: Add the write-cap ledger (mirrors venture_token_ledger), the instance-concurrency
--   counter (extends factory_guardrail_state), a venture-scoped organic-only channel join
--   table with a schema-level zero-budget CHECK, and a durable weekly audience/engagement
--   rollup table. All additive — no existing table/column is altered destructively.

-- ============================================================================
-- STEP 1: Write-cap ledger (mirrors venture_token_ledger's fire-and-forget insert pattern)
-- ============================================================================

CREATE TABLE IF NOT EXISTS venture_write_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  operation_type VARCHAR(50) NOT NULL, -- e.g. 'queue_insert', 'publish', 'measurement_write'
  write_count INTEGER NOT NULL DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'eva-write-tracker'
);

CREATE INDEX IF NOT EXISTS idx_venture_write_ledger_venture ON venture_write_ledger(venture_id);
CREATE INDEX IF NOT EXISTS idx_venture_write_ledger_created_at ON venture_write_ledger(created_at);

-- ============================================================================
-- STEP 2: get_venture_write_budget_status RPC — mirrors get_venture_token_budget_status's
--   shape (venture_id, budget_limit, writes_used, writes_remaining, usage_percentage,
--   is_over_budget). Fixed 100,000-write limit per venture (the standing MarketLens cap;
--   no per-profile CASE is needed since only one write-cap tier exists today).
-- ============================================================================

CREATE OR REPLACE FUNCTION get_venture_write_budget_status(p_venture_id UUID)
RETURNS TABLE (
  venture_id UUID,
  budget_limit INTEGER,
  writes_used INTEGER,
  writes_remaining INTEGER,
  usage_percentage NUMERIC,
  is_over_budget BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_budget_limit INTEGER := 100000;
  v_writes_used INTEGER;
BEGIN
  SELECT COALESCE(SUM(vwl.write_count), 0)
  INTO v_writes_used
  FROM venture_write_ledger vwl
  WHERE vwl.venture_id = p_venture_id;

  RETURN QUERY SELECT
    p_venture_id,
    v_budget_limit,
    v_writes_used,
    GREATEST(0, v_budget_limit - v_writes_used),
    ROUND((v_writes_used::NUMERIC / NULLIF(v_budget_limit, 0)) * 100, 2),
    v_writes_used >= v_budget_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_venture_write_budget_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_venture_write_budget_status(UUID) TO service_role;

-- ============================================================================
-- STEP 3: Instance-concurrency counter — extends factory_guardrail_state (already keyed
--   by venture_id, already the kill-switch home) rather than a new table.
-- ============================================================================

ALTER TABLE factory_guardrail_state
  ADD COLUMN IF NOT EXISTS active_content_loop_instances INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN factory_guardrail_state.active_content_loop_instances IS
  'Count of currently-running MarketLens owned-audience content-loop instances for this venture. Capped at 2 (standing cap, chairman decision 08547ee8) by application-level acquire/release helpers.';

-- ============================================================================
-- STEP 4: Venture-scoped organic-only channel join, schema-level zero-budget enforcement
-- ============================================================================

CREATE TABLE IF NOT EXISTS venture_distribution_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES distribution_channels(id) ON DELETE CASCADE,
  is_organic BOOLEAN NOT NULL DEFAULT true,
  budget_usd NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (budget_usd = 0),
  credential_ref TEXT, -- pointer into the secrets machinery; never a plaintext credential
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (venture_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_vdc_venture ON venture_distribution_channels(venture_id);

COMMENT ON COLUMN venture_distribution_channels.budget_usd IS
  'Hard-enforced at the schema level: CHECK (budget_usd = 0). This table exists specifically for organic-only ventures (e.g. MarketLens, decision 08547ee8) — any paid channel/budget belongs on a different join, not here.';

-- ============================================================================
-- STEP 5: Durable weekly audience/engagement rollup (snapshot, not a live view)
-- ============================================================================

CREATE TABLE IF NOT EXISTS venture_audience_weekly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  week_start DATE NOT NULL, -- Monday of the aggregated week (UTC)
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  engagement_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  post_count INTEGER NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (venture_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_venture_audience_weekly_venture ON venture_audience_weekly(venture_id);

COMMENT ON TABLE venture_audience_weekly IS
  'Durable snapshot of distribution_history aggregates by (venture_id, week_start). Computed once and never recomputed for a past week, so later backfill corrections to distribution_history do not silently move an already-reported T+4-week demand-evidence number.';

-- ============================================================================
-- STEP 6: RLS — mirror the mcq_venture_access / dh_venture_access pattern exactly
-- ============================================================================

ALTER TABLE venture_write_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_distribution_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_audience_weekly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vwl_venture_access" ON venture_write_ledger
  FOR ALL TO authenticated
  USING (
    venture_id IN (
      SELECT v.id FROM ventures v
      WHERE v.company_id IN (
        SELECT company_id FROM user_company_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "vwl_service_role" ON venture_write_ledger
  FOR ALL TO service_role
  USING (true);

CREATE POLICY "vdc_venture_access" ON venture_distribution_channels
  FOR ALL TO authenticated
  USING (
    venture_id IN (
      SELECT v.id FROM ventures v
      WHERE v.company_id IN (
        SELECT company_id FROM user_company_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "vdc_service_role" ON venture_distribution_channels
  FOR ALL TO service_role
  USING (true);

CREATE POLICY "vaw_venture_access" ON venture_audience_weekly
  FOR ALL TO authenticated
  USING (
    venture_id IN (
      SELECT v.id FROM ventures v
      WHERE v.company_id IN (
        SELECT company_id FROM user_company_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "vaw_service_role" ON venture_audience_weekly
  FOR ALL TO service_role
  USING (true);
