-- Migration: Create handoff verification gates system
-- Purpose: Mandatory verification checkpoints for user stories and test completion
-- Date: 2025-09-24
-- LEO Protocol: v4.2.0 - Planning Mode Integration Phase 3

-- Create handoff_verification_gates table for mandatory verification checkpoints
CREATE TABLE IF NOT EXISTS handoff_verification_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handoff_id UUID, -- References handoffs table when available
  sd_id VARCHAR(255) NOT NULL,
  prd_id VARCHAR(255),

  -- Gate identification
  gate_type VARCHAR(50) NOT NULL CHECK (gate_type IN (
    'user_stories',
    'test_coverage',
    'implementation_evidence',
    'performance_verification',
    'security_review',
    'code_review',
    'integration_tests'
  )),
  gate_name VARCHAR(200) NOT NULL,
  gate_description TEXT,

  -- Verification status
  verification_status VARCHAR(20) DEFAULT 'pending' CHECK (verification_status IN (
    'pending',
    'in_progress',
    'pass',
    'fail',
    'skipped',
    'blocked'
  )),

  -- Evidence and verification data
  evidence JSONB DEFAULT '{}',
  -- Expected structure:
  -- {
  --   "user_stories": {
  --     "total_stories": 5,
  --     "completed_stories": 5,
  --     "verified_stories": 5,
  --     "story_ids": ["US-001", "US-002"],
  --     "completion_evidence": [{"story_id": "US-001", "screenshot": "url", "verified_by": "QA"}]
  --   },
  --   "test_coverage": {
  --     "unit_test_coverage": 85,
  --     "integration_test_coverage": 78,
  --     "e2e_test_coverage": 60,
  --     "tests_passing": true,
  --     "test_reports": ["url1", "url2"]
  --   },
  --   "implementation_evidence": {
  --     "files_modified": ["path/to/file1.js", "path/to/file2.tsx"],
  --     "git_commits": ["hash1", "hash2"],
  --     "deployment_evidence": "url",
  --     "functionality_verified": true
  --   }
  -- }

  -- Quality and confidence metrics
  confidence_score INTEGER CHECK (confidence_score >= 0 AND confidence_score <= 100),
  quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100),

  -- Verification metadata
  verified_by VARCHAR(50), -- Agent or person who verified
  verified_at TIMESTAMP WITH TIME ZONE,
  verification_notes TEXT,

  -- Requirements and thresholds
  requirements JSONB DEFAULT '{}',
  -- {
  --   "user_stories": {"min_completion_rate": 100},
  --   "test_coverage": {"min_unit_coverage": 80, "min_integration_coverage": 70},
  --   "implementation_evidence": {"require_screenshots": true, "require_git_evidence": true}
  -- }

  -- Priority and blocking behavior
  is_mandatory BOOLEAN DEFAULT true,
  blocks_handoff BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 50, -- Higher number = higher priority

  -- Agent assignments
  assigned_to_agent VARCHAR(50), -- Which agent is responsible for this gate
  verification_agent VARCHAR(50), -- Which agent performs verification

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Auto-generated gates tracking
  auto_generated BOOLEAN DEFAULT false,
  generation_rule VARCHAR(100) -- Which rule generated this gate
);

-- Create indexes for performance
CREATE INDEX idx_verification_gates_sd_id ON handoff_verification_gates(sd_id);
CREATE INDEX idx_verification_gates_prd_id ON handoff_verification_gates(prd_id);
CREATE INDEX idx_verification_gates_status ON handoff_verification_gates(verification_status);
CREATE INDEX idx_verification_gates_type ON handoff_verification_gates(gate_type);
CREATE INDEX idx_verification_gates_mandatory ON handoff_verification_gates(is_mandatory, blocks_handoff);
CREATE INDEX idx_verification_gates_priority ON handoff_verification_gates(priority DESC);
CREATE INDEX idx_verification_gates_assigned ON handoff_verification_gates(assigned_to_agent);

-- Create gate requirements template table
CREATE TABLE IF NOT EXISTS gate_requirements_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_type VARCHAR(50) NOT NULL,
  template_name VARCHAR(100) NOT NULL,
  requirements_template JSONB NOT NULL,
  verification_criteria JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(gate_type, template_name)
);

-- Insert default gate requirement templates
INSERT INTO gate_requirements_templates (gate_type, template_name, requirements_template, verification_criteria, is_default) VALUES

-- User Stories Gate Template
('user_stories', 'standard_completion', '{
  "min_completion_rate": 100,
  "require_acceptance_criteria": true,
  "require_verification_evidence": true,
  "max_incomplete_stories": 0
}', '{
  "verification_methods": ["screenshot", "screen_recording", "manual_testing"],
  "required_verifiers": ["QA", "PLAN"],
  "evidence_requirements": ["functionality_demo", "acceptance_criteria_met"]
}', true),

