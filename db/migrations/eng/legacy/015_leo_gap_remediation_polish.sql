-- LEO Protocol Gap Remediation Polish
-- Surgical improvements to close the loop
-- Version: 1.0.0
-- Date: 2025-01-17
-- Purpose: Polish the gap remediation with RLS, constraints, and Gate 3 authority

-- ============================================
-- 1. Make Gate 3 the single source of EXEC authorization
-- ============================================

-- Update the trigger to also check Gate 3 (supervisor validation)
CREATE OR REPLACE FUNCTION check_gates_before_exec()
RETURNS TRIGGER AS $$
DECLARE
  v_gate_count INTEGER;
  v_passed_count INTEGER;
  v_is_exec_agent BOOLEAN;
  v_gate3_passed BOOLEAN;
BEGIN
  -- Check if this is an EXEC or IMPLEMENTATION sub-agent
  SELECT EXISTS (
    SELECT 1 FROM leo_sub_agents
    WHERE id = NEW.sub_agent_id
    AND code IN ('EXEC', 'IMPLEMENTATION')
  ) INTO v_is_exec_agent;

  -- Only apply gate checks for EXEC agents
  IF NOT v_is_exec_agent THEN
    RETURN NEW;
  END IF;

  -- Only check for new executions or status changes to 'running'
  IF (TG_OP = 'INSERT' AND NEW.status IN ('pending', 'running')) OR
     (TG_OP = 'UPDATE' AND NEW.status = 'running' AND OLD.status != 'running') THEN

    -- Count how many gates 2A-2D have passed (score >= 85)
    SELECT COUNT(DISTINCT gate) INTO v_passed_count
    FROM (
      SELECT gate, MAX(score) as max_score
      FROM leo_gate_reviews
      WHERE prd_id = NEW.prd_id
      AND gate IN ('2A', '2B', '2C', '2D')
      GROUP BY gate
      HAVING MAX(score) >= 85
    ) gates_passed;

    -- Check if Gate 3 (supervisor) has passed
    SELECT EXISTS (
      SELECT 1 FROM leo_gate_reviews
      WHERE prd_id = NEW.prd_id
      AND gate = '3'
      AND score >= 85
    ) INTO v_gate3_passed;

    -- Check if all gates have passed (2A-2D + Gate 3)
    IF v_passed_count < 4 THEN
      RAISE EXCEPTION 'Cannot start EXEC for PRD %: Only % of 4 required gates (2A-2D) have passed (score >= 85)',
        NEW.prd_id, v_passed_count;
    END IF;

    IF NOT v_gate3_passed THEN
      RAISE EXCEPTION 'Cannot start EXEC for PRD %: Gate 3 (Supervisor Verification) has not passed (score >= 85)',
        NEW.prd_id;
    END IF;

    -- Update exec_authorizations table with Gate 3 as authorizer
    INSERT INTO exec_authorizations (
      prd_id,
      gates_passed,
      gate_2a_score,
      gate_2b_score,
      gate_2c_score,
      gate_2d_score,
      authorized_at,
      authorized_by
    )
    SELECT
      NEW.prd_id,
      true,
      MAX(CASE WHEN gate = '2A' THEN score END),
      MAX(CASE WHEN gate = '2B' THEN score END),
      MAX(CASE WHEN gate = '2C' THEN score END),
      MAX(CASE WHEN gate = '2D' THEN score END),
      NOW(),
      'Gate 3 Supervisor'
    FROM leo_gate_reviews
    WHERE prd_id = NEW.prd_id
    AND gate IN ('2A', '2B', '2C', '2D')
    ON CONFLICT (prd_id)
    DO UPDATE SET
      gates_passed = true,
      gate_2a_score = EXCLUDED.gate_2a_score,
      gate_2b_score = EXCLUDED.gate_2b_score,
      gate_2c_score = EXCLUDED.gate_2c_score,
      gate_2d_score = EXCLUDED.gate_2d_score,
      authorized_at = NOW(),
      authorized_by = 'Gate 3 Supervisor';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 2. RLS Policies for exec_authorizations
-- ============================================

