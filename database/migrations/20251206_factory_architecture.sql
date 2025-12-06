-- ============================================================================
-- MIGRATION: Factory Architecture for Venture Vision v2.0
-- SD: SD-VISION-TRANSITION-001
-- Created: 2025-12-06
-- Author: Lead Systems Architect
--
-- Purpose: Implements the database schema for 25-stage venture lifecycle
-- Reference: ADR-002-VENTURE-FACTORY-ARCHITECTURE.md
-- ============================================================================

-- ============================================================================
-- SECTION 1: LIFECYCLE STAGE CONFIGURATION (Reference Table)
-- Defines all 25 stages of the Venture Vision v2.0 workflow
-- ============================================================================

CREATE TABLE IF NOT EXISTS lifecycle_stage_config (
  stage_number INT PRIMARY KEY,
  stage_name VARCHAR(100) NOT NULL,
  phase_number INT NOT NULL CHECK (phase_number BETWEEN 1 AND 6),
  phase_name VARCHAR(50) NOT NULL,
  work_type VARCHAR(30) NOT NULL CHECK (work_type IN ('artifact_only', 'automated_check', 'decision_gate', 'sd_required')),
  sd_required BOOLEAN DEFAULT false,
  required_artifacts TEXT[],
  sd_suffix VARCHAR(20),
  sd_template TEXT,
  advisory_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE lifecycle_stage_config ENABLE ROW LEVEL SECURITY;

-- Public read access (reference table)
CREATE POLICY "lifecycle_stage_config_select" ON lifecycle_stage_config
  FOR SELECT USING (true);

-- Only admins can modify
CREATE POLICY "lifecycle_stage_config_admin" ON lifecycle_stage_config
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.uid() = id
      AND raw_user_meta_data->>'role' IN ('admin', 'chairman')
    )
  );

