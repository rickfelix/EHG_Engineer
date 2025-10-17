-- =====================================================
-- BMAD Enhancement: Risk Assessment & Context Engineering
-- Migration: 009_bmad_risk_assessment.sql
-- Purpose: Add risk assessment, enhanced user stories, test plans, checkpoint tracking
-- =====================================================

-- =====================================================
-- 1. RISK ASSESSMENTS TABLE
-- =====================================================
-- Stores multi-domain risk assessments for Strategic Directives
-- Triggered during LEAD Pre-Approval and PLAN PRD Creation phases

CREATE TABLE IF NOT EXISTS risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id TEXT NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,

  -- Assessment metadata
  assessed_at TIMESTAMPTZ DEFAULT NOW(),
  assessed_by TEXT DEFAULT 'RISK', -- Sub-agent code
  phase TEXT NOT NULL CHECK (phase IN ('LEAD_PRE_APPROVAL', 'PLAN_PRD', 'EXEC_IMPL', 'PLAN_VERIFY')),

  -- Risk domains (1-10 scale, 1=low risk, 10=critical risk)
  technical_complexity SMALLINT CHECK (technical_complexity BETWEEN 1 AND 10),
  security_risk SMALLINT CHECK (security_risk BETWEEN 1 AND 10),
  performance_risk SMALLINT CHECK (performance_risk BETWEEN 1 AND 10),
  integration_risk SMALLINT CHECK (integration_risk BETWEEN 1 AND 10),
  data_migration_risk SMALLINT CHECK (data_migration_risk BETWEEN 1 AND 10),
  ui_ux_risk SMALLINT CHECK (ui_ux_risk BETWEEN 1 AND 10),

  -- Composite risk score (calculated from domains)
  overall_risk_score DECIMAL(4,2), -- Average of all domains
  risk_level TEXT CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),

  -- Analysis results
  critical_issues JSONB DEFAULT '[]'::jsonb, -- Array of blocking issues
  warnings JSONB DEFAULT '[]'::jsonb, -- Array of non-blocking warnings
  recommendations JSONB DEFAULT '[]'::jsonb, -- Array of recommended mitigations

  -- Verdict
  verdict TEXT CHECK (verdict IN ('PASS', 'CONDITIONAL_PASS', 'FAIL', 'ESCALATE')),
  confidence INTEGER CHECK (confidence BETWEEN 0 AND 100),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_risk_assessments_sd_id ON risk_assessments(sd_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_phase ON risk_assessments(phase);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_risk_level ON risk_assessments(risk_level);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_verdict ON risk_assessments(verdict);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_risk_assessments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_risk_assessments_updated_at ON risk_assessments;
CREATE TRIGGER trigger_risk_assessments_updated_at
BEFORE UPDATE ON risk_assessments
FOR EACH ROW
EXECUTE FUNCTION update_risk_assessments_updated_at();

COMMENT ON TABLE risk_assessments IS 'BMAD Enhancement: Multi-domain risk assessment for Strategic Directives';
COMMENT ON COLUMN risk_assessments.technical_complexity IS '1-10 scale: Code complexity, refactoring needs, technical debt';
COMMENT ON COLUMN risk_assessments.security_risk IS '1-10 scale: Auth, data exposure, RLS, vulnerabilities';
COMMENT ON COLUMN risk_assessments.performance_risk IS '1-10 scale: Query optimization, caching, scaling concerns';
COMMENT ON COLUMN risk_assessments.integration_risk IS '1-10 scale: Third-party APIs, service dependencies';
COMMENT ON COLUMN risk_assessments.data_migration_risk IS '1-10 scale: Schema changes, data integrity, rollback complexity';
COMMENT ON COLUMN risk_assessments.ui_ux_risk IS '1-10 scale: Component complexity, accessibility, responsive design';


-- =====================================================
-- 2. ENHANCED USER STORIES (Context Engineering)
-- =====================================================
-- Add BMAD-inspired context columns to existing user_stories table

ALTER TABLE user_stories
ADD COLUMN IF NOT EXISTS implementation_context TEXT,
ADD COLUMN IF NOT EXISTS architecture_references JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS example_code_patterns JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS testing_scenarios JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN user_stories.implementation_context IS 'BMAD Enhancement: Hyper-detailed implementation guidance (architecture patterns, component locations, integration points)';
COMMENT ON COLUMN user_stories.architecture_references IS 'BMAD Enhancement: Array of relevant architecture docs, component paths, existing patterns to follow';
COMMENT ON COLUMN user_stories.example_code_patterns IS 'BMAD Enhancement: Array of code examples, patterns, snippets to guide implementation';
COMMENT ON COLUMN user_stories.testing_scenarios IS 'BMAD Enhancement: Array of test scenarios with expected inputs/outputs';


-- =====================================================
-- 3. TEST PLANS TABLE
-- =====================================================
-- Stores test architecture plans created during PLAN phase
-- Replaces ad-hoc test planning with structured approach

CREATE TABLE IF NOT EXISTS test_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id TEXT NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
  prd_id TEXT REFERENCES product_requirements_v2(id) ON DELETE CASCADE,

  -- Test plan metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'TESTING', -- Sub-agent code
  approved_at TIMESTAMPTZ,
  approved_by TEXT, -- PLAN agent

  -- Test architecture
  unit_test_strategy JSONB, -- { files: [], coverage_targets: {}, frameworks: [] }
  e2e_test_strategy JSONB, -- { scenarios: [], user_flows: [], test_data: {} }
  integration_test_strategy JSONB, -- { apis: [], databases: [], external_services: [] }
  performance_test_strategy JSONB, -- { load_targets: {}, response_times: {}, concurrency: {} }

  -- Test infrastructure requirements
  test_data_requirements JSONB DEFAULT '[]'::jsonb, -- Array of test data needs
  mock_requirements JSONB DEFAULT '[]'::jsonb, -- Array of mocks/stubs needed
  environment_requirements JSONB DEFAULT '[]'::jsonb, -- Array of environment setup needs

  -- Estimates
  estimated_unit_tests INTEGER,
  estimated_e2e_tests INTEGER,
  estimated_test_development_hours DECIMAL(5,2),

  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_test_plans_sd_id ON test_plans(sd_id);
CREATE INDEX IF NOT EXISTS idx_test_plans_prd_id ON test_plans(prd_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_test_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_test_plans_updated_at ON test_plans;
CREATE TRIGGER trigger_test_plans_updated_at
BEFORE UPDATE ON test_plans
FOR EACH ROW
EXECUTE FUNCTION update_test_plans_updated_at();

COMMENT ON TABLE test_plans IS 'BMAD Enhancement: Structured test architecture planning for Strategic Directives';
COMMENT ON COLUMN test_plans.unit_test_strategy IS 'Unit testing strategy: files to test, coverage targets, testing frameworks';
COMMENT ON COLUMN test_plans.e2e_test_strategy IS 'E2E testing strategy: user flows, scenarios, test data requirements';


-- =====================================================
-- 4. CHECKPOINT TRACKING
-- =====================================================
-- Add checkpoint planning column to strategic_directives_v2
-- Enforces checkpoint pattern for large SDs (>8 user stories)

ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS checkpoint_plan JSONB;

COMMENT ON COLUMN strategic_directives_v2.checkpoint_plan IS 'BMAD Enhancement: Checkpoint plan for large SDs (>8 user stories). Structure: { checkpoints: [{ id: 1, user_stories: ["US-001", "US-002"], estimated_hours: 3, milestone: "Component creation" }], total_checkpoints: 3 }';

-- Database constraint: Require checkpoint plan for large SDs
-- This will be enforced at application level (not database constraint)
-- to avoid blocking legitimate edge cases


-- =====================================================
-- 5. RETROSPECTIVE ENHANCEMENTS
-- =====================================================
-- Add BMAD-inspired columns to existing retrospectives table

ALTER TABLE retrospectives
ADD COLUMN IF NOT EXISTS risk_accuracy_score SMALLINT CHECK (risk_accuracy_score BETWEEN 0 AND 100),
ADD COLUMN IF NOT EXISTS checkpoint_effectiveness SMALLINT CHECK (checkpoint_effectiveness BETWEEN 0 AND 100),
ADD COLUMN IF NOT EXISTS context_efficiency_rating SMALLINT CHECK (context_efficiency_rating BETWEEN 0 AND 100),
ADD COLUMN IF NOT EXISTS bmad_insights JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN retrospectives.risk_accuracy_score IS 'BMAD Enhancement: How accurate was initial risk assessment vs actual issues (0-100)';
COMMENT ON COLUMN retrospectives.checkpoint_effectiveness IS 'BMAD Enhancement: How effective were checkpoints in catching issues early (0-100, null if no checkpoints used)';
COMMENT ON COLUMN retrospectives.context_efficiency_rating IS 'BMAD Enhancement: How well did context engineering reduce EXEC confusion (0-100)';
COMMENT ON COLUMN retrospectives.bmad_insights IS 'BMAD Enhancement: Structured insights: { risk_lessons: [], checkpoint_lessons: [], context_lessons: [] }';


-- =====================================================
-- 6. SUB-AGENT EXECUTION RESULTS ENHANCEMENT
-- =====================================================
-- Add risk assessment metadata to sub-agent results

ALTER TABLE sub_agent_execution_results
ADD COLUMN IF NOT EXISTS risk_assessment_id UUID REFERENCES risk_assessments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sub_agent_results_risk_assessment ON sub_agent_execution_results(risk_assessment_id);

COMMENT ON COLUMN sub_agent_execution_results.risk_assessment_id IS 'BMAD Enhancement: Link to risk assessment if this execution was for RISK sub-agent';


-- =====================================================
-- 7. GRANT PERMISSIONS (if using RLS)
-- =====================================================

-- Grant access to authenticated users (adjust as needed for your RLS policies)
GRANT ALL ON risk_assessments TO authenticated;
GRANT ALL ON test_plans TO authenticated;

-- Grant access to service role (for scripts)
GRANT ALL ON risk_assessments TO service_role;
GRANT ALL ON test_plans TO service_role;


-- =====================================================
-- 8. VERIFICATION QUERIES
-- =====================================================

-- Verify tables created
DO $$
DECLARE
  table_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('risk_assessments', 'test_plans');

  IF table_count = 2 THEN
    RAISE NOTICE '✅ Migration 009: Tables created successfully (risk_assessments, test_plans)';
  ELSE
    RAISE WARNING '⚠️ Migration 009: Expected 2 tables, found %', table_count;
  END IF;
END $$;

-- Verify columns added
DO $$
DECLARE
  column_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO column_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      (table_name = 'user_stories' AND column_name IN ('implementation_context', 'architecture_references', 'example_code_patterns', 'testing_scenarios'))
      OR (table_name = 'strategic_directives_v2' AND column_name = 'checkpoint_plan')
      OR (table_name = 'retrospectives' AND column_name IN ('risk_accuracy_score', 'checkpoint_effectiveness', 'context_efficiency_rating', 'bmad_insights'))
      OR (table_name = 'sub_agent_execution_results' AND column_name = 'risk_assessment_id')
    );

  IF column_count >= 10 THEN
    RAISE NOTICE '✅ Migration 009: Columns added successfully (% columns found)', column_count;
  ELSE
    RAISE WARNING '⚠️ Migration 009: Expected >= 10 columns, found %', column_count;
  END IF;
END $$;


-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Next steps:
-- 1. Create Risk Assessment sub-agent module (lib/sub-agents/risk.js)
-- 2. Add RISK to orchestrator mapping (scripts/orchestrate-phase-subagents.js)
-- 3. Add RISK entry to leo_sub_agents table
-- 4. Test with a Strategic Directive
-- =====================================================