-- Enable RLS on exec_authorizations
ALTER TABLE exec_authorizations ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read authorization status
CREATE POLICY "exec_authorizations_read_all" ON exec_authorizations
  FOR SELECT
  USING (true);

-- Policy: Only system/service role can insert/update
CREATE POLICY "exec_authorizations_write_system" ON exec_authorizations
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- 3. Validation Constraints
-- ============================================

-- Tighten port constraint
ALTER TABLE prds DROP CONSTRAINT IF EXISTS prds_port_check;
ALTER TABLE prds
ADD CONSTRAINT prds_port_check
CHECK (port IS NULL OR (port BETWEEN 1 AND 65535));

-- Add URL validation (basic format check)
ALTER TABLE prds
ADD CONSTRAINT prds_target_url_format
CHECK (
  target_url IS NULL OR
  target_url ~ '^https?://[a-zA-Z0-9.-]+(:[0-9]+)?(/.*)?$'
);

-- Add component name format (no special chars that could break paths)
ALTER TABLE prds
ADD CONSTRAINT prds_component_name_format
CHECK (
  component_name IS NULL OR
  component_name ~ '^[a-zA-Z][a-zA-Z0-9_-]*$'
);

-- ============================================
-- 4. Performance Indexes
-- ============================================

-- Compound index for component lookups
CREATE INDEX IF NOT EXISTS idx_prds_id_component
ON prds(id, component_name)
WHERE component_name IS NOT NULL;

-- Index for exec authorization lookups
CREATE INDEX IF NOT EXISTS idx_exec_auth_prd_gates
ON exec_authorizations(prd_id, gates_passed);

-- Index for gate review lookups (used in trigger)
CREATE INDEX IF NOT EXISTS idx_gate_reviews_prd_gate_score
ON leo_gate_reviews(prd_id, gate, score DESC);

-- ============================================
-- 5. Structured Execution Plan Table
-- ============================================

CREATE TABLE IF NOT EXISTS leo_execution_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL UNIQUE,
  prd_id TEXT NOT NULL REFERENCES prds(id),
  sequence_number INTEGER NOT NULL,
  description TEXT NOT NULL,

  -- Files this task will modify
  files TEXT[] DEFAULT '{}',

  -- Task dependencies (other task_ids that must complete first)
  depends_on TEXT[] DEFAULT '{}',

  -- Acceptance criteria references
  acceptance_refs JSONB DEFAULT '[]',

  -- Execution tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  executed_by TEXT,

  -- Results and evidence
  results JSONB DEFAULT '{}',
  error_message TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT current_user,

  -- Constraints
  CONSTRAINT unique_prd_sequence UNIQUE (prd_id, sequence_number),
  CONSTRAINT valid_sequence CHECK (sequence_number > 0)
);

-- Index for execution queries
CREATE INDEX idx_execution_plan_prd_status ON leo_execution_plan(prd_id, status);
CREATE INDEX idx_execution_plan_sequence ON leo_execution_plan(prd_id, sequence_number);

-- RLS for execution plan
ALTER TABLE leo_execution_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "execution_plan_read_all" ON leo_execution_plan
  FOR SELECT USING (true);

CREATE POLICY "execution_plan_write_agents" ON leo_execution_plan
  FOR ALL
  USING (auth.role() IN ('service_role', 'authenticated'))
  WITH CHECK (auth.role() IN ('service_role', 'authenticated'));

-- ============================================
-- 6. Enhanced EXEC Readiness View (with Gate 3)
-- ============================================

