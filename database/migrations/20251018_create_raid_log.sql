-- RAID Log for Strategic Directive Management
-- SD-VIF-REFINE-001: Recursive Refinement Loop RAID Tracking
-- Created: 2025-10-18
-- Database: EHG_Engineer (Strategic Directive Management)
-- Tracks Risks, Assumptions, Issues, Dependencies for SD execution

CREATE TABLE IF NOT EXISTS raid_log (
  -- Primary identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- RAID type and classification
  type VARCHAR(20) NOT NULL CHECK (type IN ('Risk', 'Assumption', 'Issue', 'Dependency', 'Action', 'Decision')),
  title VARCHAR(500) NOT NULL,
  description TEXT,

  -- Severity scoring (1-10 scale for all types)
  severity_index INTEGER CHECK (severity_index >= 1 AND severity_index <= 10),

  -- Status and lifecycle
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN (
    'ACTIVE', 'MONITORING', 'MITIGATED', 'RESOLVED', 'ACCEPTED', 'CLOSED', 'ESCALATED'
  )),

  -- Type-specific fields
  -- For Risks
  mitigation_strategy TEXT,

  -- For Assumptions
  validation_approach TEXT,

  -- For Issues
  resolution_details TEXT,

  -- For Dependencies
  dependency_sd VARCHAR(100), -- Reference to another SD
  dependency_status VARCHAR(30),

  -- Categorization
  category VARCHAR(50), -- e.g., 'Technical', 'Business', 'Process', 'Database', 'Strategic Directive'

  -- Ownership
  owner VARCHAR(100) NOT NULL, -- e.g., 'EXEC', 'PLAN', 'LEAD', 'DATABASE'

  -- Traceability
  venture_id UUID, -- FK to ventures (optional, for venture-specific RAID items)
  sd_id VARCHAR(100), -- Reference to strategic_directives_v2
  prd_id VARCHAR(100), -- Reference to product_requirements_v2

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_raid_log_type ON raid_log(type);
CREATE INDEX IF NOT EXISTS idx_raid_log_status ON raid_log(status);
CREATE INDEX IF NOT EXISTS idx_raid_log_severity ON raid_log(severity_index DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_raid_log_sd ON raid_log(sd_id) WHERE sd_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_raid_log_prd ON raid_log(prd_id) WHERE prd_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_raid_log_venture ON raid_log(venture_id) WHERE venture_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_raid_log_owner ON raid_log(owner);
CREATE INDEX IF NOT EXISTS idx_raid_log_created ON raid_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_raid_log_category ON raid_log(category);

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_raid_log_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS trigger_raid_log_updated_at
  BEFORE UPDATE ON raid_log
  FOR EACH ROW
  EXECUTE FUNCTION update_raid_log_timestamp();

-- RLS Policies (match strategic_directives_v2 patterns)
ALTER TABLE raid_log ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all RAID items
CREATE POLICY "raid_log_select_authenticated" ON raid_log
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert RAID items
CREATE POLICY "raid_log_insert_authenticated" ON raid_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update RAID items
CREATE POLICY "raid_log_update_authenticated" ON raid_log
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT ALL ON raid_log TO authenticated;

-- Comments
COMMENT ON TABLE raid_log IS 'RAID tracking for Strategic Directives (Risks, Assumptions, Issues, Dependencies, Actions, Decisions)';
COMMENT ON COLUMN raid_log.type IS 'RAID item type: Risk, Assumption, Issue, Dependency, Action, or Decision';
COMMENT ON COLUMN raid_log.severity_index IS 'Severity score 1-10 (10 = highest impact/criticality)';
COMMENT ON COLUMN raid_log.status IS 'Current status: ACTIVE, MONITORING, MITIGATED, RESOLVED, ACCEPTED, CLOSED, ESCALATED';
COMMENT ON COLUMN raid_log.sd_id IS 'Reference to strategic_directives_v2.id';
COMMENT ON COLUMN raid_log.prd_id IS 'Reference to product_requirements_v2.id';
COMMENT ON COLUMN raid_log.metadata IS 'Additional context: implementation_file, impact, probability, monitoring_metric, etc.';
