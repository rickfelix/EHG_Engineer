-- Migration: Skills Decision Framework
-- SD: SD-SKILLS-FRAMEWORK-001
-- Description: Build/Buy/Partner decision framework with distance calculator

-- ============================================
-- Table: capability_decisions
-- ============================================
CREATE TABLE IF NOT EXISTS capability_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Decision context
  decision_code VARCHAR(30) UNIQUE NOT NULL, -- CAP-DEC-001
  capability_name TEXT NOT NULL,
  description TEXT,

  -- Link to skill (if applicable)
  related_skill_id UUID REFERENCES skills_inventory(id) ON DELETE SET NULL,

  -- Decision inputs
  strategic_importance INTEGER DEFAULT 50 CHECK (strategic_importance >= 0 AND strategic_importance <= 100),
  current_capability INTEGER DEFAULT 0 CHECK (current_capability >= 0 AND current_capability <= 100),
  market_availability INTEGER DEFAULT 50 CHECK (market_availability >= 0 AND market_availability <= 100),
  time_to_build INTEGER, -- In weeks
  cost_to_build DECIMAL(12, 2), -- Estimated cost
  cost_to_buy DECIMAL(12, 2), -- Vendor/license cost
  cost_to_partner DECIMAL(12, 2), -- Partnership cost

  -- Decision outcome
  decision_type VARCHAR(20) CHECK (decision_type IN ('build', 'buy', 'partner', 'hybrid', 'pending')),
  decision_rationale TEXT,
  decision_date TIMESTAMPTZ,
  decided_by TEXT,

  -- Distance calculation
  build_distance INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN current_capability >= 80 THEN 10
      WHEN current_capability >= 60 THEN 30
      WHEN current_capability >= 40 THEN 50
      WHEN current_capability >= 20 THEN 70
      ELSE 90
    END
  ) STORED,

  buy_distance INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN market_availability >= 80 THEN 10
      WHEN market_availability >= 60 THEN 30
      WHEN market_availability >= 40 THEN 50
      WHEN market_availability >= 20 THEN 70
      ELSE 90
    END
  ) STORED,

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'decided', 'implemented', 'reviewed')),

  -- Metadata
  created_by TEXT DEFAULT 'SYSTEM',
  updated_by TEXT DEFAULT 'SYSTEM',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cap_decisions_status ON capability_decisions(status);
CREATE INDEX IF NOT EXISTS idx_cap_decisions_type ON capability_decisions(decision_type);
CREATE INDEX IF NOT EXISTS idx_cap_decisions_skill ON capability_decisions(related_skill_id);

-- ============================================
-- Table: decision_criteria
-- ============================================
CREATE TABLE IF NOT EXISTS decision_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES capability_decisions(id) ON DELETE CASCADE,

  -- Criterion
  criterion_name TEXT NOT NULL,
  weight INTEGER DEFAULT 10 CHECK (weight >= 0 AND weight <= 100),

  -- Scores for each option (0-100)
  build_score INTEGER DEFAULT 50,
  buy_score INTEGER DEFAULT 50,
  partner_score INTEGER DEFAULT 50,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Function: Calculate weighted decision scores
-- ============================================
CREATE OR REPLACE FUNCTION calculate_decision_scores(p_decision_id UUID)
RETURNS TABLE (
  option_type TEXT,
  weighted_score DECIMAL(10, 2),
  criteria_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 'build'::TEXT,
    SUM(dc.build_score * dc.weight)::DECIMAL / NULLIF(SUM(dc.weight), 0),
    COUNT(*)::INTEGER
  FROM decision_criteria dc
  WHERE dc.decision_id = p_decision_id

  UNION ALL

  SELECT 'buy'::TEXT,
    SUM(dc.buy_score * dc.weight)::DECIMAL / NULLIF(SUM(dc.weight), 0),
    COUNT(*)::INTEGER
  FROM decision_criteria dc
  WHERE dc.decision_id = p_decision_id

  UNION ALL

  SELECT 'partner'::TEXT,
    SUM(dc.partner_score * dc.weight)::DECIMAL / NULLIF(SUM(dc.weight), 0),
    COUNT(*)::INTEGER
  FROM decision_criteria dc
  WHERE dc.decision_id = p_decision_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- View: Decision summary with recommendations
-- ============================================
CREATE OR REPLACE VIEW v_capability_decision_summary AS
SELECT
  cd.decision_code,
  cd.capability_name,
  cd.strategic_importance,
  cd.current_capability,
  cd.market_availability,
  cd.build_distance,
  cd.buy_distance,
  cd.decision_type,
  cd.status,
  -- Recommendation based on distances and strategic importance
  CASE
    WHEN cd.strategic_importance >= 80 AND cd.current_capability >= 60 THEN 'build_recommended'
    WHEN cd.market_availability >= 80 AND cd.strategic_importance < 60 THEN 'buy_recommended'
    WHEN cd.build_distance > 70 AND cd.buy_distance > 70 THEN 'partner_recommended'
    WHEN cd.build_distance < cd.buy_distance THEN 'build_leaning'
    WHEN cd.buy_distance < cd.build_distance THEN 'buy_leaning'
    ELSE 'needs_analysis'
  END AS recommendation,
  cd.created_at,
  cd.updated_at
FROM capability_decisions cd
ORDER BY cd.strategic_importance DESC, cd.status;

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE capability_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view decisions"
ON capability_decisions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage decisions"
ON capability_decisions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can view criteria"
ON decision_criteria FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage criteria"
ON decision_criteria FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON capability_decisions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON decision_criteria TO authenticated;
GRANT SELECT ON v_capability_decision_summary TO authenticated;