-- Test Coverage Gate Template
('test_coverage', 'standard_coverage', '{
  "min_unit_coverage": 80,
  "min_integration_coverage": 70,
  "min_e2e_coverage": 60,
  "require_all_tests_passing": true,
  "max_failing_tests": 0
}', '{
  "coverage_tools": ["jest", "cypress", "playwright"],
  "required_test_types": ["unit", "integration"],
  "reporting_requirements": ["coverage_report", "test_results"]
}', true),

-- Implementation Evidence Gate Template
('implementation_evidence', 'standard_evidence', '{
  "require_git_commits": true,
  "require_deployment_evidence": true,
  "require_functionality_screenshots": true,
  "min_files_modified": 1,
  "require_working_implementation": true
}', '{
  "evidence_types": ["git_diff", "deployment_url", "functionality_demo"],
  "verification_methods": ["manual_testing", "automated_verification"],
  "quality_checks": ["code_review_passed", "functionality_verified"]
}', true),

-- Performance Verification Gate Template
('performance_verification', 'standard_performance', '{
  "max_load_time": 3000,
  "min_lighthouse_score": 70,
  "max_bundle_size_increase": 20,
  "require_performance_testing": true
}', '{
  "measurement_tools": ["lighthouse", "webpack-bundle-analyzer"],
  "test_scenarios": ["initial_load", "user_interaction"],
  "benchmarking_required": true
}', true),

-- Code Review Gate Template
('code_review', 'standard_review', '{
  "require_approval": true,
  "min_reviewers": 1,
  "require_security_review": false,
  "max_complexity_score": 10
}', '{
  "review_criteria": ["code_quality", "test_coverage", "documentation"],
  "automated_checks": ["linting", "type_checking"],
  "approval_required": true
}', true)

ON CONFLICT (gate_type, template_name) DO UPDATE SET
  requirements_template = EXCLUDED.requirements_template,
  verification_criteria = EXCLUDED.verification_criteria;

-- Create function to auto-generate gates for handoffs
CREATE OR REPLACE FUNCTION generate_handoff_verification_gates(
  p_sd_id VARCHAR,
  p_prd_id VARCHAR DEFAULT NULL,
  p_handoff_type VARCHAR DEFAULT 'EXEC-to-PLAN'
)
RETURNS TABLE (
  gate_id UUID,
  gate_type VARCHAR,
  gate_name VARCHAR,
  requirements JSONB
) AS $$
DECLARE
  gate_templates RECORD;
BEGIN
  -- Generate standard gates based on handoff type
  FOR gate_templates IN
    SELECT *
    FROM gate_requirements_templates
    WHERE is_default = true
    AND (
      (p_handoff_type = 'EXEC-to-PLAN' AND gate_type IN ('user_stories', 'test_coverage', 'implementation_evidence'))
      OR (p_handoff_type = 'PLAN-to-EXEC' AND gate_type IN ('code_review'))
      OR (p_handoff_type = 'LEAD-to-PLAN' AND gate_type IN ('performance_verification'))
    )
  LOOP
    -- Insert gate and return details
    INSERT INTO handoff_verification_gates (
      sd_id,
      prd_id,
      gate_type,
      gate_name,
      gate_description,
      requirements,
      verification_status,
      is_mandatory,
      blocks_handoff,
      auto_generated,
      generation_rule,
      assigned_to_agent,
      verification_agent
    ) VALUES (
      p_sd_id,
      p_prd_id,
      gate_templates.gate_type,
      gate_templates.template_name || ' for ' || p_sd_id,
      'Auto-generated ' || gate_templates.gate_type || ' verification gate',
      gate_templates.requirements_template,
      'pending',
      true,
      true,
      true,
      p_handoff_type || '_auto_generation',
      CASE gate_templates.gate_type
        WHEN 'user_stories' THEN 'QA'
        WHEN 'test_coverage' THEN 'QA'
        WHEN 'implementation_evidence' THEN 'PLAN'
        WHEN 'performance_verification' THEN 'PERFORMANCE'
        WHEN 'code_review' THEN 'LEAD'
        ELSE 'PLAN'
      END,
      'PLAN' -- PLAN agent does final verification
    )
    RETURNING id, gate_type, gate_name, requirements
    INTO gate_id, gate_type, gate_name, requirements;

    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Create function to check if all gates are passed
CREATE OR REPLACE FUNCTION check_handoff_gates_status(
  p_sd_id VARCHAR,
  p_prd_id VARCHAR DEFAULT NULL
)
RETURNS TABLE (
  total_gates INTEGER,
  passed_gates INTEGER,
  failed_gates INTEGER,
  pending_gates INTEGER,
  blocking_failed_gates INTEGER,
  overall_status VARCHAR,
  can_proceed BOOLEAN,
  gate_summary JSONB
) AS $$
DECLARE
  gate_stats RECORD;
