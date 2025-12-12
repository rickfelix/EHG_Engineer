-- Migration: 20251210_golden_nuggets_tables.sql
-- SD: SD-VISION-TRANSITION-001D1
-- Purpose: Create tables for Golden Nuggets features (Assumption Tracking, Token Budget, Four Buckets)
-- Reference: docs/vision/VENTURE_ENGINE_GOLDEN_NUGGETS_PLAN.md

-- ============================================================================
-- TABLE 1: assumption_sets
-- Purpose: Track versioned assumption sets across venture lifecycle
-- Golden Nugget: "Assumptions vs Reality Calibration"
-- ============================================================================

CREATE TABLE IF NOT EXISTS assumption_sets (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  venture_id UUID NOT NULL,  -- References ventures(id), enforced via RLS

  -- Versioning
  version INTEGER NOT NULL DEFAULT 1,
  parent_version_id UUID REFERENCES assumption_sets(id),  -- Link to V1 if this is V2+

  -- Core Assumption Categories (JSONB)
  -- STRUCTURE: { "key": { "value": any, "confidence": 0-1, "source": string, "evidence_urls": [] } }
  market_assumptions JSONB DEFAULT '{}'::jsonb,
  -- COMMENT: Market size estimates, pain intensity, willingness to pay, adoption speed

  competitor_assumptions JSONB DEFAULT '{}'::jsonb,
  -- COMMENT: Competitor landscape, their capabilities, response patterns

  product_assumptions JSONB DEFAULT '{}'::jsonb,
  -- COMMENT: Feature priorities, pricing sensitivity, development estimates

  timing_assumptions JSONB DEFAULT '{}'::jsonb,
  -- COMMENT: Market readiness, adoption timeline, launch windows

  -- Aggregate Confidence & Evidence
  confidence_scores JSONB DEFAULT '{}'::jsonb,
  -- COMMENT: { "market": 0.7, "competitor": 0.5, "product": 0.8, "timing": 0.6, "overall": 0.65 }

  evidence_sources JSONB DEFAULT '[]'::jsonb,
  -- COMMENT: [{ "type": "research|interview|data|expert", "url": string, "date": string, "weight": 0-1 }]

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'superseded', 'validated', 'invalidated')),

  -- Stage lifecycle tracking
  created_at_stage INTEGER,  -- Which lifecycle stage created this version
  finalized_at_stage INTEGER,  -- Which stage finalized/locked this version

  -- Reality comparison (populated post-launch)
  reality_data JSONB DEFAULT NULL,
  -- COMMENT: Same structure as assumptions, but with actual measured values

  calibration_report JSONB DEFAULT NULL,
  -- COMMENT: { "error_direction": "optimistic|pessimistic|mixed", "error_magnitude": 0-1, "learnings": [] }

  -- Audit columns
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by TEXT,  -- 'stage_3_validation', 'chairman_review', 'post_launch', etc.
  updated_by TEXT,

  -- Constraints
  CONSTRAINT uq_venture_version UNIQUE (venture_id, version)
);

-- Indexes for assumption_sets
CREATE INDEX IF NOT EXISTS idx_assumption_sets_venture_id ON assumption_sets(venture_id);
CREATE INDEX IF NOT EXISTS idx_assumption_sets_status ON assumption_sets(status);
CREATE INDEX IF NOT EXISTS idx_assumption_sets_created_at_stage ON assumption_sets(created_at_stage);
CREATE INDEX IF NOT EXISTS idx_assumption_sets_parent_version ON assumption_sets(parent_version_id);

-- GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_assumption_sets_market ON assumption_sets USING GIN(market_assumptions);
CREATE INDEX IF NOT EXISTS idx_assumption_sets_confidence ON assumption_sets USING GIN(confidence_scores);

-- Auto-update updated_at trigger
DROP TRIGGER IF EXISTS update_assumption_sets_updated_at ON assumption_sets;
CREATE TRIGGER update_assumption_sets_updated_at
  BEFORE UPDATE ON assumption_sets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE assumption_sets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for assumption_sets