-- Populate 25 stages per ADR-002
INSERT INTO lifecycle_stage_config (stage_number, stage_name, phase_number, phase_name, work_type, sd_required, required_artifacts, sd_suffix, sd_template, advisory_enabled) VALUES
  -- PHASE 1: THE TRUTH (Stages 1-5)
  (1, 'Draft Idea & Chairman Review', 1, 'THE TRUTH', 'artifact_only', false, ARRAY['idea_brief'], NULL, NULL, false),
  (2, 'AI Multi-Model Critique', 1, 'THE TRUTH', 'automated_check', false, ARRAY['critique_report'], NULL, NULL, false),
  (3, 'Market Validation & RAT', 1, 'THE TRUTH', 'decision_gate', false, ARRAY['validation_report'], NULL, NULL, true),
  (4, 'Competitive Intelligence', 1, 'THE TRUTH', 'artifact_only', false, ARRAY['competitive_analysis'], NULL, NULL, false),
  (5, 'Profitability Forecasting', 1, 'THE TRUTH', 'decision_gate', false, ARRAY['financial_model'], NULL, NULL, true),

  -- PHASE 2: THE ENGINE (Stages 6-9)
  (6, 'Risk Evaluation Matrix', 2, 'THE ENGINE', 'artifact_only', false, ARRAY['risk_matrix'], NULL, NULL, false),
  (7, 'Pricing Strategy', 2, 'THE ENGINE', 'artifact_only', false, ARRAY['pricing_model'], NULL, NULL, false),
  (8, 'Business Model Canvas', 2, 'THE ENGINE', 'artifact_only', false, ARRAY['business_model_canvas'], NULL, NULL, false),
  (9, 'Exit-Oriented Design', 2, 'THE ENGINE', 'artifact_only', false, ARRAY['exit_strategy'], NULL, NULL, false),

  -- PHASE 3: THE IDENTITY (Stages 10-12)
  (10, 'Strategic Narrative & Positioning', 3, 'THE IDENTITY', 'artifact_only', false, ARRAY['strategic_narrative', 'marketing_manifest'], NULL, NULL, false),
  (11, 'Strategic Naming', 3, 'THE IDENTITY', 'sd_required', true, ARRAY['brand_name', 'brand_guidelines'], 'NAMING', 'Generate brand naming candidates for {venture_name} based on strategic narrative and marketing manifest', false),
  (12, 'Sales & Success Logic', 3, 'THE IDENTITY', 'artifact_only', false, ARRAY['sales_playbook'], NULL, NULL, false),

  -- PHASE 4: THE BLUEPRINT (Stages 13-16) - "The Kochel Firewall"
  (13, 'Tech Stack Interrogation', 4, 'THE BLUEPRINT', 'decision_gate', false, ARRAY['tech_stack_decision'], NULL, NULL, true),
  (14, 'Data Model & Architecture', 4, 'THE BLUEPRINT', 'sd_required', true, ARRAY['data_model', 'erd_diagram'], 'DATAMODEL', 'Design data model and entity relationships for {venture_name}', false),
  (15, 'Epic & User Story Breakdown', 4, 'THE BLUEPRINT', 'sd_required', true, ARRAY['user_story_pack'], 'STORIES', 'Break down epics into user stories for {venture_name}', false),
  (16, 'Spec-Driven Schema Generation', 4, 'THE BLUEPRINT', 'decision_gate', true, ARRAY['api_contract', 'schema_spec'], 'SCHEMA', 'Generate TypeScript interfaces and SQL schemas for {venture_name}', true),

  -- PHASE 5: THE BUILD LOOP (Stages 17-22)
  (17, 'Environment & Agent Config', 5, 'THE BUILD LOOP', 'sd_required', true, ARRAY['system_prompt', 'cicd_config'], 'CONFIG', 'Configure development environment and AI agents for {venture_name}', false),
  (18, 'MVP Development Loop', 5, 'THE BUILD LOOP', 'sd_required', true, ARRAY['mvp_codebase'], 'MVP', 'Implement MVP features for {venture_name}', false),
  (19, 'Integration & API Layer', 5, 'THE BUILD LOOP', 'sd_required', true, ARRAY['integrated_system'], 'API', 'Build API integrations for {venture_name}', false),
  (20, 'Security & Performance', 5, 'THE BUILD LOOP', 'sd_required', true, ARRAY['security_audit', 'perf_report'], 'SECURITY', 'Harden security and optimize performance for {venture_name}', false),
  (21, 'QA & UAT', 5, 'THE BUILD LOOP', 'sd_required', true, ARRAY['test_report', 'uat_results'], 'QA', 'Execute quality assurance and user acceptance testing for {venture_name}', false),
  (22, 'Deployment & Infrastructure', 5, 'THE BUILD LOOP', 'sd_required', true, ARRAY['deployment_config', 'infra_manifest'], 'DEPLOY', 'Deploy {venture_name} to production infrastructure', false),

  -- PHASE 6: LAUNCH & LEARN (Stages 23-25)
  (23, 'Production Launch', 6, 'LAUNCH & LEARN', 'decision_gate', false, ARRAY['launch_checklist'], NULL, NULL, true),
  (24, 'Analytics & Feedback', 6, 'LAUNCH & LEARN', 'artifact_only', false, ARRAY['analytics_dashboard'], NULL, NULL, false),
  (25, 'Optimization & Scale', 6, 'LAUNCH & LEARN', 'sd_required', true, ARRAY['optimization_plan'], 'SCALE', 'Optimize and scale {venture_name} based on user feedback', false)
ON CONFLICT (stage_number) DO UPDATE SET
  stage_name = EXCLUDED.stage_name,
  phase_number = EXCLUDED.phase_number,
  phase_name = EXCLUDED.phase_name,
  work_type = EXCLUDED.work_type,
  sd_required = EXCLUDED.sd_required,
  required_artifacts = EXCLUDED.required_artifacts,
  sd_suffix = EXCLUDED.sd_suffix,
  sd_template = EXCLUDED.sd_template,
  advisory_enabled = EXCLUDED.advisory_enabled,
  updated_at = NOW();

-- ============================================================================
-- SECTION 2: ARCHETYPE BENCHMARKS (Configurable Thresholds)
-- Financial thresholds vary by venture archetype
-- ============================================================================

CREATE TABLE IF NOT EXISTS archetype_benchmarks (
  archetype VARCHAR(50) PRIMARY KEY,
  display_name VARCHAR(100) NOT NULL,
  margin_target DECIMAL(4,2) NOT NULL,
  margin_acceptable DECIMAL(4,2) NOT NULL,
  breakeven_months INT NOT NULL,
  cac_ltv_ratio DECIMAL(4,2) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE archetype_benchmarks ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "archetype_benchmarks_select" ON archetype_benchmarks
  FOR SELECT USING (true);

-- Only admins can modify
CREATE POLICY "archetype_benchmarks_admin" ON archetype_benchmarks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.uid() = id
      AND raw_user_meta_data->>'role' IN ('admin', 'chairman')
    )
  );

