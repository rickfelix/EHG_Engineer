-- Migration: Create exec_implementation_evidence table
-- Purpose: Store evidence of actual EXEC implementation to prevent simulation
-- Date: 2025-09-24
-- LEO Protocol: v4.2.0 - No Simulation Allowed

-- Create table for storing implementation evidence
CREATE TABLE IF NOT EXISTS exec_implementation_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id VARCHAR(255) NOT NULL,
  prd_id VARCHAR(255),
  evidence_type VARCHAR(50) NOT NULL, -- 'implementation', 'testing', 'verification'

  -- Evidence details
  evidence_data JSONB NOT NULL,
  -- Expected structure:
  -- {
  --   "files_modified": ["path/to/file1.js", "path/to/file2.jsx"],
  --   "lines_added": 245,
  --   "lines_removed": 30,
  --   "test_files_created": ["file.test.js"],
  --   "test_coverage": 85,
  --   "git_diff_summary": "Added new component...",
  --   "implementation_screenshots": ["url1", "url2"],
  --   "performance_metrics": {"load_time": "1.2s"},
  --   "actual_implementation": true,
  --   "simulation_detected": false
  -- }

  -- Validation
  validation_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  validation_notes TEXT,
  validated_by VARCHAR(50), -- 'PLAN', 'LEAD', 'automated'
  validated_at TIMESTAMP WITH TIME ZONE,

  -- Requirements tracking
  requirements_met JSONB,
  missing_requirements TEXT[],

  -- Git tracking
  git_commit_hash VARCHAR(255),
  git_branch VARCHAR(255),
  git_diff_url TEXT,

  -- Metrics
  implementation_quality_score INTEGER CHECK (implementation_quality_score >= 0 AND implementation_quality_score <= 100),
  code_review_passed BOOLEAN DEFAULT false,
  tests_passed BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_evidence_sd_id ON exec_implementation_evidence(sd_id);
CREATE INDEX idx_evidence_prd_id ON exec_implementation_evidence(prd_id);
CREATE INDEX idx_evidence_validation_status ON exec_implementation_evidence(validation_status);
CREATE INDEX idx_evidence_created_at ON exec_implementation_evidence(created_at DESC);

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_evidence_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_evidence_timestamp
BEFORE UPDATE ON exec_implementation_evidence
FOR EACH ROW
EXECUTE FUNCTION update_evidence_updated_at();

-- Create view for active evidence
CREATE OR REPLACE VIEW active_implementation_evidence AS
SELECT
  e.*,
  sd.title as sd_title,
  sd.status as sd_status,
  prd.title as prd_title
FROM exec_implementation_evidence e
LEFT JOIN strategic_directives_v2 sd ON e.sd_id = sd.id
LEFT JOIN product_requirements_v2 prd ON e.prd_id = prd.id
WHERE e.validation_status = 'approved'
ORDER BY e.created_at DESC;

-- Create function to check for simulation keywords
CREATE OR REPLACE FUNCTION check_simulation_keywords(evidence_json JSONB)
RETURNS BOOLEAN AS $$
DECLARE
  simulation_keywords TEXT[] := ARRAY[
    'simulate', 'simulated', 'simulating',
    'mock', 'mocked', 'mocking',
    'fake', 'faked', 'placeholder',
    'dummy', 'stub', 'TODO: implement'
  ];
  keyword TEXT;
  evidence_text TEXT;
BEGIN
  evidence_text := evidence_json::TEXT;

  FOREACH keyword IN ARRAY simulation_keywords
  LOOP
    IF position(lower(keyword) IN lower(evidence_text)) > 0 THEN
      RETURN TRUE; -- Simulation detected
    END IF;
  END LOOP;

  RETURN FALSE; -- No simulation detected
END;
$$ LANGUAGE plpgsql;

-- Create function to validate implementation evidence
CREATE OR REPLACE FUNCTION validate_implementation_evidence(
  p_sd_id VARCHAR,
  p_prd_id VARCHAR,
  p_evidence JSONB
)
RETURNS TABLE(
  is_valid BOOLEAN,
  validation_message TEXT,
  missing_requirements TEXT[]
) AS $$
DECLARE
  v_files_modified INTEGER;
  v_lines_added INTEGER;
  v_has_tests BOOLEAN;
  v_simulation_detected BOOLEAN;
  v_missing_reqs TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Extract evidence details
  v_files_modified := COALESCE(jsonb_array_length(p_evidence->'files_modified'), 0);
  v_lines_added := COALESCE((p_evidence->>'lines_added')::INTEGER, 0);
  v_has_tests := COALESCE(jsonb_array_length(p_evidence->'test_files_created') > 0, FALSE);
  v_simulation_detected := check_simulation_keywords(p_evidence);

  -- Check requirements
  IF v_files_modified = 0 THEN
    v_missing_reqs := array_append(v_missing_reqs, 'No files modified');
  END IF;

  IF v_lines_added = 0 THEN
    v_missing_reqs := array_append(v_missing_reqs, 'No code lines added');
  END IF;

  IF v_simulation_detected THEN
    v_missing_reqs := array_append(v_missing_reqs, 'Simulation keywords detected');
  END IF;

  IF NOT v_has_tests THEN
    v_missing_reqs := array_append(v_missing_reqs, 'No test files created');
  END IF;

  -- Determine validity
  IF array_length(v_missing_reqs, 1) > 0 THEN
    RETURN QUERY SELECT
      FALSE,
      'Implementation evidence insufficient',
      v_missing_reqs;
  ELSE
    RETURN QUERY SELECT
      TRUE,
      'Implementation evidence verified',
      ARRAY[]::TEXT[];
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Add RLS policies
ALTER TABLE exec_implementation_evidence ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read evidence
CREATE POLICY "Allow read access to implementation evidence" ON exec_implementation_evidence
  FOR SELECT
  USING (true);

-- Only allow inserts with valid evidence
CREATE POLICY "Allow insert with valid evidence" ON exec_implementation_evidence
  FOR INSERT
  WITH CHECK (
    evidence_data->>'actual_implementation' = 'true' AND
    NOT check_simulation_keywords(evidence_data)
  );

-- Comment the table and columns
COMMENT ON TABLE exec_implementation_evidence IS 'Stores evidence of actual EXEC implementation work to prevent simulation and ensure real code is written';
COMMENT ON COLUMN exec_implementation_evidence.evidence_data IS 'JSON structure containing all implementation evidence including files modified, lines changed, tests created, etc.';
COMMENT ON COLUMN exec_implementation_evidence.validation_status IS 'Status of evidence validation: pending, approved, or rejected';
COMMENT ON COLUMN exec_implementation_evidence.simulation_detected IS 'Flag indicating if simulation keywords were found in the evidence';

-- Grant appropriate permissions
GRANT ALL ON exec_implementation_evidence TO authenticated;
GRANT ALL ON active_implementation_evidence TO authenticated;