BEGIN
  -- Get gate statistics
  SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE verification_status = 'pass') as passed,
    COUNT(*) FILTER (WHERE verification_status = 'fail') as failed,
    COUNT(*) FILTER (WHERE verification_status = 'pending') as pending,
    COUNT(*) FILTER (WHERE verification_status = 'fail' AND blocks_handoff = true) as blocking_failed
  INTO gate_stats
  FROM handoff_verification_gates
  WHERE sd_id = p_sd_id
  AND (p_prd_id IS NULL OR prd_id = p_prd_id);

  -- Determine overall status
  DECLARE
    status VARCHAR;
    can_proceed_flag BOOLEAN;
  BEGIN
    IF gate_stats.total = 0 THEN
      status := 'no_gates';
      can_proceed_flag := true;
    ELSIF gate_stats.blocking_failed > 0 THEN
      status := 'blocked';
      can_proceed_flag := false;
    ELSIF gate_stats.failed > 0 THEN
      status := 'failed_non_blocking';
      can_proceed_flag := true;
    ELSIF gate_stats.pending > 0 THEN
      status := 'pending';
      can_proceed_flag := false;
    ELSE
      status := 'all_passed';
      can_proceed_flag := true;
    END IF;

    -- Create summary
    DECLARE
      summary JSONB;
    BEGIN
      SELECT jsonb_build_object(
        'by_status', jsonb_build_object(
          'passed', gate_stats.passed,
          'failed', gate_stats.failed,
          'pending', gate_stats.pending
        ),
        'by_type', (
          SELECT jsonb_object_agg(gate_type, COUNT(*))
          FROM handoff_verification_gates
          WHERE sd_id = p_sd_id
          AND (p_prd_id IS NULL OR prd_id = p_prd_id)
          GROUP BY gate_type
        ),
        'blocking_gates', (
          SELECT jsonb_agg(jsonb_build_object(
            'gate_type', gate_type,
            'gate_name', gate_name,
            'status', verification_status,
            'notes', verification_notes
          ))
          FROM handoff_verification_gates
          WHERE sd_id = p_sd_id
          AND (p_prd_id IS NULL OR prd_id = p_prd_id)
          AND blocks_handoff = true
          AND verification_status != 'pass'
        )
      ) INTO summary;

      -- Return result
      total_gates := gate_stats.total;
      passed_gates := gate_stats.passed;
      failed_gates := gate_stats.failed;
      pending_gates := gate_stats.pending;
      blocking_failed_gates := gate_stats.blocking_failed;
      overall_status := status;
      can_proceed := can_proceed_flag;
      gate_summary := summary;

      RETURN NEXT;
    END;
  END;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_verification_gate_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER verification_gate_update_trigger
  BEFORE UPDATE ON handoff_verification_gates
  FOR EACH ROW
  EXECUTE FUNCTION update_verification_gate_timestamp();

-- Create view for handoff readiness dashboard
CREATE OR REPLACE VIEW handoff_readiness_dashboard AS
SELECT
  hg.sd_id,
  hg.prd_id,
  COUNT(*) as total_gates,
  COUNT(*) FILTER (WHERE hg.verification_status = 'pass') as passed_gates,
  COUNT(*) FILTER (WHERE hg.verification_status = 'fail' AND hg.blocks_handoff = true) as blocking_failures,
  COUNT(*) FILTER (WHERE hg.verification_status = 'pending') as pending_gates,
  CASE
    WHEN COUNT(*) FILTER (WHERE hg.verification_status = 'fail' AND hg.blocks_handoff = true) > 0 THEN 'BLOCKED'
    WHEN COUNT(*) FILTER (WHERE hg.verification_status = 'pending') > 0 THEN 'PENDING'
    WHEN COUNT(*) = COUNT(*) FILTER (WHERE hg.verification_status = 'pass') THEN 'READY'
    ELSE 'ISSUES'
  END as handoff_status,
  MAX(hg.updated_at) as last_updated
FROM handoff_verification_gates hg
GROUP BY hg.sd_id, hg.prd_id
ORDER BY
  CASE
    WHEN COUNT(*) FILTER (WHERE hg.verification_status = 'fail' AND hg.blocks_handoff = true) > 0 THEN 1
    WHEN COUNT(*) FILTER (WHERE hg.verification_status = 'pending') > 0 THEN 2
    ELSE 3
  END,
  last_updated DESC;

COMMENT ON TABLE handoff_verification_gates IS 'Mandatory verification checkpoints that must pass before handoffs can proceed';
COMMENT ON TABLE gate_requirements_templates IS 'Templates for generating verification gates with standard requirements';
COMMENT ON FUNCTION generate_handoff_verification_gates IS 'Auto-generates standard verification gates for handoffs';
COMMENT ON FUNCTION check_handoff_gates_status IS 'Checks the overall status of verification gates for a given SD/PRD';
COMMENT ON VIEW handoff_readiness_dashboard IS 'Dashboard view showing handoff readiness status across all SDs';