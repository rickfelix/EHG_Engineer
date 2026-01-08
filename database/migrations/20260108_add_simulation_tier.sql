-- Migration: Add simulation tier to Genesis sessions
-- Date: 2026-01-08
-- SD: SD-GENESIS-FIX-001 (US-003)
-- Purpose: Support tiered simulation system per triangulation synthesis recommendations
--
-- Tier System:
--   A (default): PRD-only + AI mockups - Lightweight validation
--   B: Full simulation - Complete scaffolding and deployment
--
-- This allows Genesis to be more practical by defaulting to lighter-weight
-- validation while still supporting full simulations for complex ventures.

-- Step 1: Add simulation_tier column to simulation_sessions
ALTER TABLE simulation_sessions
  ADD COLUMN IF NOT EXISTS simulation_tier TEXT DEFAULT 'A'
  CHECK (simulation_tier IN ('A', 'B'));

-- Step 2: Add description column for tier documentation
COMMENT ON COLUMN simulation_sessions.simulation_tier IS
  'Simulation tier: A (PRD-only + mockups, default) or B (full simulation with scaffolding/deployment)';

-- Step 3: Create view for tier statistics
CREATE OR REPLACE VIEW genesis_tier_stats AS
SELECT
  simulation_tier,
  epistemic_status,
  COUNT(*) as session_count,
  AVG(ttl_days) as avg_ttl_days,
  MIN(created_at) as first_session,
  MAX(created_at) as last_session
FROM simulation_sessions
GROUP BY simulation_tier, epistemic_status
ORDER BY simulation_tier, epistemic_status;

COMMENT ON VIEW genesis_tier_stats IS
  'Statistics on Genesis simulation sessions by tier and status';

-- Step 4: Create tier configuration table for future extensibility
CREATE TABLE IF NOT EXISTS genesis_tier_config (
  tier_code TEXT PRIMARY KEY CHECK (tier_code IN ('A', 'B')),
  tier_name TEXT NOT NULL,
  description TEXT NOT NULL,
  features JSONB NOT NULL DEFAULT '[]',
  default_ttl_days INTEGER NOT NULL DEFAULT 7,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Seed tier configuration
INSERT INTO genesis_tier_config (tier_code, tier_name, description, features, default_ttl_days, requires_approval) VALUES
(
  'A',
  'Lite Simulation',
  'PRD-only generation with AI mockups. Quick validation without full scaffolding.',
  '["prd_generation", "ai_mockups", "validation_report"]'::jsonb,
  7,
  false
),
(
  'B',
  'Full Simulation',
  'Complete scaffolding with GitHub repo, Vercel deployment, and quality gates.',
  '["prd_generation", "ai_mockups", "validation_report", "code_scaffolding", "github_repo", "vercel_deployment", "quality_gates"]'::jsonb,
  30,
  true
)
ON CONFLICT (tier_code) DO NOTHING;

-- Comments
COMMENT ON TABLE genesis_tier_config IS
  'Configuration for Genesis simulation tiers. Defines features and requirements per tier.';

COMMENT ON COLUMN genesis_tier_config.features IS
  'JSONB array of features enabled for this tier';

COMMENT ON COLUMN genesis_tier_config.requires_approval IS
  'Whether this tier requires approval before starting (e.g., for resource-intensive B tier)';

-- Enable RLS on tier config
ALTER TABLE genesis_tier_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "genesis_tier_config_select"
  ON genesis_tier_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "genesis_tier_config_service"
  ON genesis_tier_config
  TO service_role
  USING (true)
  WITH CHECK (true);
