-- Migration: Archetype x Profile Interaction Matrix
-- SD: SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-E
-- Purpose: Store interaction data between 6 EHG archetypes and evaluation profiles

-- Create archetype_profile_interactions table
CREATE TABLE IF NOT EXISTS archetype_profile_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archetype_key TEXT NOT NULL,
  profile_id UUID NOT NULL REFERENCES evaluation_profiles(id) ON DELETE CASCADE,
  weight_adjustments JSONB NOT NULL DEFAULT '{}',
  execution_guidance TEXT[] NOT NULL DEFAULT '{}',
  compatibility_score NUMERIC(3,2) NOT NULL DEFAULT 0.50 CHECK (compatibility_score >= 0 AND compatibility_score <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(archetype_key, profile_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_archetype ON archetype_profile_interactions(archetype_key);
CREATE INDEX IF NOT EXISTS idx_api_profile ON archetype_profile_interactions(profile_id);

-- RLS
ALTER TABLE archetype_profile_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_read_all" ON archetype_profile_interactions FOR SELECT USING (true);
CREATE POLICY "api_write_service" ON archetype_profile_interactions FOR ALL USING (true) WITH CHECK (true);

-- Comments
COMMENT ON TABLE archetype_profile_interactions IS 'Interaction matrix between 6 EHG venture archetypes and evaluation profiles, defining weight adjustments and execution guidance';
COMMENT ON COLUMN archetype_profile_interactions.archetype_key IS 'Archetype identifier: democratizer, automator, capability_productizer, first_principles_rebuilder, vertical_specialist, portfolio_connector';
COMMENT ON COLUMN archetype_profile_interactions.weight_adjustments IS 'JSONB of component_name → multiplier (0.5-2.0) adjustments for this archetype-profile pair';
COMMENT ON COLUMN archetype_profile_interactions.execution_guidance IS 'Array of execution strategy hints for this archetype under this profile';
COMMENT ON COLUMN archetype_profile_interactions.compatibility_score IS 'How well this profile suits this archetype (0.0-1.0)';

-- Seed data: 18 combinations (6 archetypes x 3 profiles)
-- Get profile IDs
DO $$
DECLARE
  v_balanced UUID;
  v_aggressive UUID;
  v_capital UUID;
BEGIN
  SELECT id INTO v_balanced FROM evaluation_profiles WHERE name = 'balanced' AND is_active = true LIMIT 1;
  SELECT id INTO v_aggressive FROM evaluation_profiles WHERE name = 'aggressive_growth' LIMIT 1;
  SELECT id INTO v_capital FROM evaluation_profiles WHERE name = 'capital_efficient' LIMIT 1;

  -- If profiles don't exist yet, skip seed data
  IF v_balanced IS NULL OR v_aggressive IS NULL OR v_capital IS NULL THEN
    RAISE NOTICE 'Evaluation profiles not found - skipping seed data';
    RETURN;
  END IF;

  -- Democratizer: Makes expensive capabilities accessible
  INSERT INTO archetype_profile_interactions (archetype_key, profile_id, weight_adjustments, execution_guidance, compatibility_score) VALUES
  ('democratizer', v_balanced, '{"virality": 1.2, "moat": 0.9, "market_size": 1.3, "build_cost": 1.0, "time_horizon": 1.0, "cross_reference": 1.0, "portfolio": 0.8, "reframing": 1.1, "constraints": 1.0}'::jsonb, ARRAY['Focus on distribution channels and accessibility', 'Measure adoption rate over revenue initially', 'Build for scale from day one'], 0.70),
  ('democratizer', v_aggressive, '{"virality": 1.5, "moat": 0.7, "market_size": 1.4, "build_cost": 0.8, "time_horizon": 0.9, "cross_reference": 0.9, "portfolio": 0.7, "reframing": 1.2, "constraints": 0.8}'::jsonb, ARRAY['Prioritize viral growth loops', 'Accept lower margins for market share', 'Speed over perfection in early stages'], 0.85),
  ('democratizer', v_capital, '{"virality": 1.0, "moat": 1.1, "market_size": 1.2, "build_cost": 1.3, "time_horizon": 1.1, "cross_reference": 1.0, "portfolio": 0.9, "reframing": 1.0, "constraints": 1.2}'::jsonb, ARRAY['Validate unit economics before scaling', 'Focus on premium segment first', 'Build defensible pricing moat'], 0.55)
  ON CONFLICT (archetype_key, profile_id) DO UPDATE SET weight_adjustments = EXCLUDED.weight_adjustments, execution_guidance = EXCLUDED.execution_guidance, compatibility_score = EXCLUDED.compatibility_score;

  -- Automator: Replaces manual processes with AI
  INSERT INTO archetype_profile_interactions (archetype_key, profile_id, weight_adjustments, execution_guidance, compatibility_score) VALUES
  ('automator', v_balanced, '{"virality": 0.9, "moat": 1.2, "market_size": 1.0, "build_cost": 1.1, "time_horizon": 1.0, "cross_reference": 1.1, "portfolio": 1.0, "reframing": 1.0, "constraints": 1.1}'::jsonb, ARRAY['Emphasize ROI and time savings metrics', 'Build integration ecosystem', 'Document automation accuracy rates'], 0.75),
  ('automator', v_aggressive, '{"virality": 1.1, "moat": 1.0, "market_size": 1.2, "build_cost": 0.9, "time_horizon": 0.8, "cross_reference": 1.0, "portfolio": 0.9, "reframing": 1.1, "constraints": 0.7}'::jsonb, ARRAY['Move fast with imperfect automation', 'Capture market before competitors automate', 'Use AI capabilities as differentiator'], 0.70),
  ('automator', v_capital, '{"virality": 0.8, "moat": 1.3, "market_size": 0.9, "build_cost": 1.4, "time_horizon": 1.2, "cross_reference": 1.1, "portfolio": 1.1, "reframing": 0.9, "constraints": 1.3}'::jsonb, ARRAY['Prove cost reduction before scaling', 'Build deep technical moat', 'Target high-value enterprise workflows'], 0.80)
  ON CONFLICT (archetype_key, profile_id) DO UPDATE SET weight_adjustments = EXCLUDED.weight_adjustments, execution_guidance = EXCLUDED.execution_guidance, compatibility_score = EXCLUDED.compatibility_score;

  -- Capability Productizer: Internal capability → external product
  INSERT INTO archetype_profile_interactions (archetype_key, profile_id, weight_adjustments, execution_guidance, compatibility_score) VALUES
  ('capability_productizer', v_balanced, '{"virality": 1.0, "moat": 1.3, "market_size": 0.9, "build_cost": 1.2, "time_horizon": 1.1, "cross_reference": 1.2, "portfolio": 1.3, "reframing": 0.9, "constraints": 1.0}'::jsonb, ARRAY['Leverage existing internal expertise', 'Package capability with clear API', 'Build on proven internal track record'], 0.80),
  ('capability_productizer', v_aggressive, '{"virality": 1.2, "moat": 1.1, "market_size": 1.1, "build_cost": 0.9, "time_horizon": 0.8, "cross_reference": 1.1, "portfolio": 1.2, "reframing": 1.0, "constraints": 0.8}'::jsonb, ARRAY['Launch with existing capability MVP', 'Iterate based on external feedback', 'Cross-sell into existing portfolio'], 0.65),
  ('capability_productizer', v_capital, '{"virality": 0.8, "moat": 1.4, "market_size": 0.8, "build_cost": 1.3, "time_horizon": 1.2, "cross_reference": 1.3, "portfolio": 1.4, "reframing": 0.8, "constraints": 1.2}'::jsonb, ARRAY['Validate external demand independently', 'Price based on value not cost', 'Build IP protection layer'], 0.75)
  ON CONFLICT (archetype_key, profile_id) DO UPDATE SET weight_adjustments = EXCLUDED.weight_adjustments, execution_guidance = EXCLUDED.execution_guidance, compatibility_score = EXCLUDED.compatibility_score;

  -- First Principles Rebuilder: Rebuilds broken industry from scratch
  INSERT INTO archetype_profile_interactions (archetype_key, profile_id, weight_adjustments, execution_guidance, compatibility_score) VALUES
  ('first_principles_rebuilder', v_balanced, '{"virality": 0.8, "moat": 1.4, "market_size": 1.1, "build_cost": 1.3, "time_horizon": 1.3, "cross_reference": 1.0, "portfolio": 0.8, "reframing": 1.4, "constraints": 1.1}'::jsonb, ARRAY['Invest heavily in problem understanding', 'Build foundational technology layer', 'Plan for multi-year execution'], 0.65),
  ('first_principles_rebuilder', v_aggressive, '{"virality": 1.0, "moat": 1.2, "market_size": 1.3, "build_cost": 0.7, "time_horizon": 0.7, "cross_reference": 0.9, "portfolio": 0.7, "reframing": 1.3, "constraints": 0.7}'::jsonb, ARRAY['Find narrow wedge to enter market', 'Rebuild incrementally not all at once', 'Challenge industry assumptions publicly'], 0.50),
  ('first_principles_rebuilder', v_capital, '{"virality": 0.7, "moat": 1.5, "market_size": 1.0, "build_cost": 1.4, "time_horizon": 1.4, "cross_reference": 1.1, "portfolio": 0.9, "reframing": 1.3, "constraints": 1.3}'::jsonb, ARRAY['Validate rebuild economics rigorously', 'Secure long-term funding commitment', 'Build switching costs into architecture'], 0.70)
  ON CONFLICT (archetype_key, profile_id) DO UPDATE SET weight_adjustments = EXCLUDED.weight_adjustments, execution_guidance = EXCLUDED.execution_guidance, compatibility_score = EXCLUDED.compatibility_score;

  -- Vertical Specialist: Deep niche expertise
  INSERT INTO archetype_profile_interactions (archetype_key, profile_id, weight_adjustments, execution_guidance, compatibility_score) VALUES
  ('vertical_specialist', v_balanced, '{"virality": 0.7, "moat": 1.4, "market_size": 0.8, "build_cost": 1.1, "time_horizon": 1.1, "cross_reference": 0.9, "portfolio": 0.9, "reframing": 0.8, "constraints": 1.2}'::jsonb, ARRAY['Become the definitive authority in niche', 'Build deep domain-specific features', 'Create high switching costs through specialization'], 0.75),
  ('vertical_specialist', v_aggressive, '{"virality": 0.9, "moat": 1.2, "market_size": 1.0, "build_cost": 0.9, "time_horizon": 0.9, "cross_reference": 0.8, "portfolio": 0.8, "reframing": 0.9, "constraints": 0.9}'::jsonb, ARRAY['Capture niche quickly before generalists arrive', 'Expand vertically before horizontally', 'Build community-driven growth in niche'], 0.55),
  ('vertical_specialist', v_capital, '{"virality": 0.6, "moat": 1.5, "market_size": 0.7, "build_cost": 1.2, "time_horizon": 1.2, "cross_reference": 1.0, "portfolio": 1.0, "reframing": 0.7, "constraints": 1.3}'::jsonb, ARRAY['Prove unit economics in narrow market', 'Build enterprise-grade vertical solution', 'Maximize revenue per customer over volume'], 0.85)
  ON CONFLICT (archetype_key, profile_id) DO UPDATE SET weight_adjustments = EXCLUDED.weight_adjustments, execution_guidance = EXCLUDED.execution_guidance, compatibility_score = EXCLUDED.compatibility_score;

  -- Portfolio Connector: Bridges gaps between EHG ventures
  INSERT INTO archetype_profile_interactions (archetype_key, profile_id, weight_adjustments, execution_guidance, compatibility_score) VALUES
  ('portfolio_connector', v_balanced, '{"virality": 0.9, "moat": 1.1, "market_size": 0.9, "build_cost": 1.0, "time_horizon": 1.0, "cross_reference": 1.4, "portfolio": 1.5, "reframing": 1.0, "constraints": 1.0}'::jsonb, ARRAY['Map integration points between ventures', 'Create shared data infrastructure', 'Measure cross-venture synergies'], 0.80),
  ('portfolio_connector', v_aggressive, '{"virality": 1.1, "moat": 0.9, "market_size": 1.0, "build_cost": 0.8, "time_horizon": 0.8, "cross_reference": 1.3, "portfolio": 1.4, "reframing": 1.1, "constraints": 0.8}'::jsonb, ARRAY['Launch MVP connecting two ventures', 'Iterate on connection value rapidly', 'Use network effects across portfolio'], 0.60),
  ('portfolio_connector', v_capital, '{"virality": 0.7, "moat": 1.2, "market_size": 0.8, "build_cost": 1.1, "time_horizon": 1.1, "cross_reference": 1.5, "portfolio": 1.5, "reframing": 0.9, "constraints": 1.2}'::jsonb, ARRAY['Validate connector economics independently', 'Build robust integration architecture', 'Prove portfolio-level ROI before scaling'], 0.70)
  ON CONFLICT (archetype_key, profile_id) DO UPDATE SET weight_adjustments = EXCLUDED.weight_adjustments, execution_guidance = EXCLUDED.execution_guidance, compatibility_score = EXCLUDED.compatibility_score;

END $$;
