-- Migration: venture_postmortems table for Post-Mortem Template & Automation
-- SD: SD-FAILURE-POSTMORTEM-001
-- Description: Structured post-mortem analysis with 5 Whys methodology

-- ============================================
-- Table: venture_postmortems
-- ============================================
CREATE TABLE IF NOT EXISTS venture_postmortems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Venture Reference
  venture_id UUID NOT NULL,
  venture_name TEXT,
  venture_start_date TIMESTAMPTZ,
  failure_date TIMESTAMPTZ,

  -- 5 Whys Analysis
  why_1 TEXT,
  why_1_evidence JSONB DEFAULT '[]', -- [{type: 'file'|'link', url: '', description: ''}]
  why_2 TEXT,
  why_2_evidence JSONB DEFAULT '[]',
  why_3 TEXT,
  why_3_evidence JSONB DEFAULT '[]',
  why_4 TEXT,
  why_4_evidence JSONB DEFAULT '[]',
  why_5 TEXT,
  why_5_evidence JSONB DEFAULT '[]',

  -- Root Cause Summary
  root_cause_summary TEXT,
  contributing_factors JSONB DEFAULT '[]', -- ['factor1', 'factor2', ...]

  -- Linked Resources
  linked_sd_ids TEXT[], -- Strategic directives involved
  linked_pattern_ids TEXT[], -- Related failure patterns

  -- Workflow Status
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'published', 'archived')),

  -- Reviewer Information
  assigned_to TEXT,
  reviewed_by TEXT,
  review_date TIMESTAMPTZ,

  -- Metadata
  created_by TEXT DEFAULT 'SYSTEM',
  updated_by TEXT DEFAULT 'SYSTEM',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_postmortems_venture_id ON venture_postmortems(venture_id);
CREATE INDEX IF NOT EXISTS idx_postmortems_status ON venture_postmortems(status);
CREATE INDEX IF NOT EXISTS idx_postmortems_failure_date ON venture_postmortems(failure_date DESC);

-- ============================================
-- Trigger: Auto-create draft on venture failure
-- ============================================
CREATE OR REPLACE FUNCTION create_postmortem_on_venture_failure()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger when status changes to 'failed'
  IF NEW.status = 'failed' AND (OLD.status IS NULL OR OLD.status != 'failed') THEN
    INSERT INTO venture_postmortems (
      venture_id,
      venture_name,
      venture_start_date,
      failure_date,
      status,
      created_by
    ) VALUES (
      NEW.id,
      NEW.name,
      NEW.created_at,
      NOW(),
      'draft',
      'TRIGGER'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on ventures table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ventures') THEN
    DROP TRIGGER IF EXISTS trigger_create_postmortem_on_failure ON ventures;
    CREATE TRIGGER trigger_create_postmortem_on_failure
      AFTER UPDATE OF status ON ventures
      FOR EACH ROW
      EXECUTE FUNCTION create_postmortem_on_venture_failure();
  END IF;
END $$;

-- ============================================
-- View: Post-mortem summary
-- ============================================
CREATE OR REPLACE VIEW v_postmortem_summary AS
SELECT
  pm.id,
  pm.venture_id,
  pm.venture_name,
  pm.failure_date,
  pm.status,
  pm.root_cause_summary,
  ARRAY_LENGTH(pm.contributing_factors::text[], 1) AS factor_count,
  ARRAY_LENGTH(pm.linked_pattern_ids, 1) AS linked_pattern_count,
  pm.created_at,
  pm.updated_at
FROM venture_postmortems pm
ORDER BY pm.failure_date DESC NULLS LAST;

-- ============================================
-- Function: Publish postmortem
-- ============================================
CREATE OR REPLACE FUNCTION publish_postmortem(p_postmortem_id UUID, p_reviewer TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_status VARCHAR(20);
BEGIN
  SELECT status INTO v_current_status FROM venture_postmortems WHERE id = p_postmortem_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Postmortem not found: %', p_postmortem_id;
  END IF;

  IF v_current_status NOT IN ('draft', 'in_review') THEN
    RAISE EXCEPTION 'Cannot publish postmortem with status: %', v_current_status;
  END IF;

  UPDATE venture_postmortems
  SET
    status = 'published',
    reviewed_by = p_reviewer,
    review_date = NOW(),
    updated_at = NOW(),
    updated_by = p_reviewer
  WHERE id = p_postmortem_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RLS Policies
-- ============================================
ALTER TABLE venture_postmortems ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view postmortems"
ON venture_postmortems FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create postmortems"
ON venture_postmortems FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update draft postmortems"
ON venture_postmortems FOR UPDATE
TO authenticated
USING (status IN ('draft', 'in_review'))
WITH CHECK (status IN ('draft', 'in_review'));

CREATE POLICY "Service role can manage all postmortems"
ON venture_postmortems FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON venture_postmortems TO authenticated;
GRANT SELECT ON v_postmortem_summary TO authenticated;
