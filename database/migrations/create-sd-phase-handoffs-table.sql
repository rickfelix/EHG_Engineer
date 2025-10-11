-- ============================================================================
-- SD Phase Handoffs Table
-- Single source of truth for all LEO Protocol phase transitions
-- Replaces: handoffs, sd_handoffs, handoff_tracking, etc.
-- ============================================================================

-- Drop old conflicting tables only (not the new one)
-- Note: sd_handoffs, handoff_tracking, handoffs don't exist yet, so these will silently succeed
DROP TABLE IF EXISTS sd_handoffs CASCADE;
DROP TABLE IF EXISTS handoff_tracking CASCADE;
DROP TABLE IF EXISTS handoffs CASCADE;

-- Create unified handoff table (idempotent with IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS sd_phase_handoffs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id VARCHAR(50) NOT NULL REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
    from_phase VARCHAR(20) NOT NULL CHECK (from_phase IN ('LEAD', 'PLAN', 'EXEC')),
    to_phase VARCHAR(20) NOT NULL CHECK (to_phase IN ('LEAD', 'PLAN', 'EXEC')),
    handoff_type VARCHAR(50) NOT NULL CHECK (handoff_type IN ('LEAD-to-PLAN', 'PLAN-to-EXEC', 'EXEC-to-PLAN', 'PLAN-to-LEAD')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending_acceptance' CHECK (status IN ('pending_acceptance', 'accepted', 'rejected')),

    -- 7 Mandatory Handoff Elements (LEO Protocol)
    executive_summary TEXT NOT NULL,
    deliverables_manifest TEXT NOT NULL,
    key_decisions TEXT NOT NULL,
    known_issues TEXT NOT NULL,
    resource_utilization TEXT NOT NULL,
    action_items TEXT NOT NULL,
    completeness_report TEXT,

    -- Additional metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP,
    rejected_at TIMESTAMP,
    created_by VARCHAR(50) DEFAULT 'LEO_AGENT',

    -- Ensure one handoff per SD per transition
    UNIQUE(sd_id, from_phase, to_phase, created_at)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sd_phase_handoffs_sd_id ON sd_phase_handoffs(sd_id);
CREATE INDEX IF NOT EXISTS idx_sd_phase_handoffs_status ON sd_phase_handoffs(status);
CREATE INDEX IF NOT EXISTS idx_sd_phase_handoffs_type ON sd_phase_handoffs(handoff_type);
CREATE INDEX IF NOT EXISTS idx_sd_phase_handoffs_created ON sd_phase_handoffs(created_at DESC);

-- Enable RLS
ALTER TABLE sd_phase_handoffs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow authenticated read sd_phase_handoffs"
  ON sd_phase_handoffs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow service role all sd_phase_handoffs"
  ON sd_phase_handoffs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to INSERT handoffs (LEO agents creating handoffs)
CREATE POLICY "Allow authenticated insert sd_phase_handoffs"
  ON sd_phase_handoffs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to UPDATE handoffs (accepting/rejecting handoffs)
CREATE POLICY "Allow authenticated update sd_phase_handoffs"
  ON sd_phase_handoffs FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to DELETE handoffs (cleanup/corrections)
CREATE POLICY "Allow authenticated delete sd_phase_handoffs"
  ON sd_phase_handoffs FOR DELETE
  TO authenticated
  USING (true);

-- Comments
COMMENT ON TABLE sd_phase_handoffs IS 'Unified handoff tracking for all LEO Protocol phase transitions. Database-first, no markdown files.';
COMMENT ON COLUMN sd_phase_handoffs.executive_summary IS 'Element 1: High-level summary of handoff';
COMMENT ON COLUMN sd_phase_handoffs.deliverables_manifest IS 'Element 2: Complete list of deliverables';
COMMENT ON COLUMN sd_phase_handoffs.key_decisions IS 'Element 3: Critical decisions made during phase';
COMMENT ON COLUMN sd_phase_handoffs.known_issues IS 'Element 4: Issues and risks identified';
COMMENT ON COLUMN sd_phase_handoffs.resource_utilization IS 'Element 5: Resources used during phase';
COMMENT ON COLUMN sd_phase_handoffs.action_items IS 'Element 6: Action items for receiving phase';
COMMENT ON COLUMN sd_phase_handoffs.completeness_report IS 'Element 7: Completeness assessment';
