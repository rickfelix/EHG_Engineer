-- Migration: 029_legal_processes_table.sql
-- SD: SD-LEGAL-STRUCTURE-001
-- Purpose: Track legal formation processes (LLC formation, banking setup, etc.)
-- Created: 2026-01-02

-- ============================================================================
-- TABLE: legal_processes
-- ============================================================================
-- Tracks the status of legal formation processes that require human action
-- (e.g., LLC formation, EIN application, banking setup)

CREATE TABLE IF NOT EXISTS legal_processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Process identification
  process_type TEXT NOT NULL CHECK (process_type IN (
    'llc_formation',
    'series_creation',
    'banking_setup',
    'ein_application',
    'registered_agent_setup',
    'operating_agreement',
    'compliance_filing'
  )),

  -- Optional venture association (NULL for master LLC processes)
  venture_id UUID REFERENCES ventures(id) ON DELETE SET NULL,

  -- Status workflow
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'in_progress',
    'blocked',
    'completed',
    'cancelled'
  )),

  -- Blocking information (if status = 'blocked')
  blocking_reason TEXT,
  blocked_at TIMESTAMPTZ,

  -- Process metadata
  title TEXT NOT NULL,
  description TEXT,

  -- Checklist items (JSONB array)
  -- Format: [{"step": "Step name", "completed": false, "completed_at": null, "notes": ""}]
  checklist_items JSONB DEFAULT '[]'::jsonb,

  -- Documents and references
  -- Format: [{"name": "Certificate of Formation", "url": "...", "uploaded_at": "..."}]
  documents JSONB DEFAULT '[]'::jsonb,

  -- External references (filing numbers, confirmation codes, etc.)
  external_references JSONB DEFAULT '{}'::jsonb,

  -- Completion tracking
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Audit columns
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by TEXT,
  updated_by TEXT
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_legal_processes_type ON legal_processes(process_type);
CREATE INDEX IF NOT EXISTS idx_legal_processes_status ON legal_processes(status);
CREATE INDEX IF NOT EXISTS idx_legal_processes_venture ON legal_processes(venture_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE legal_processes ENABLE ROW LEVEL SECURITY;

-- Admin users can view and manage all legal processes
CREATE POLICY legal_processes_admin_all ON legal_processes
  FOR ALL
  USING (
    auth.role() = 'authenticated'
    AND (
      -- Check if user is admin (via profiles table or similar)
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
      )
      OR
      -- Or check via companies table ownership
      EXISTS (
        SELECT 1 FROM companies
        WHERE companies.owner_id = auth.uid()
      )
    )
  );

-- Service role bypass for backend operations
CREATE POLICY legal_processes_service_role ON legal_processes
  FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_legal_processes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS legal_processes_updated_at ON legal_processes;
CREATE TRIGGER legal_processes_updated_at
  BEFORE UPDATE ON legal_processes
  FOR EACH ROW
  EXECUTE FUNCTION update_legal_processes_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE legal_processes IS 'Tracks legal formation processes (LLC, banking, compliance) that require human action';
COMMENT ON COLUMN legal_processes.process_type IS 'Type of legal process being tracked';
COMMENT ON COLUMN legal_processes.checklist_items IS 'JSONB array of checklist steps with completion status';
COMMENT ON COLUMN legal_processes.documents IS 'JSONB array of associated documents with URLs';
COMMENT ON COLUMN legal_processes.external_references IS 'External filing numbers, confirmation codes, etc.';

-- ============================================================================
-- SEED DATA (Example - Master LLC Formation)
-- ============================================================================

-- Uncomment to seed initial process:
-- INSERT INTO legal_processes (
--   process_type,
--   title,
--   description,
--   status,
--   checklist_items
-- ) VALUES (
--   'llc_formation',
--   'EHG Holdings LLC Formation',
--   'Delaware Series LLC formation for EHG Holdings',
--   'pending',
--   '[
--     {"step": "Business name verification", "completed": false},
--     {"step": "Registered agent selection", "completed": false},
--     {"step": "Operating agreement preparation", "completed": false},
--     {"step": "Certificate of Formation filing", "completed": false},
--     {"step": "EIN application", "completed": false},
--     {"step": "Operating agreement execution", "completed": false},
--     {"step": "Business bank account setup", "completed": false}
--   ]'::jsonb
-- );
