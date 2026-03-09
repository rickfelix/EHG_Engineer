-- Venture Tiers and Exit Readiness Enhancement
-- SD: SD-LEO-ORCH-EHG-VENTURE-FACTORY-001-G
-- Creates: venture_tiers (NEW)
-- Alters: venture_exit_readiness (ADD separation_test_results JSONB)
-- Plus RLS policies, indexes, and historical tier trigger
--
-- IMPORTANT: venture_exit_readiness ALREADY EXISTS from SD-001-A foundation migration.
-- This migration ALTERs it — does NOT create it.
-- venture_tiers.tier_level is DISTINCT from ventures.tier (integer for stage caps).

-- ============================================================
-- 1. venture_tiers — Business Maturity Tiering
-- ============================================================
-- Tracks data-driven business maturity classification per venture.
-- tier_level (seed/growth/scale/exit) is different from ventures.tier
-- which is a simple integer controlling stage workflow caps.
CREATE TABLE IF NOT EXISTS venture_tiers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id        UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  tier_level        TEXT NOT NULL
                    CHECK (tier_level IN ('seed', 'growth', 'scale', 'exit')),
  promotion_criteria JSONB DEFAULT '{}'::jsonb,
  telemetry_snapshot JSONB DEFAULT '{}'::jsonb,
  is_current        BOOLEAN NOT NULL DEFAULT true,
  promoted_from     TEXT,
  promotion_reason  TEXT,
  evaluated_by      TEXT DEFAULT 'system',
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE venture_tiers IS 'Business maturity tier tracking (seed/growth/scale/exit). Distinct from ventures.tier integer.';
COMMENT ON COLUMN venture_tiers.tier_level IS 'Business maturity level: seed, growth, scale, exit';
COMMENT ON COLUMN venture_tiers.promotion_criteria IS 'JSONB thresholds used to evaluate this tier promotion';
COMMENT ON COLUMN venture_tiers.telemetry_snapshot IS 'JSONB snapshot of service_telemetry metrics at evaluation time';
COMMENT ON COLUMN venture_tiers.is_current IS 'Only one record per venture should be is_current=true';
COMMENT ON COLUMN venture_tiers.promoted_from IS 'Previous tier level before promotion';
COMMENT ON COLUMN venture_tiers.evaluated_by IS 'Who/what triggered this evaluation (system, manual, edge-function)';

-- ============================================================
-- 2. Historical Tier Trigger
-- ============================================================
-- When a new tier record with is_current=true is inserted,
-- mark all previous records for that venture as is_current=false.
CREATE OR REPLACE FUNCTION mark_previous_tiers_historical()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_current = true THEN
    UPDATE venture_tiers
    SET is_current = false, updated_at = now()
    WHERE venture_id = NEW.venture_id
      AND id != NEW.id
      AND is_current = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_mark_previous_tiers_historical') THEN
    CREATE TRIGGER trigger_mark_previous_tiers_historical
      AFTER INSERT ON venture_tiers
      FOR EACH ROW EXECUTE FUNCTION mark_previous_tiers_historical();
  END IF;
END
$$;

-- ============================================================
-- 3. Indexes on venture_tiers
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_venture_tiers_venture_id
  ON venture_tiers (venture_id);

CREATE INDEX IF NOT EXISTS idx_venture_tiers_current
  ON venture_tiers (venture_id)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_venture_tiers_tier_level
  ON venture_tiers (tier_level);

CREATE INDEX IF NOT EXISTS idx_venture_tiers_promotion_criteria
  ON venture_tiers USING GIN (promotion_criteria);

-- ============================================================
-- 4. RLS on venture_tiers
-- ============================================================
ALTER TABLE venture_tiers ENABLE ROW LEVEL SECURITY;

-- Service role: full access (implicit via supabase service_role)
-- Authenticated users: scoped to own ventures
CREATE POLICY "venture_tiers_select_own" ON venture_tiers
  FOR SELECT TO authenticated
  USING (venture_id IN (
    SELECT id FROM ventures WHERE created_by = auth.uid()
  ));

CREATE POLICY "venture_tiers_insert_own" ON venture_tiers
  FOR INSERT TO authenticated
  WITH CHECK (venture_id IN (
    SELECT id FROM ventures WHERE created_by = auth.uid()
  ));

CREATE POLICY "venture_tiers_update_own" ON venture_tiers
  FOR UPDATE TO authenticated
  USING (venture_id IN (
    SELECT id FROM ventures WHERE created_by = auth.uid()
  ));

-- ============================================================
-- 5. ALTER venture_exit_readiness — Add separation_test_results
-- ============================================================
-- venture_exit_readiness already has separation_tested BOOLEAN.
-- This adds structured JSONB results alongside it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venture_exit_readiness'
      AND column_name = 'separation_test_results'
  ) THEN
    ALTER TABLE venture_exit_readiness
      ADD COLUMN separation_test_results JSONB DEFAULT '{}'::jsonb;
  END IF;
END
$$;

COMMENT ON COLUMN venture_exit_readiness.separation_test_results IS 'Structured per-dimension pass/fail separation test results with blocking items';

-- ============================================================
-- 6. Updated_at trigger for venture_tiers
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_venture_tiers') THEN
    CREATE TRIGGER set_updated_at_venture_tiers
      BEFORE UPDATE ON venture_tiers
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;