DROP POLICY IF EXISTS "Users can view assumption sets for accessible ventures" ON assumption_sets;
CREATE POLICY "Users can view assumption sets for accessible ventures"
  ON assumption_sets FOR SELECT
  USING (
    venture_id IN (
      SELECT id FROM ventures WHERE company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can create assumption sets for accessible ventures" ON assumption_sets;
CREATE POLICY "Users can create assumption sets for accessible ventures"
  ON assumption_sets FOR INSERT
  WITH CHECK (
    venture_id IN (
      SELECT id FROM ventures WHERE company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can update assumption sets for accessible ventures" ON assumption_sets;
CREATE POLICY "Users can update assumption sets for accessible ventures"
  ON assumption_sets FOR UPDATE
  USING (
    venture_id IN (
      SELECT id FROM ventures WHERE company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- ============================================================================
-- TABLE 2: venture_token_ledger
-- Purpose: Track token/compute investment per venture, stage, and agent
-- Golden Nugget: "Tokens as Venture Investment & Budget Profiles"
-- ============================================================================

CREATE TABLE IF NOT EXISTS venture_token_ledger (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  venture_id UUID NOT NULL,  -- References ventures(id), enforced via RLS

  -- Context
  lifecycle_stage INTEGER NOT NULL,  -- 1-25 stage number
  phase TEXT CHECK (phase IN ('THE_TRUTH', 'THE_ENGINE', 'THE_IDENTITY', 'THE_BLUEPRINT', 'THE_BUILD_LOOP', 'LAUNCH_LEARN')),

  -- Agent/Model details
  agent_type TEXT NOT NULL,  -- 'claude', 'gemini', 'openai', 'crewai_job', 'simulation'
  model_id TEXT,  -- 'claude-3-sonnet', 'gpt-4', etc.
  job_id UUID,  -- Reference to specific AI job/execution
  crew_id TEXT,  -- CrewAI crew name if applicable

  -- Token metrics
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  tokens_total INTEGER GENERATED ALWAYS AS (tokens_input + tokens_output) STORED,

  -- Cost metrics
  cost_usd NUMERIC(10,6) DEFAULT 0,

  -- Budget tracking
  budget_profile TEXT DEFAULT 'standard' CHECK (budget_profile IN ('exploratory', 'standard', 'deep_due_diligence', 'custom')),
  budget_allocation_pct NUMERIC(5,2),  -- What % of budget this stage was allocated

  -- Simulation mode flag
  is_simulation BOOLEAN DEFAULT FALSE,
  simulation_run_id UUID,

  -- Metadata
  operation_type TEXT,  -- 'ideation', 'critique', 'research', 'analysis', 'generation'
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Audit columns
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by TEXT
);

-- Indexes for venture_token_ledger
CREATE INDEX IF NOT EXISTS idx_token_ledger_venture_id ON venture_token_ledger(venture_id);
CREATE INDEX IF NOT EXISTS idx_token_ledger_stage ON venture_token_ledger(lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_token_ledger_agent_type ON venture_token_ledger(agent_type);
CREATE INDEX IF NOT EXISTS idx_token_ledger_created_at ON venture_token_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_ledger_venture_stage ON venture_token_ledger(venture_id, lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_token_ledger_is_simulation ON venture_token_ledger(is_simulation) WHERE is_simulation = TRUE;

-- Enable RLS
ALTER TABLE venture_token_ledger ENABLE ROW LEVEL SECURITY;

-- RLS Policies for venture_token_ledger
DROP POLICY IF EXISTS "Users can view token ledger for accessible ventures" ON venture_token_ledger;
CREATE POLICY "Users can view token ledger for accessible ventures"
  ON venture_token_ledger FOR SELECT
  USING (
    venture_id IN (
      SELECT id FROM ventures WHERE company_id IN (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "System can insert token records" ON venture_token_ledger;
CREATE POLICY "System can insert token records"
  ON venture_token_ledger FOR INSERT
  WITH CHECK (TRUE);  -- Token logging is system-level, happens via service role

-- ============================================================================
-- VIEW: venture_token_summary
-- Purpose: Aggregate token usage per venture for analytics
-- ============================================================================

DROP VIEW IF EXISTS venture_token_summary;
CREATE VIEW venture_token_summary AS
SELECT
  venture_id,
  SUM(tokens_input) AS total_tokens_input,
  SUM(tokens_output) AS total_tokens_output,
  SUM(tokens_total) AS total_tokens,
  SUM(cost_usd) AS total_cost_usd,
  COUNT(DISTINCT lifecycle_stage) AS stages_touched,
  COUNT(*) AS total_operations,
  MAX(lifecycle_stage) AS furthest_stage,
  MIN(created_at) AS first_operation_at,
  MAX(created_at) AS last_operation_at,
  budget_profile
FROM venture_token_ledger
WHERE is_simulation = FALSE
GROUP BY venture_id, budget_profile;

-- ============================================================================
-- VIEW: venture_token_by_phase
-- Purpose: Token usage breakdown by venture phase
-- ============================================================================

DROP VIEW IF EXISTS venture_token_by_phase;
CREATE VIEW venture_token_by_phase AS
SELECT
  venture_id,
  phase,
  SUM(tokens_total) AS phase_tokens,
  SUM(cost_usd) AS phase_cost_usd,
  COUNT(DISTINCT lifecycle_stage) AS stages_in_phase,
  COUNT(*) AS operations_in_phase
FROM venture_token_ledger
WHERE is_simulation = FALSE AND phase IS NOT NULL
GROUP BY venture_id, phase;

-- ============================================================================
-- COLUMN: Add epistemic_classification to venture_artifacts
-- Purpose: Four Buckets classification (Facts/Assumptions/Simulations/Unknowns)
-- Golden Nugget: "Hallucination Control via Four Buckets"
-- ============================================================================

ALTER TABLE venture_artifacts
ADD COLUMN IF NOT EXISTS epistemic_classification TEXT
  CHECK (epistemic_classification IN ('fact', 'assumption', 'simulation', 'unknown'));

ALTER TABLE venture_artifacts
ADD COLUMN IF NOT EXISTS epistemic_evidence JSONB DEFAULT NULL;
-- COMMENT: For 'fact': { "source_url": string, "source_type": "db|artifact|external", "verified_at": timestamp }
-- COMMENT: For 'assumption': { "assumption_set_id": uuid, "assumption_key": string }
-- COMMENT: For 'simulation': { "simulation_run_id": uuid, "assumption_set_id": uuid }
-- COMMENT: For 'unknown': { "resolution_requirements": string[], "priority": "low|medium|high" }

-- Index for epistemic queries
CREATE INDEX IF NOT EXISTS idx_artifacts_epistemic ON venture_artifacts(epistemic_classification);
CREATE INDEX IF NOT EXISTS idx_artifacts_epistemic_evidence ON venture_artifacts USING GIN(epistemic_evidence);

-- ============================================================================
-- FUNCTION: get_venture_assumption_lineage
-- Purpose: Get all assumption set versions for a venture
-- ============================================================================

CREATE OR REPLACE FUNCTION get_venture_assumption_lineage(p_venture_id UUID)
RETURNS TABLE (
  id UUID,
  version INTEGER,
  parent_version_id UUID,
  status TEXT,
  created_at_stage INTEGER,
  overall_confidence NUMERIC,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.version,
    a.parent_version_id,
    a.status,
    a.created_at_stage,
    (a.confidence_scores->>'overall')::NUMERIC AS overall_confidence,
    a.created_at
  FROM assumption_sets a
  WHERE a.venture_id = p_venture_id
  ORDER BY a.version ASC;
END;
$$;

-- ============================================================================
-- FUNCTION: get_venture_token_budget_status
-- Purpose: Check venture token usage against budget profile
-- ============================================================================

CREATE OR REPLACE FUNCTION get_venture_token_budget_status(p_venture_id UUID)
RETURNS TABLE (
  venture_id UUID,
  budget_profile TEXT,
  budget_limit INTEGER,
  tokens_used INTEGER,
  tokens_remaining INTEGER,
  usage_percentage NUMERIC,
  is_over_budget BOOLEAN,
  cost_usd_total NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_budget_limit INTEGER;
  v_budget_profile TEXT;
  v_tokens_used INTEGER;
  v_cost_total NUMERIC;
BEGIN
  -- Get budget profile from most recent entry
  SELECT COALESCE(vtl.budget_profile, 'standard')
  INTO v_budget_profile
  FROM venture_token_ledger vtl
  WHERE vtl.venture_id = p_venture_id
  ORDER BY vtl.created_at DESC
  LIMIT 1;

  -- Set budget limit based on profile
  v_budget_limit := CASE v_budget_profile
    WHEN 'exploratory' THEN 100000
    WHEN 'standard' THEN 500000
    WHEN 'deep_due_diligence' THEN 2000000
    WHEN 'custom' THEN 1000000  -- Default custom
    ELSE 500000
  END;

  -- Get actual usage
  SELECT COALESCE(SUM(tokens_total), 0), COALESCE(SUM(cost_usd), 0)
  INTO v_tokens_used, v_cost_total
  FROM venture_token_ledger vtl
  WHERE vtl.venture_id = p_venture_id
    AND vtl.is_simulation = FALSE;

  RETURN QUERY SELECT
    p_venture_id,
    v_budget_profile,
    v_budget_limit,
    v_tokens_used,
    GREATEST(0, v_budget_limit - v_tokens_used),
    ROUND((v_tokens_used::NUMERIC / v_budget_limit::NUMERIC) * 100, 2),
    v_tokens_used > v_budget_limit,
    v_cost_total;
END;
$$;

-- ============================================================================
-- FUNCTION: validate_four_buckets_output
-- Purpose: Validate stage output has proper epistemic classification
-- Returns validation report for stage gate
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_four_buckets_output(
  p_venture_id UUID,
  p_lifecycle_stage INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_facts_count INTEGER;
  v_assumptions_count INTEGER;
  v_simulations_count INTEGER;
  v_unknowns_count INTEGER;
  v_unclassified_count INTEGER;
  v_facts_with_sources INTEGER;
  v_assumptions_with_sets INTEGER;
  v_simulations_with_runs INTEGER;
  v_passes_validation BOOLEAN;
  v_violations TEXT[];
BEGIN
  -- Count by classification
  SELECT
    COUNT(*) FILTER (WHERE epistemic_classification = 'fact'),
    COUNT(*) FILTER (WHERE epistemic_classification = 'assumption'),
    COUNT(*) FILTER (WHERE epistemic_classification = 'simulation'),
    COUNT(*) FILTER (WHERE epistemic_classification = 'unknown'),
    COUNT(*) FILTER (WHERE epistemic_classification IS NULL)
  INTO v_facts_count, v_assumptions_count, v_simulations_count, v_unknowns_count, v_unclassified_count
  FROM venture_artifacts
  WHERE venture_id = p_venture_id AND lifecycle_stage = p_lifecycle_stage;

  -- Check evidence linkage
  SELECT COUNT(*)
  INTO v_facts_with_sources
  FROM venture_artifacts
  WHERE venture_id = p_venture_id
    AND lifecycle_stage = p_lifecycle_stage
    AND epistemic_classification = 'fact'
    AND epistemic_evidence IS NOT NULL
    AND epistemic_evidence->>'source_url' IS NOT NULL;

  SELECT COUNT(*)
  INTO v_assumptions_with_sets
  FROM venture_artifacts
  WHERE venture_id = p_venture_id
    AND lifecycle_stage = p_lifecycle_stage
    AND epistemic_classification = 'assumption'
    AND epistemic_evidence IS NOT NULL
    AND epistemic_evidence->>'assumption_set_id' IS NOT NULL;

  SELECT COUNT(*)
  INTO v_simulations_with_runs
  FROM venture_artifacts
  WHERE venture_id = p_venture_id
    AND lifecycle_stage = p_lifecycle_stage
    AND epistemic_classification = 'simulation'
    AND epistemic_evidence IS NOT NULL
    AND epistemic_evidence->>'simulation_run_id' IS NOT NULL;

  -- Build violations list
  v_violations := ARRAY[]::TEXT[];

  IF v_unclassified_count > 0 THEN
    v_violations := array_append(v_violations, format('%s artifacts without epistemic classification', v_unclassified_count));
  END IF;

  IF v_facts_count > 0 AND v_facts_with_sources < v_facts_count THEN
    v_violations := array_append(v_violations, format('%s facts missing source evidence', v_facts_count - v_facts_with_sources));
  END IF;

  IF v_assumptions_count > 0 AND v_assumptions_with_sets < v_assumptions_count THEN
    v_violations := array_append(v_violations, format('%s assumptions not linked to assumption set', v_assumptions_count - v_assumptions_with_sets));
  END IF;

  IF v_simulations_count > 0 AND v_simulations_with_runs < v_simulations_count THEN
    v_violations := array_append(v_violations, format('%s simulations missing run ID', v_simulations_count - v_simulations_with_runs));
  END IF;

  -- Stage 3+ should have at least one acknowledged unknown (honest gaps)
  IF p_lifecycle_stage >= 3 AND v_unknowns_count = 0 THEN
    v_violations := array_append(v_violations, 'No unknowns declared - stage output should acknowledge gaps');
  END IF;

  v_passes_validation := array_length(v_violations, 1) IS NULL OR array_length(v_violations, 1) = 0;

  RETURN jsonb_build_object(
    'stage_number', p_lifecycle_stage,
    'facts_count', v_facts_count,
    'assumptions_count', v_assumptions_count,
    'simulations_count', v_simulations_count,
    'unknowns_count', v_unknowns_count,
    'unclassified_count', v_unclassified_count,
    'all_facts_have_sources', v_facts_count = 0 OR v_facts_with_sources = v_facts_count,
    'all_assumptions_in_set', v_assumptions_count = 0 OR v_assumptions_with_sets = v_assumptions_count,
    'all_simulations_have_run_ids', v_simulations_count = 0 OR v_simulations_with_runs = v_simulations_count,
    'at_least_one_unknown', v_unknowns_count > 0,
    'passes_validation', v_passes_validation,
    'violations', to_jsonb(v_violations)
  );
END;
$$;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions for authenticated users (via RLS policies)
GRANT SELECT, INSERT, UPDATE ON assumption_sets TO authenticated;
GRANT SELECT ON venture_token_ledger TO authenticated;
GRANT INSERT ON venture_token_ledger TO service_role;
GRANT SELECT ON venture_token_summary TO authenticated;
GRANT SELECT ON venture_token_by_phase TO authenticated;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION get_venture_assumption_lineage(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_venture_token_budget_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_four_buckets_output(UUID, INTEGER) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE assumption_sets IS 'Golden Nugget: Versioned assumption sets for Assumptions vs Reality calibration';
COMMENT ON TABLE venture_token_ledger IS 'Golden Nugget: Token/compute investment tracking per venture';
COMMENT ON COLUMN venture_artifacts.epistemic_classification IS 'Golden Nugget: Four Buckets classification (fact/assumption/simulation/unknown)';
COMMENT ON COLUMN venture_artifacts.epistemic_evidence IS 'Evidence linking for epistemic claims (sources, assumption IDs, simulation runs)';