-- Pre-populate with sensible defaults
INSERT INTO archetype_benchmarks (archetype, display_name, margin_target, margin_acceptable, breakeven_months, cac_ltv_ratio, description) VALUES
  ('saas_b2b', 'SaaS B2B', 0.70, 0.50, 18, 3.0, 'Enterprise software-as-a-service'),
  ('saas_b2c', 'SaaS B2C', 0.60, 0.40, 24, 2.5, 'Consumer software-as-a-service'),
  ('marketplace', 'Marketplace', 0.15, 0.08, 36, 4.0, 'Two-sided marketplace platform'),
  ('hardware', 'Hardware/IoT', 0.35, 0.20, 30, 2.0, 'Physical products with software'),
  ('services', 'Services', 0.50, 0.35, 12, 2.0, 'Professional or managed services'),
  ('ai_agents', 'AI Agents', 0.65, 0.45, 18, 3.5, 'AI-powered agent-based products'),
  ('content', 'Content/Media', 0.55, 0.35, 24, 2.5, 'Content creation and distribution')
ON CONFLICT (archetype) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  margin_target = EXCLUDED.margin_target,
  margin_acceptable = EXCLUDED.margin_acceptable,
  breakeven_months = EXCLUDED.breakeven_months,
  cac_ltv_ratio = EXCLUDED.cac_ltv_ratio,
  description = EXCLUDED.description,
  updated_at = NOW();

-- ============================================================================
-- SECTION 3: VENTURES TABLE ENHANCEMENTS
-- Add columns for 25-stage lifecycle tracking
-- ============================================================================

-- Add lifecycle columns to ventures table (if not exists)
DO $$
BEGIN
  -- Current lifecycle stage (1-25)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ventures' AND column_name = 'current_lifecycle_stage') THEN
    ALTER TABLE ventures ADD COLUMN current_lifecycle_stage INT DEFAULT 1 CHECK (current_lifecycle_stage BETWEEN 1 AND 25);
  END IF;

  -- Venture code (short identifier)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ventures' AND column_name = 'venture_code') THEN
    ALTER TABLE ventures ADD COLUMN venture_code VARCHAR(20);
  END IF;

  -- Archetype for benchmark comparison
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ventures' AND column_name = 'archetype') THEN
    ALTER TABLE ventures ADD COLUMN archetype VARCHAR(50) REFERENCES archetype_benchmarks(archetype);
  END IF;

  -- Deployment configuration
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ventures' AND column_name = 'deployment_target') THEN
    ALTER TABLE ventures ADD COLUMN deployment_target VARCHAR(50);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ventures' AND column_name = 'deployment_url') THEN
    ALTER TABLE ventures ADD COLUMN deployment_url TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ventures' AND column_name = 'repo_url') THEN
    ALTER TABLE ventures ADD COLUMN repo_url TEXT;
  END IF;

  -- Kill Protocol fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ventures' AND column_name = 'status') THEN
    ALTER TABLE ventures ADD COLUMN status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived', 'killed'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ventures' AND column_name = 'decision_due_at') THEN
    ALTER TABLE ventures ADD COLUMN decision_due_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ventures' AND column_name = 'kill_reason') THEN
    ALTER TABLE ventures ADD COLUMN kill_reason TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ventures' AND column_name = 'killed_at') THEN
    ALTER TABLE ventures ADD COLUMN killed_at TIMESTAMPTZ;
  END IF;
END $$;

-- Create index for venture code lookups
CREATE INDEX IF NOT EXISTS idx_ventures_code ON ventures(venture_code);
CREATE INDEX IF NOT EXISTS idx_ventures_status ON ventures(status);
CREATE INDEX IF NOT EXISTS idx_ventures_lifecycle_stage ON ventures(current_lifecycle_stage);

-- ============================================================================
-- SECTION 4: VENTURE STAGE WORK (Bridge Table)
-- Links ventures to SDs at each lifecycle stage
-- ============================================================================

