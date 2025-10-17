-- LEO Protocol Enhancement #1: Scope-to-Deliverables Validation System
-- Purpose: Prevent SDs from being marked complete without validating all promised deliverables
-- Root Cause Fixed: Missing scope-to-deliverables validation
-- Date: 2025-10-10
-- Related SD: SD-AGENT-MIGRATION-001 retrospective

-- ============================================================================
-- TABLE: sd_scope_deliverables
-- ============================================================================
-- Stores extracted deliverables from SD scope documents
-- Each deliverable must be completed and verified before SD can be marked complete

CREATE TABLE IF NOT EXISTS sd_scope_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id VARCHAR(100) NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,

  -- Deliverable Classification
  deliverable_type VARCHAR(50) CHECK (deliverable_type IN (
    'database',
    'ui_feature',
    'api',
    'documentation',
    'configuration',
    'test',
    'migration',
    'integration',
    'other'
  )),

  -- Deliverable Details
  deliverable_name VARCHAR(500) NOT NULL,
  description TEXT,
  extracted_from TEXT, -- e.g., 'scope_section_2', 'prd_objectives', 'user_story_5'
  priority VARCHAR(20) DEFAULT 'required' CHECK (priority IN ('required', 'optional', 'nice_to_have')),

  -- Completion Tracking
  completion_status VARCHAR(20) DEFAULT 'pending' CHECK (completion_status IN (
    'pending',
    'in_progress',
    'completed',
    'skipped',
    'blocked'
  )),

  -- Evidence & Verification
  completion_evidence TEXT, -- Git commit hash, file path, URL, screenshot URL
  completion_notes TEXT,
  verified_by VARCHAR(20) CHECK (verified_by IN ('EXEC', 'PLAN', 'LEAD', 'QA_DIRECTOR', 'DATABASE_ARCHITECT', 'DESIGN_AGENT')),
  verified_at TIMESTAMPTZ,
  verification_notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(100) DEFAULT 'SYSTEM',
  metadata JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_scope_deliverables_sd ON sd_scope_deliverables(sd_id);
CREATE INDEX IF NOT EXISTS idx_scope_deliverables_status ON sd_scope_deliverables(completion_status);
CREATE INDEX IF NOT EXISTS idx_scope_deliverables_type ON sd_scope_deliverables(deliverable_type);
CREATE INDEX IF NOT EXISTS idx_scope_deliverables_verified ON sd_scope_deliverables(verified_by, verified_at);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function: Check if all required deliverables are completed
CREATE OR REPLACE FUNCTION check_deliverables_complete(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  total_required INTEGER;
  completed_required INTEGER;
  pending_deliverables JSONB;
  result JSONB;
BEGIN
  -- Count required deliverables
  SELECT COUNT(*) INTO total_required
  FROM sd_scope_deliverables
  WHERE sd_id = sd_id_param
  AND priority = 'required';

  -- Count completed required deliverables
  SELECT COUNT(*) INTO completed_required
  FROM sd_scope_deliverables
  WHERE sd_id = sd_id_param
  AND priority = 'required'
  AND completion_status = 'completed'
  AND verified_by IS NOT NULL;

  -- Get list of pending deliverables
  SELECT jsonb_agg(jsonb_build_object(
    'id', id,
    'name', deliverable_name,
    'type', deliverable_type,
    'status', completion_status,
    'verified', verified_by IS NOT NULL
  )) INTO pending_deliverables
  FROM sd_scope_deliverables
  WHERE sd_id = sd_id_param
  AND priority = 'required'
  AND (completion_status != 'completed' OR verified_by IS NULL);

  result := jsonb_build_object(
    'total_required', total_required,
    'completed', completed_required,
    'percentage', CASE
      WHEN total_required > 0 THEN (completed_required * 100 / total_required)
      ELSE 0
    END,
    'all_complete', completed_required = total_required AND total_required > 0,
    'pending_deliverables', COALESCE(pending_deliverables, '[]'::jsonb)
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_deliverables_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sd_scope_deliverables_timestamp
  BEFORE UPDATE ON sd_scope_deliverables
  FOR EACH ROW
  EXECUTE FUNCTION update_deliverables_timestamp();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE sd_scope_deliverables IS 'Tracks deliverables extracted from SD scope documents to ensure all promises are fulfilled';
COMMENT ON COLUMN sd_scope_deliverables.deliverable_type IS 'Classification of deliverable for filtering and reporting';
COMMENT ON COLUMN sd_scope_deliverables.completion_evidence IS 'Link to proof of completion (commit hash, file path, URL, screenshot)';
COMMENT ON COLUMN sd_scope_deliverables.verified_by IS 'Agent or sub-agent that verified the deliverable completion';
COMMENT ON COLUMN sd_scope_deliverables.priority IS 'Required deliverables block SD completion, optional do not';
COMMENT ON COLUMN sd_scope_deliverables.extracted_from IS 'Source location in scope document for traceability';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'LEO Protocol Enhancement #1 applied successfully';
  RAISE NOTICE 'Table created: sd_scope_deliverables';
  RAISE NOTICE 'Function created: check_deliverables_complete(sd_id)';
  RAISE NOTICE 'Next step: Create extract-scope-deliverables.mjs script to populate this table';
END $$;
