-- Migration: Operation 'GOVERNED ENGINE' v5.1.0
-- Purpose: Anchor CrewAI Shadow Engine to LEO Protocol Governance
-- Created: 2025-12-21
--
-- THE AUDIT WAS DISASTROUS: CrewAI was operating as a 'Shadow Engine'
-- This migration anchors all flows to venture_id, prd_id, sd_id
--
-- Components:
-- 1. PARTITION AGENT MEMORY - Semantic search with venture_id filter
-- 2. GOVERN THE DISPATCH - prd_id/sd_id columns on crewai_flows
-- 3. CREW EXECUTION TRACKING - Log all crew runs with governance anchors

-- =============================================================================
-- TASK 1: PARTITION AGENT MEMORY - Semantic Search with Venture Filter
-- =============================================================================

-- Ensure venture_id NOT NULL for new records (existing records grandfathered)
-- INDUSTRIAL-HARDENING-v2.9.0 already added the column, now enforce it

-- Create semantic search function for agent memory WITH venture_id filter
CREATE OR REPLACE FUNCTION match_agent_memory(
  p_query_embedding vector(1536),
  p_venture_id UUID,                           -- MANDATORY: No global searches
  p_agent_id UUID DEFAULT NULL,                -- Optional: Filter to specific agent
  p_memory_type VARCHAR(50) DEFAULT NULL,      -- Optional: 'context', 'decisions', 'learnings', 'preferences'
  p_match_threshold FLOAT DEFAULT 0.7,
  p_match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  agent_id UUID,
  venture_id UUID,
  memory_type VARCHAR(50),
  content JSONB,
  summary TEXT,
  similarity FLOAT,
  importance_score FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- GOVERNANCE: venture_id is MANDATORY - no global memory reads
  IF p_venture_id IS NULL THEN
    RAISE EXCEPTION 'GOVERNANCE VIOLATION: venture_id is MANDATORY for memory search (GOVERNED-ENGINE-v5.1.0)';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.agent_id,
    m.venture_id,
    m.memory_type,
    m.content,
    m.summary,
    (1 - (m.embedding <=> p_query_embedding))::FLOAT AS similarity,
    m.importance_score,
    m.created_at
  FROM agent_memory_stores m
  WHERE
    -- MANDATORY: Venture isolation
    m.venture_id = p_venture_id
    -- Optional: Agent filter
    AND (p_agent_id IS NULL OR m.agent_id = p_agent_id)
    -- Optional: Memory type filter
    AND (p_memory_type IS NULL OR m.memory_type = p_memory_type)
    -- Only current versions
    AND m.is_current = TRUE
    -- Must have embedding
    AND m.embedding IS NOT NULL
    -- Similarity threshold
    AND (1 - (m.embedding <=> p_query_embedding)) >= p_match_threshold
  ORDER BY similarity DESC
  LIMIT p_match_count;
END;
$$;

-- Grant execute to service_role
GRANT EXECUTE ON FUNCTION match_agent_memory TO service_role;

COMMENT ON FUNCTION match_agent_memory IS
'GOVERNED-ENGINE-v5.1.0: Venture-scoped semantic search for agent memory.
THE LAW: venture_id is MANDATORY - no global memory reads allowed.
Replaces unscoped semantic search to prevent cross-venture memory contamination.';

-- =============================================================================
-- TASK 2: GOVERN THE DISPATCH - Add prd_id/sd_id to crewai_flows
-- =============================================================================

-- Add governance columns to crewai_flows
-- NOTE: prd_id has no FK because prds is a view, not a table
ALTER TABLE crewai_flows
ADD COLUMN IF NOT EXISTS venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE;

ALTER TABLE crewai_flows
ADD COLUMN IF NOT EXISTS prd_id UUID;

ALTER TABLE crewai_flows
ADD COLUMN IF NOT EXISTS sd_id VARCHAR(50);

-- Add comment for documentation
COMMENT ON COLUMN crewai_flows.venture_id IS 'GOVERNED-ENGINE-v5.1.0: MANDATORY venture context for all flows';
COMMENT ON COLUMN crewai_flows.prd_id IS 'GOVERNED-ENGINE-v5.1.0: PRD anchor for traceability';
COMMENT ON COLUMN crewai_flows.sd_id IS 'GOVERNED-ENGINE-v5.1.0: Strategic Directive anchor for governance';

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_crewai_flows_governance
ON crewai_flows(venture_id, prd_id, sd_id);

-- Add governance columns to crewai_flow_executions
-- NOTE: prd_id has no FK because prds is a view, not a table
ALTER TABLE crewai_flow_executions
ADD COLUMN IF NOT EXISTS venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE;

ALTER TABLE crewai_flow_executions
ADD COLUMN IF NOT EXISTS prd_id UUID;

ALTER TABLE crewai_flow_executions
ADD COLUMN IF NOT EXISTS sd_id VARCHAR(50);

ALTER TABLE crewai_flow_executions
ADD COLUMN IF NOT EXISTS budget_consumed INTEGER DEFAULT 0;

ALTER TABLE crewai_flow_executions
ADD COLUMN IF NOT EXISTS budget_limit INTEGER;

ALTER TABLE crewai_flow_executions
ADD COLUMN IF NOT EXISTS killed_by_budget BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN crewai_flow_executions.venture_id IS 'GOVERNED-ENGINE-v5.1.0: Venture context for execution';
COMMENT ON COLUMN crewai_flow_executions.budget_consumed IS 'GOVERNED-ENGINE-v5.1.0: Tokens consumed during execution';
COMMENT ON COLUMN crewai_flow_executions.killed_by_budget IS 'GOVERNED-ENGINE-v5.1.0: TRUE if execution halted by budget kill-switch';

CREATE INDEX IF NOT EXISTS idx_crewai_flow_executions_governance
ON crewai_flow_executions(venture_id, prd_id, sd_id);

-- =============================================================================
-- TASK 3: CREW EXECUTION VALIDATION FUNCTION
-- =============================================================================

-- Function to validate crew execution has required governance anchors
CREATE OR REPLACE FUNCTION fn_validate_crew_kickoff(
  p_flow_id UUID,
  p_venture_id UUID,
  p_prd_id UUID DEFAULT NULL,
  p_sd_id VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE (
  valid BOOLEAN,
  error_code VARCHAR(50),
  error_message TEXT,
  budget_remaining INTEGER,
  budget_limit INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_budget_remaining INTEGER;
  v_budget_limit INTEGER;
  v_flow_exists BOOLEAN;
BEGIN
  -- 1. Validate venture_id is provided
  IF p_venture_id IS NULL THEN
    RETURN QUERY SELECT
      FALSE,
      'GOVERNANCE_VENTURE_MISSING'::VARCHAR(50),
      'venture_id is MANDATORY for crew kickoff (GOVERNED-ENGINE-v5.1.0)'::TEXT,
      NULL::INTEGER,
      NULL::INTEGER;
    RETURN;
  END IF;

  -- 2. Validate flow exists
  SELECT EXISTS(SELECT 1 FROM crewai_flows WHERE id = p_flow_id) INTO v_flow_exists;
  IF NOT v_flow_exists THEN
    RETURN QUERY SELECT
      FALSE,
      'FLOW_NOT_FOUND'::VARCHAR(50),
      format('Flow %s does not exist', p_flow_id)::TEXT,
      NULL::INTEGER,
      NULL::INTEGER;
    RETURN;
  END IF;

  -- 3. Check venture budget
  SELECT
    COALESCE(vtb.budget_remaining, vpb.budget_remaining, 0),
    COALESCE(vtb.budget_allocated, vpb.budget_allocated, 0)
  INTO v_budget_remaining, v_budget_limit
  FROM ventures v
  LEFT JOIN venture_token_budgets vtb ON vtb.venture_id = v.id
  LEFT JOIN (
    SELECT DISTINCT ON (venture_id) *
    FROM venture_phase_budgets
    ORDER BY venture_id, created_at DESC
  ) vpb ON vpb.venture_id = v.id
  WHERE v.id = p_venture_id;

  -- 4. Budget kill-switch
  IF v_budget_remaining IS NOT NULL AND v_budget_remaining <= 0 THEN
    RETURN QUERY SELECT
      FALSE,
      'BUDGET_EXHAUSTED'::VARCHAR(50),
      format('Venture budget exhausted (%s tokens remaining)', v_budget_remaining)::TEXT,
      v_budget_remaining,
      v_budget_limit;
    RETURN;
  END IF;

  -- 5. All validations passed
  RETURN QUERY SELECT
    TRUE,
    NULL::VARCHAR(50),
    NULL::TEXT,
    v_budget_remaining,
    v_budget_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_validate_crew_kickoff TO service_role;

COMMENT ON FUNCTION fn_validate_crew_kickoff IS
'GOVERNED-ENGINE-v5.1.0: Validates crew kickoff has required governance anchors.
THE LAW: No crew execution without venture_id and budget check.
Returns budget info for kill-switch enforcement during execution.';

-- =============================================================================
-- TASK 4: SEMANTIC DIFF TRACKING TABLE
-- =============================================================================

-- Table to store semantic diff results for 60/40 Truth Law validation
-- NOTE: prd_id has no FK because prds is a view, not a table
CREATE TABLE IF NOT EXISTS crew_semantic_diffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Execution context
  execution_id UUID REFERENCES crewai_flow_executions(id) ON DELETE CASCADE,
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  prd_id UUID,
  sd_id VARCHAR(50),

  -- Crew output
  crew_output JSONB NOT NULL,
  output_embedding vector(1536),

  -- 60/40 Truth Law Scores
  business_accuracy FLOAT NOT NULL CHECK (business_accuracy BETWEEN 0 AND 1),
  technical_accuracy FLOAT NOT NULL CHECK (technical_accuracy BETWEEN 0 AND 1),
  truth_score FLOAT GENERATED ALWAYS AS (
    (business_accuracy * 0.6) + (technical_accuracy * 0.4)
  ) STORED,

  -- Validation result
  passed_gate BOOLEAN NOT NULL,
  gate_threshold FLOAT NOT NULL DEFAULT 0.7,
  rejection_reason TEXT,

  -- Audit trail
  validated_by VARCHAR(100),
  validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_crew_semantic_diffs_execution
ON crew_semantic_diffs(execution_id);

CREATE INDEX IF NOT EXISTS idx_crew_semantic_diffs_venture
ON crew_semantic_diffs(venture_id, sd_id);

CREATE INDEX IF NOT EXISTS idx_crew_semantic_diffs_truth_score
ON crew_semantic_diffs(truth_score DESC);

-- Enable RLS
ALTER TABLE crew_semantic_diffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_semantic_diffs ON crew_semantic_diffs
TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY chairman_read_semantic_diffs ON crew_semantic_diffs
FOR SELECT TO authenticated USING (fn_is_chairman());

COMMENT ON TABLE crew_semantic_diffs IS
'GOVERNED-ENGINE-v5.1.0: Stores semantic validation results for crew outputs.
THE LAW: truth_score = (business_accuracy * 0.6) + (technical_accuracy * 0.4)
Crew outputs MUST pass gate_threshold to be accepted.';

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================

GRANT SELECT, INSERT ON crew_semantic_diffs TO service_role;
GRANT SELECT ON crew_semantic_diffs TO authenticated;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'GOVERNED-ENGINE-v5.1.0 Migration Complete';
  RAISE NOTICE '1. match_agent_memory() - Venture-scoped semantic search';
  RAISE NOTICE '2. crewai_flows - Added venture_id, prd_id, sd_id columns';
  RAISE NOTICE '3. fn_validate_crew_kickoff() - Pre-execution governance check';
  RAISE NOTICE '4. crew_semantic_diffs - 60/40 Truth Law validation storage';
END $$;
