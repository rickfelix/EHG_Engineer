-- Portfolio Profile Allocations
-- Part of SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-G
-- Tracks target and current allocation percentages per evaluation profile

CREATE TABLE IF NOT EXISTS portfolio_profile_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES evaluation_profiles(id) ON DELETE CASCADE,
  target_pct NUMERIC(5,2) NOT NULL DEFAULT 33.33 CHECK (target_pct >= 0 AND target_pct <= 100),
  current_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (current_pct >= 0 AND current_pct <= 100),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id)
);

-- Enable RLS
ALTER TABLE portfolio_profile_allocations ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
DROP POLICY IF EXISTS "service_role_full_access_portfolio_alloc" ON portfolio_profile_allocations;
CREATE POLICY "service_role_full_access_portfolio_alloc"
  ON portfolio_profile_allocations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed default allocations using existing evaluation profiles
DO $$
DECLARE
  v_aggressive UUID;
  v_balanced UUID;
  v_capital UUID;
BEGIN
  SELECT id INTO v_aggressive FROM evaluation_profiles WHERE name = 'aggressive_growth' LIMIT 1;
  SELECT id INTO v_balanced FROM evaluation_profiles WHERE name = 'balanced' LIMIT 1;
  SELECT id INTO v_capital FROM evaluation_profiles WHERE name = 'capital_efficient' LIMIT 1;

  IF v_aggressive IS NOT NULL THEN
    INSERT INTO portfolio_profile_allocations (profile_id, target_pct, current_pct, description)
    VALUES (v_aggressive, 40.00, 0, 'Aggressive growth ventures targeting rapid scale')
    ON CONFLICT (profile_id) DO NOTHING;
  END IF;

  IF v_balanced IS NOT NULL THEN
    INSERT INTO portfolio_profile_allocations (profile_id, target_pct, current_pct, description)
    VALUES (v_balanced, 30.00, 0, 'Balanced ventures with moderate risk/reward')
    ON CONFLICT (profile_id) DO NOTHING;
  END IF;

  IF v_capital IS NOT NULL THEN
    INSERT INTO portfolio_profile_allocations (profile_id, target_pct, current_pct, description)
    VALUES (v_capital, 30.00, 0, 'Capital efficient ventures with lower burn')
    ON CONFLICT (profile_id) DO NOTHING;
  END IF;
END $$;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_portfolio_allocation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_portfolio_allocation_timestamp ON portfolio_profile_allocations;
CREATE TRIGGER trg_update_portfolio_allocation_timestamp
  BEFORE UPDATE ON portfolio_profile_allocations
  FOR EACH ROW
  EXECUTE FUNCTION update_portfolio_allocation_timestamp();
