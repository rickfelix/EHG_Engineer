-- Migration: Create quick_fixes table for LEO Quick-Fix Workflow
-- Purpose: Lightweight issue tracking for UAT-discovered bugs/polish items (<50 LOC)
-- Created: 2025-11-17

-- Create quick_fixes table
CREATE TABLE IF NOT EXISTS quick_fixes (
  -- Identity
  id TEXT PRIMARY KEY,  -- Format: QF-YYYYMMDD-NNN (e.g., QF-20251117-001)
  title TEXT NOT NULL,

  -- Classification
  type TEXT NOT NULL CHECK (type IN ('bug', 'polish', 'typo', 'documentation')),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  found_during TEXT DEFAULT 'uat' CHECK (found_during IN ('uat', 'manual-testing', 'code-review')),

  -- Description
  description TEXT NOT NULL,
  steps_to_reproduce TEXT,
  expected_behavior TEXT,
  actual_behavior TEXT,
  screenshot_path TEXT,

  -- Scope tracking
  estimated_loc INTEGER,  -- Estimated lines of code to change
  actual_loc INTEGER,     -- Actual lines changed (from git diff)
  files_changed JSONB,    -- Array of file paths touched

  -- Workflow tracking
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'escalated')),
  escalated_to_sd_id TEXT REFERENCES strategic_directives_v2(id),  -- If >50 LOC, escalate to full SD
  escalation_reason TEXT,  -- Why it was escalated

  -- Implementation tracking
  branch_name TEXT,       -- Branch created: quick-fix/QF-YYYYMMDD-NNN
  commit_sha TEXT,        -- Git commit hash
  pr_url TEXT,            -- GitHub PR URL

  -- Verification
  tests_passing BOOLEAN DEFAULT FALSE,
  uat_verified BOOLEAN DEFAULT FALSE,
  verified_by TEXT,
  verification_notes TEXT,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_by TEXT DEFAULT 'UAT_AGENT',

  -- Constraints
  CONSTRAINT loc_reasonable CHECK (estimated_loc IS NULL OR estimated_loc <= 200),
  CONSTRAINT actual_loc_reasonable CHECK (actual_loc IS NULL OR actual_loc <= 200),
  CONSTRAINT escalated_requires_reason CHECK (
    (status = 'escalated' AND escalation_reason IS NOT NULL) OR
    (status != 'escalated')
  ),
  CONSTRAINT completed_requires_verification CHECK (
    (status = 'completed' AND tests_passing = TRUE AND uat_verified = TRUE) OR
    (status != 'completed')
  )
);

-- Create indexes for common queries
CREATE INDEX idx_quick_fixes_status ON quick_fixes(status);
CREATE INDEX idx_quick_fixes_type ON quick_fixes(type);
CREATE INDEX idx_quick_fixes_severity ON quick_fixes(severity);
CREATE INDEX idx_quick_fixes_created ON quick_fixes(created_at DESC);
CREATE INDEX idx_quick_fixes_escalated_to_sd ON quick_fixes(escalated_to_sd_id) WHERE escalated_to_sd_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON TABLE quick_fixes IS
  'LEO Quick-Fix Workflow: Lightweight issue tracking for UAT-discovered bugs/polish items.
   Criteria: ≤50 LOC, no database schema changes, no auth changes, existing tests cover change.
   Auto-escalates to full SD if criteria not met.';

COMMENT ON COLUMN quick_fixes.id IS 'Format: QF-YYYYMMDD-NNN (e.g., QF-20251117-001)';
COMMENT ON COLUMN quick_fixes.type IS 'Issue type: bug (broken functionality), polish (UX improvement), typo (text correction), documentation';
COMMENT ON COLUMN quick_fixes.severity IS 'Impact level: critical (blocking), high (major issue), medium (minor issue), low (nice-to-have)';
COMMENT ON COLUMN quick_fixes.estimated_loc IS 'Estimated lines of code to change. Auto-escalate if >50 LOC.';
COMMENT ON COLUMN quick_fixes.actual_loc IS 'Actual lines changed (measured via git diff). Hard cap at 50 LOC.';
COMMENT ON COLUMN quick_fixes.status IS 'Workflow state: open (not started), in_progress (being fixed), completed (verified), escalated (converted to SD)';
COMMENT ON COLUMN quick_fixes.escalated_to_sd_id IS 'Reference to full Strategic Directive if escalated (>50 LOC, complexity, security, etc.)';
COMMENT ON COLUMN quick_fixes.tests_passing IS 'Both unit and E2E smoke tests passing (Tier 1 requirement)';
COMMENT ON COLUMN quick_fixes.uat_verified IS 'User confirmed fix works during manual testing';

-- RLS Policies (allow all operations for authenticated users)
ALTER TABLE quick_fixes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations for authenticated users"
  ON quick_fixes
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations for anon users"
  ON quick_fixes
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);