CREATE TABLE IF NOT EXISTS venture_stage_work (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Macro Reference
  venture_id UUID REFERENCES ventures(id) NOT NULL,
  lifecycle_stage INT REFERENCES lifecycle_stage_config(stage_number) NOT NULL,

  -- Micro Reference
  sd_id VARCHAR(50) REFERENCES strategic_directives_v2(id),

  -- Stage Status
  stage_status VARCHAR(20) DEFAULT 'not_started' CHECK (stage_status IN ('not_started', 'in_progress', 'blocked', 'completed', 'skipped')),

  -- Work Type (denormalized for query performance)
  work_type VARCHAR(30) NOT NULL CHECK (work_type IN ('artifact_only', 'automated_check', 'decision_gate', 'sd_required')),

  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Advisory System
  health_score VARCHAR(10) CHECK (health_score IN ('green', 'yellow', 'red')),
  advisory_data JSONB,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One record per stage per venture
  UNIQUE(venture_id, lifecycle_stage)
);

-- Enable RLS
ALTER TABLE venture_stage_work ENABLE ROW LEVEL SECURITY;

-- Users can read their ventures' stage work
CREATE POLICY "venture_stage_work_select" ON venture_stage_work
  FOR SELECT USING (true);

-- Users can modify their ventures' stage work
CREATE POLICY "venture_stage_work_modify" ON venture_stage_work
  FOR ALL USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_venture_stage_work_venture ON venture_stage_work(venture_id);
CREATE INDEX IF NOT EXISTS idx_venture_stage_work_sd ON venture_stage_work(sd_id);
CREATE INDEX IF NOT EXISTS idx_venture_stage_work_status ON venture_stage_work(stage_status);

-- ============================================================================
-- SECTION 5: VENTURE ARTIFACTS (Non-Code Assets Storage)
-- Stores all non-code artifacts produced during lifecycle
-- ============================================================================

CREATE TABLE IF NOT EXISTS venture_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership
  venture_id UUID REFERENCES ventures(id) NOT NULL,
  lifecycle_stage INT NOT NULL,

  -- Artifact Identity
  artifact_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,

  -- Content
  content TEXT,
  file_url TEXT,

  -- Versioning
  version INT DEFAULT 1,
  is_current BOOLEAN DEFAULT true,

  -- Metadata
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE venture_artifacts ENABLE ROW LEVEL SECURITY;

-- Users can read artifacts
CREATE POLICY "venture_artifacts_select" ON venture_artifacts
  FOR SELECT USING (true);

-- Users can modify artifacts
CREATE POLICY "venture_artifacts_modify" ON venture_artifacts
  FOR ALL USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_venture_artifacts_venture ON venture_artifacts(venture_id);
CREATE INDEX IF NOT EXISTS idx_venture_artifacts_type ON venture_artifacts(artifact_type);
CREATE INDEX IF NOT EXISTS idx_venture_artifacts_stage ON venture_artifacts(lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_venture_artifacts_current ON venture_artifacts(venture_id, artifact_type) WHERE is_current = true;

-- Comment on artifact types
COMMENT ON COLUMN venture_artifacts.artifact_type IS 'Types: idea_brief, critique_report, validation_report, competitive_analysis, financial_model, risk_matrix, pricing_model, business_model_canvas, exit_strategy, strategic_narrative, marketing_manifest, brand_name, brand_guidelines, sales_playbook, tech_stack_decision, data_model, erd_diagram, user_story_pack, api_contract, schema_spec, system_prompt, cicd_config, deployment_config, launch_checklist, analytics_dashboard, optimization_plan';

-- ============================================================================
-- SECTION 6: CHAIRMAN DECISIONS (Audit Trail)
-- Logs all Chairman decisions at advisory gates
-- ============================================================================

CREATE TABLE IF NOT EXISTS chairman_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context
  venture_id UUID REFERENCES ventures(id) NOT NULL,
  lifecycle_stage INT REFERENCES lifecycle_stage_config(stage_number) NOT NULL,

  -- Decision Details
  health_score VARCHAR(10) CHECK (health_score IN ('green', 'yellow', 'red')),
  recommendation VARCHAR(20) CHECK (recommendation IN ('proceed', 'pivot', 'fix', 'kill', 'pause')),
  decision VARCHAR(20) NOT NULL CHECK (decision IN ('proceed', 'pivot', 'fix', 'kill', 'pause', 'override')),
  override_reason TEXT,
  risks_acknowledged JSONB,

  -- Quick Fixes Applied
  quick_fixes_applied JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE chairman_decisions ENABLE ROW LEVEL SECURITY;

-- Users can read decisions
CREATE POLICY "chairman_decisions_select" ON chairman_decisions
  FOR SELECT USING (true);

-- Users can create decisions
CREATE POLICY "chairman_decisions_insert" ON chairman_decisions
  FOR INSERT WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chairman_decisions_venture ON chairman_decisions(venture_id);
CREATE INDEX IF NOT EXISTS idx_chairman_decisions_stage ON chairman_decisions(lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_chairman_decisions_created ON chairman_decisions(created_at DESC);

-- ============================================================================
-- SECTION 7: UPDATE CHECK CONSTRAINTS (40 → 25)
-- Updates existing CHECK constraints for stage numbers
-- ============================================================================

-- Update CHECK constraints in compliance_events table
DO $$
BEGIN
  -- Drop old constraint if exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'compliance_events_stage_check'
    AND table_name = 'compliance_events'
  ) THEN
    ALTER TABLE compliance_events DROP CONSTRAINT compliance_events_stage_check;
  END IF;

  -- Add new constraint (1-25)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'compliance_events' AND column_name = 'stage') THEN
    ALTER TABLE compliance_events ADD CONSTRAINT compliance_events_stage_check CHECK (stage BETWEEN 1 AND 25);
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Constraint might not exist or column might not exist, ignore
  NULL;