CREATE OR REPLACE VIEW v_exec_readiness AS
SELECT
  p.id as prd_id,
  p.title,
  p.status as prd_status,
  p.target_url,
  p.component_name,
  p.app_path,
  p.port,
  -- Gate scores
  COALESCE(g2a.score, 0) as gate_2a_score,
  COALESCE(g2b.score, 0) as gate_2b_score,
  COALESCE(g2c.score, 0) as gate_2c_score,
  COALESCE(g2d.score, 0) as gate_2d_score,
  COALESCE(g3.score, 0) as gate_3_score,
  -- Gate pass status
  COALESCE(g2a.score >= 85, false) as gate_2a_passed,
  COALESCE(g2b.score >= 85, false) as gate_2b_passed,
  COALESCE(g2c.score >= 85, false) as gate_2c_passed,
  COALESCE(g2d.score >= 85, false) as gate_2d_passed,
  COALESCE(g3.score >= 85, false) as gate_3_passed,
  -- Missing requirements (for dashboard display)
  CASE
    WHEN p.target_url IS NULL THEN 'Missing target URL'
    WHEN p.component_name IS NULL THEN 'Missing component name'
    WHEN COALESCE(g2a.score, 0) < 85 THEN 'Gate 2A not passed'
    WHEN COALESCE(g2b.score, 0) < 85 THEN 'Gate 2B not passed'
    WHEN COALESCE(g2c.score, 0) < 85 THEN 'Gate 2C not passed'
    WHEN COALESCE(g2d.score, 0) < 85 THEN 'Gate 2D not passed'
    WHEN COALESCE(g3.score, 0) < 85 THEN 'Gate 3 (Supervisor) not passed'
    ELSE 'Ready'
  END as readiness_status,
  -- Overall readiness (requires Gate 3!)
  CASE
    WHEN p.target_url IS NOT NULL
     AND p.component_name IS NOT NULL
     AND COALESCE(g2a.score, 0) >= 85
     AND COALESCE(g2b.score, 0) >= 85
     AND COALESCE(g2c.score, 0) >= 85
     AND COALESCE(g2d.score, 0) >= 85
     AND COALESCE(g3.score, 0) >= 85  -- Gate 3 required!
    THEN true
    ELSE false
  END as exec_ready,
  -- Authorization status
  ea.gates_passed as exec_authorized,
  ea.authorized_at,
  ea.authorized_by,
  -- Execution plan status
  ep.task_count,
  ep.completed_count,
  ep.progress_percentage
FROM prds p
LEFT JOIN LATERAL (
  SELECT MAX(score) as score
  FROM leo_gate_reviews
  WHERE prd_id = p.id AND gate = '2A'
) g2a ON true
LEFT JOIN LATERAL (
  SELECT MAX(score) as score
  FROM leo_gate_reviews
  WHERE prd_id = p.id AND gate = '2B'
) g2b ON true
LEFT JOIN LATERAL (
  SELECT MAX(score) as score
  FROM leo_gate_reviews
  WHERE prd_id = p.id AND gate = '2C'
) g2c ON true
LEFT JOIN LATERAL (
  SELECT MAX(score) as score
  FROM leo_gate_reviews
  WHERE prd_id = p.id AND gate = '2D'
) g2d ON true
LEFT JOIN LATERAL (
  SELECT MAX(score) as score
  FROM leo_gate_reviews
  WHERE prd_id = p.id AND gate = '3'
) g3 ON true
LEFT JOIN exec_authorizations ea ON ea.prd_id = p.id
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) as task_count,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
    CASE
      WHEN COUNT(*) > 0
      THEN (COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / COUNT(*))::INTEGER
      ELSE 0
    END as progress_percentage
  FROM leo_execution_plan
  WHERE prd_id = p.id
) ep ON true;

-- ============================================
-- 7. Add Gate 3 requirement to validation rules
-- ============================================

UPDATE leo_validation_rules
SET criteria = jsonb_set(
  criteria,
  '{description}',
  '"All gates (2A-2D) must pass at ≥85% AND Gate 3 Supervisor must approve"'::jsonb
)
WHERE gate = '3' AND rule_name = 'supervisorChecklistPass';

-- ============================================
-- Verification queries
-- ============================================

-- Check enhanced readiness with Gate 3:
-- SELECT * FROM v_exec_readiness;

-- Check execution plan:
-- SELECT * FROM leo_execution_plan WHERE prd_id = 'PRD-SD-001' ORDER BY sequence_number;

-- Check RLS is working:
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE tablename IN ('exec_authorizations', 'leo_execution_plan');

COMMENT ON TABLE leo_execution_plan IS 'Structured task list for EXEC agent - the unambiguous step-by-step plan';
COMMENT ON VIEW v_exec_readiness IS 'Single source of truth for EXEC readiness - requires Gate 3 supervisor approval';