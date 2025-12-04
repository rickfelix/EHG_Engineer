-- LEO Effort Policy Table & Integration
-- SD-EFFORT-POLICY-001: Effort Policy Table & Integration
-- Created: 2025-12-04
-- Database: EHG_Engineer (Strategic Directive Management)
-- Provides centralized, database-driven effort allocation by phase and complexity

-- ============================================================================
-- PART 1: Create leo_effort_policies table
-- ============================================================================

CREATE TABLE IF NOT EXISTS leo_effort_policies (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Policy key fields
  phase VARCHAR(20) NOT NULL CHECK (phase IN ('LEAD', 'PLAN', 'EXEC', 'VERIFY')),
  complexity_level VARCHAR(20) NOT NULL CHECK (complexity_level IN ('simple', 'moderate', 'complex', 'critical')),

  -- Effort configuration
  estimated_hours NUMERIC(5,2) NOT NULL CHECK (estimated_hours > 0),
  model_tier VARCHAR(20) NOT NULL DEFAULT 'standard' CHECK (model_tier IN ('basic', 'standard', 'advanced', 'premium')),

  -- Additional configuration
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique constraint ensures one policy per phase/complexity combination
  CONSTRAINT unique_phase_complexity UNIQUE (phase, complexity_level)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_leo_effort_policies_phase ON leo_effort_policies(phase);
CREATE INDEX IF NOT EXISTS idx_leo_effort_policies_complexity ON leo_effort_policies(complexity_level);
CREATE INDEX IF NOT EXISTS idx_leo_effort_policies_active ON leo_effort_policies(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_leo_effort_policies_lookup ON leo_effort_policies(phase, complexity_level) WHERE is_active = true;

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_leo_effort_policies_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_leo_effort_policies_updated_at ON leo_effort_policies;
CREATE TRIGGER trigger_leo_effort_policies_updated_at
  BEFORE UPDATE ON leo_effort_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_leo_effort_policies_timestamp();

-- RLS Policies (match LEO Protocol patterns)
ALTER TABLE leo_effort_policies ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read effort policies
CREATE POLICY "leo_effort_policies_select_authenticated" ON leo_effort_policies
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow service role to manage effort policies
CREATE POLICY "leo_effort_policies_all_service" ON leo_effort_policies
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow anon to read for public API access
CREATE POLICY "leo_effort_policies_select_anon" ON leo_effort_policies
  FOR SELECT
  TO anon
  USING (true);

-- Grant permissions
GRANT SELECT ON leo_effort_policies TO authenticated;
GRANT SELECT ON leo_effort_policies TO anon;
GRANT ALL ON leo_effort_policies TO service_role;

-- Comments
COMMENT ON TABLE leo_effort_policies IS 'LEO Protocol effort policies by phase and complexity level';
COMMENT ON COLUMN leo_effort_policies.phase IS 'LEO Protocol phase: LEAD, PLAN, EXEC, VERIFY';
COMMENT ON COLUMN leo_effort_policies.complexity_level IS 'SD complexity: simple, moderate, complex, critical';
COMMENT ON COLUMN leo_effort_policies.estimated_hours IS 'Expected effort hours for this phase/complexity';
COMMENT ON COLUMN leo_effort_policies.model_tier IS 'Model selection tier: basic, standard, advanced, premium';
COMMENT ON COLUMN leo_effort_policies.metadata IS 'Additional configuration: max_tokens, temperature, etc.';

-- ============================================================================
-- PART 2: Create get_effort_policy() function
-- ============================================================================

CREATE OR REPLACE FUNCTION get_effort_policy(
  p_phase TEXT,
  p_complexity TEXT DEFAULT 'moderate'
)
RETURNS TABLE (
  estimated_hours NUMERIC(5,2),
  model_tier VARCHAR(20),
  policy_id UUID,
  metadata JSONB
) AS $$
DECLARE
  v_default_hours NUMERIC(5,2);
  v_default_tier VARCHAR(20);
BEGIN
  -- Set defaults based on phase
  CASE UPPER(p_phase)
    WHEN 'LEAD' THEN
      v_default_hours := 1.0;
      v_default_tier := 'standard';
    WHEN 'PLAN' THEN
      v_default_hours := 2.0;
      v_default_tier := 'standard';
    WHEN 'EXEC' THEN
      v_default_hours := 4.0;
      v_default_tier := 'advanced';
    WHEN 'VERIFY' THEN
      v_default_hours := 1.0;
      v_default_tier := 'standard';
    ELSE
      v_default_hours := 2.0;
      v_default_tier := 'standard';
  END CASE;

  -- Try to find matching policy
  RETURN QUERY
  SELECT
    COALESCE(lep.estimated_hours, v_default_hours) AS estimated_hours,
    COALESCE(lep.model_tier, v_default_tier) AS model_tier,
    lep.id AS policy_id,
    COALESCE(lep.metadata, '{}'::jsonb) AS metadata
  FROM leo_effort_policies lep
  WHERE lep.phase = UPPER(p_phase)
    AND lep.complexity_level = LOWER(p_complexity)
    AND lep.is_active = true
  LIMIT 1;

  -- If no rows returned, return defaults
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      v_default_hours AS estimated_hours,
      v_default_tier AS model_tier,
      NULL::UUID AS policy_id,
      '{}'::jsonb AS metadata;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_effort_policy(TEXT, TEXT) IS 'Lookup effort policy by phase and complexity level. Returns defaults if no policy found.';

-- ============================================================================
-- PART 3: Seed 16 default effort policies (4 phases x 4 complexity levels)
-- ============================================================================

-- Use INSERT ... ON CONFLICT for idempotent seeding
INSERT INTO leo_effort_policies (phase, complexity_level, estimated_hours, model_tier, metadata)
VALUES
  -- LEAD phase policies (strategic approval, typically quick)
  ('LEAD', 'simple', 0.5, 'basic', '{"description": "Simple SD approval", "max_tokens": 2000}'::jsonb),
  ('LEAD', 'moderate', 1.0, 'standard', '{"description": "Moderate SD approval with some analysis", "max_tokens": 4000}'::jsonb),
  ('LEAD', 'complex', 2.0, 'advanced', '{"description": "Complex SD requiring stakeholder alignment", "max_tokens": 8000}'::jsonb),
  ('LEAD', 'critical', 3.0, 'premium', '{"description": "Critical SD with full strategic review", "max_tokens": 16000}'::jsonb),

  -- PLAN phase policies (PRD creation, user stories)
  ('PLAN', 'simple', 1.0, 'standard', '{"description": "Simple PRD with few requirements", "max_tokens": 4000}'::jsonb),
  ('PLAN', 'moderate', 2.0, 'standard', '{"description": "Moderate PRD with multiple user stories", "max_tokens": 8000}'::jsonb),
  ('PLAN', 'complex', 4.0, 'advanced', '{"description": "Complex PRD with extensive analysis", "max_tokens": 16000}'::jsonb),
  ('PLAN', 'critical', 6.0, 'premium', '{"description": "Critical PRD with full architecture review", "max_tokens": 32000}'::jsonb),

  -- EXEC phase policies (implementation, typically longest)
  ('EXEC', 'simple', 2.0, 'standard', '{"description": "Simple implementation, few files", "max_tokens": 8000}'::jsonb),
  ('EXEC', 'moderate', 4.0, 'advanced', '{"description": "Moderate implementation, multiple components", "max_tokens": 16000}'::jsonb),
  ('EXEC', 'complex', 8.0, 'premium', '{"description": "Complex implementation, system-wide changes", "max_tokens": 32000}'::jsonb),
  ('EXEC', 'critical', 12.0, 'premium', '{"description": "Critical implementation, core infrastructure", "max_tokens": 64000}'::jsonb),

  -- VERIFY phase policies (testing, validation)
  ('VERIFY', 'simple', 0.5, 'basic', '{"description": "Simple verification, basic tests", "max_tokens": 2000}'::jsonb),
  ('VERIFY', 'moderate', 1.0, 'standard', '{"description": "Moderate verification, E2E tests", "max_tokens": 4000}'::jsonb),
  ('VERIFY', 'complex', 2.0, 'advanced', '{"description": "Complex verification, full test suite", "max_tokens": 8000}'::jsonb),
  ('VERIFY', 'critical', 3.0, 'premium', '{"description": "Critical verification, security audit", "max_tokens": 16000}'::jsonb)
ON CONFLICT (phase, complexity_level)
DO UPDATE SET
  estimated_hours = EXCLUDED.estimated_hours,
  model_tier = EXCLUDED.model_tier,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

-- ============================================================================
-- PART 4: Add complexity_level column to strategic_directives_v2
-- ============================================================================

-- Add column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategic_directives_v2'
    AND column_name = 'complexity_level'
  ) THEN
    ALTER TABLE strategic_directives_v2
    ADD COLUMN complexity_level VARCHAR(20) DEFAULT 'moderate'
    CHECK (complexity_level IN ('simple', 'moderate', 'complex', 'critical'));

    COMMENT ON COLUMN strategic_directives_v2.complexity_level IS
      'SD complexity level for effort policy lookup: simple, moderate, complex, critical';
  END IF;
END $$;

-- Create index for complexity lookups
CREATE INDEX IF NOT EXISTS idx_sd_v2_complexity ON strategic_directives_v2(complexity_level);

-- ============================================================================
-- PART 5: Validation queries (for testing)
-- ============================================================================

-- Verify 16 policies exist
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count FROM leo_effort_policies WHERE is_active = true;
  IF policy_count < 16 THEN
    RAISE WARNING 'Expected 16 effort policies, found %', policy_count;
  ELSE
    RAISE NOTICE 'SUCCESS: % effort policies created', policy_count;
  END IF;
END $$;

-- Verify function works
DO $$
DECLARE
  result RECORD;
BEGIN
  SELECT * INTO result FROM get_effort_policy('EXEC', 'complex');
  IF result.estimated_hours IS NOT NULL THEN
    RAISE NOTICE 'SUCCESS: get_effort_policy(EXEC, complex) returned % hours, % tier',
      result.estimated_hours, result.model_tier;
  ELSE
    RAISE WARNING 'get_effort_policy() returned NULL';
  END IF;
END $$;