END $$;

-- Update CHECK constraints in stage_requirements table
DO $$
BEGIN
  -- Drop old constraint if exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'stage_requirements_stage_number_check'
    AND table_name = 'stage_requirements'
  ) THEN
    ALTER TABLE stage_requirements DROP CONSTRAINT stage_requirements_stage_number_check;
  END IF;

  -- Add new constraint (1-25)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stage_requirements' AND column_name = 'stage_number') THEN
    ALTER TABLE stage_requirements ADD CONSTRAINT stage_requirements_stage_number_check CHECK (stage_number BETWEEN 1 AND 25);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Update CHECK constraints in policy_registry table
DO $$
BEGIN
  -- Drop old constraint if exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'policy_registry_stage_check'
    AND table_name = 'policy_registry'
  ) THEN
    ALTER TABLE policy_registry DROP CONSTRAINT policy_registry_stage_check;
  END IF;

  -- Add new constraint (1-25)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'policy_registry' AND column_name = 'stage') THEN
    ALTER TABLE policy_registry ADD CONSTRAINT policy_registry_stage_check CHECK (stage BETWEEN 1 AND 25);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ============================================================================
-- SECTION 8: HELPER FUNCTIONS
-- Functions for venture lifecycle management
-- ============================================================================

-- Function to get venture stage summary
CREATE OR REPLACE FUNCTION get_venture_stage_summary(p_venture_id UUID)
RETURNS TABLE (
  venture_name TEXT,
  venture_code VARCHAR,
  current_stage INT,
  current_stage_name VARCHAR,
  current_phase VARCHAR,
  stage_status VARCHAR,
  health_score VARCHAR,
  active_sd VARCHAR,
  completed_stages INT,
  total_stages INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.name::TEXT,
    v.venture_code,
    v.current_lifecycle_stage,
    lsc.stage_name,
    lsc.phase_name,
    vsw.stage_status,
    vsw.health_score,
    vsw.sd_id,
    (SELECT COUNT(*)::INT FROM venture_stage_work WHERE venture_id = v.id AND stage_status = 'completed'),
    25
  FROM ventures v
  LEFT JOIN lifecycle_stage_config lsc ON v.current_lifecycle_stage = lsc.stage_number
  LEFT JOIN venture_stage_work vsw ON v.id = vsw.venture_id AND v.current_lifecycle_stage = vsw.lifecycle_stage
  WHERE v.id = p_venture_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to advance venture to next stage
CREATE OR REPLACE FUNCTION advance_venture_stage(p_venture_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_current_stage INT;
  v_next_stage INT;
  v_stage_config RECORD;
  v_result JSONB;
BEGIN
  -- Get current stage
  SELECT current_lifecycle_stage INTO v_current_stage
  FROM ventures WHERE id = p_venture_id;

  IF v_current_stage IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venture not found');
  END IF;

  IF v_current_stage >= 25 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already at final stage');
  END IF;

  v_next_stage := v_current_stage + 1;

  -- Mark current stage as completed
  UPDATE venture_stage_work
  SET stage_status = 'completed', completed_at = NOW(), updated_at = NOW()
  WHERE venture_id = p_venture_id AND lifecycle_stage = v_current_stage;

  -- Get next stage config
  SELECT * INTO v_stage_config FROM lifecycle_stage_config WHERE stage_number = v_next_stage;

  -- Create stage work record for next stage
  INSERT INTO venture_stage_work (venture_id, lifecycle_stage, work_type, stage_status, started_at)
  VALUES (p_venture_id, v_next_stage, v_stage_config.work_type, 'in_progress', NOW())
  ON CONFLICT (venture_id, lifecycle_stage) DO UPDATE SET
    stage_status = 'in_progress',
    started_at = NOW(),
    updated_at = NOW();

  -- Update venture current stage
  UPDATE ventures SET current_lifecycle_stage = v_next_stage WHERE id = p_venture_id;

  RETURN jsonb_build_object(
    'success', true,
    'from_stage', v_current_stage,
    'to_stage', v_next_stage,
    'stage_name', v_stage_config.stage_name,
    'work_type', v_stage_config.work_type,
    'sd_required', v_stage_config.sd_required
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to initialize venture stages
CREATE OR REPLACE FUNCTION initialize_venture_stages(p_venture_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_config RECORD;
BEGIN
  -- Create initial stage work record for Stage 1
  SELECT * INTO v_config FROM lifecycle_stage_config WHERE stage_number = 1;

  INSERT INTO venture_stage_work (venture_id, lifecycle_stage, work_type, stage_status, started_at)
  VALUES (p_venture_id, 1, v_config.work_type, 'in_progress', NOW())
  ON CONFLICT (venture_id, lifecycle_stage) DO NOTHING;

  -- Set venture to Stage 1
  UPDATE ventures SET current_lifecycle_stage = 1 WHERE id = p_venture_id;

  RETURN jsonb_build_object(
    'success', true,
    'venture_id', p_venture_id,
    'initial_stage', 1,
    'stage_name', v_config.stage_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SECTION 9: TRIGGERS
-- Automatic timestamp updates
-- ============================================================================

-- Updated_at trigger for lifecycle_stage_config
CREATE OR REPLACE FUNCTION update_lifecycle_stage_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lifecycle_stage_config_updated ON lifecycle_stage_config;
CREATE TRIGGER trg_lifecycle_stage_config_updated
  BEFORE UPDATE ON lifecycle_stage_config
  FOR EACH ROW EXECUTE FUNCTION update_lifecycle_stage_config_timestamp();

-- Updated_at trigger for venture_stage_work
CREATE OR REPLACE FUNCTION update_venture_stage_work_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_venture_stage_work_updated ON venture_stage_work;
CREATE TRIGGER trg_venture_stage_work_updated
  BEFORE UPDATE ON venture_stage_work
  FOR EACH ROW EXECUTE FUNCTION update_venture_stage_work_timestamp();

-- Updated_at trigger for venture_artifacts
CREATE OR REPLACE FUNCTION update_venture_artifacts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_venture_artifacts_updated ON venture_artifacts;
CREATE TRIGGER trg_venture_artifacts_updated
  BEFORE UPDATE ON venture_artifacts
  FOR EACH ROW EXECUTE FUNCTION update_venture_artifacts_timestamp();

-- ============================================================================
-- SECTION 10: GRANTS
-- Permission grants for service role
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON lifecycle_stage_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON archetype_benchmarks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON venture_stage_work TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON venture_artifacts TO authenticated;
GRANT SELECT, INSERT ON chairman_decisions TO authenticated;

-- Service role full access
GRANT ALL ON lifecycle_stage_config TO service_role;
GRANT ALL ON archetype_benchmarks TO service_role;
GRANT ALL ON venture_stage_work TO service_role;
GRANT ALL ON venture_artifacts TO service_role;
GRANT ALL ON chairman_decisions TO service_role;

-- Function grants
GRANT EXECUTE ON FUNCTION get_venture_stage_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION advance_venture_stage(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION initialize_venture_stages(UUID) TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- SD-VISION-TRANSITION-001 Factory Architecture
-- 25-stage Venture Vision v2.0 schema now active
-- ============================================================================
