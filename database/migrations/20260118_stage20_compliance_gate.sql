-- ============================================================================
-- Stage 20 Compliance Gate Migration
-- SD-LIFECYCLE-GAP-002: Security & Compliance Certification Gate
-- ============================================================================
-- Implements:
--   FR-1: Hard compliance gate at Stage 20 exit
--   FR-2: Archetype-specific checklists with REQUIRED/RECOMMENDED tiers
--   FR-3: Item completion tracking with evidence
--   FR-4: Artifact templates
--   FR-6: Gate evaluation logging
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. COMPLIANCE CHECKLISTS (version-controlled per archetype)
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_checklists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  archetype VARCHAR(50) NOT NULL CHECK (archetype IN ('B2B_ENTERPRISE', 'B2B_SMB', 'B2C')),
  version INT NOT NULL DEFAULT 1,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(archetype, version)
);

-- Index for looking up active checklist by archetype
CREATE INDEX IF NOT EXISTS idx_compliance_checklists_archetype_active
  ON compliance_checklists(archetype) WHERE is_active = TRUE;

-- ============================================================================
-- 2. COMPLIANCE CHECKLIST ITEMS (with requirement levels)
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_checklist_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  checklist_id UUID NOT NULL REFERENCES compliance_checklists(id) ON DELETE CASCADE,
  item_code VARCHAR(50) NOT NULL, -- e.g., 'SEC-001', 'GDPR-002'
  category VARCHAR(100) NOT NULL, -- e.g., 'Security', 'Privacy', 'Legal'
  title VARCHAR(255) NOT NULL,
  description TEXT,
  requirement_level VARCHAR(20) NOT NULL CHECK (requirement_level IN ('REQUIRED', 'RECOMMENDED')),
  evidence_required BOOLEAN NOT NULL DEFAULT FALSE,
  evidence_types JSONB DEFAULT '[]'::JSONB, -- ['document', 'link', 'screenshot']
  sort_order INT NOT NULL DEFAULT 0,
  guidance_text TEXT, -- Help text for completing this item
  template_id UUID, -- Optional link to artifact template
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(checklist_id, item_code)
);

-- Index for fast lookups by checklist
CREATE INDEX IF NOT EXISTS idx_compliance_items_checklist
  ON compliance_checklist_items(checklist_id);

-- ============================================================================
-- 3. VENTURE COMPLIANCE PROGRESS (per-venture item status)
-- ============================================================================

CREATE TABLE IF NOT EXISTS venture_compliance_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  checklist_item_id UUID NOT NULL REFERENCES compliance_checklist_items(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE')),
  owner_user_id UUID REFERENCES auth.users(id),
  notes TEXT,
  evidence_attachments JSONB DEFAULT '[]'::JSONB, -- [{id, type, url, name, uploaded_at}]
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(venture_id, checklist_item_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_venture_compliance_venture
  ON venture_compliance_progress(venture_id);
CREATE INDEX IF NOT EXISTS idx_venture_compliance_status
  ON venture_compliance_progress(venture_id, status);

-- ============================================================================
-- 4. COMPLIANCE ARTIFACT TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_artifact_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  applicable_archetypes VARCHAR(50)[] NOT NULL DEFAULT ARRAY['B2B_ENTERPRISE', 'B2B_SMB', 'B2C'],
  content_template TEXT NOT NULL, -- Markdown or HTML template with placeholders
  output_format VARCHAR(20) NOT NULL DEFAULT 'markdown' CHECK (output_format IN ('markdown', 'html', 'pdf')),
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. VENTURE COMPLIANCE ARTIFACTS (generated from templates)
-- ============================================================================

CREATE TABLE IF NOT EXISTS venture_compliance_artifacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES compliance_artifact_templates(id),
  checklist_item_id UUID REFERENCES compliance_checklist_items(id),
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final', 'archived')),
  file_url TEXT, -- For PDF export storage
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for venture artifacts
CREATE INDEX IF NOT EXISTS idx_venture_compliance_artifacts_venture
  ON venture_compliance_artifacts(venture_id);

-- ============================================================================
-- 6. COMPLIANCE GATE EVENTS (for audit trail and metrics)
-- ============================================================================

CREATE TABLE IF NOT EXISTS compliance_gate_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  stage_id INT NOT NULL DEFAULT 20,
  archetype VARCHAR(50) NOT NULL,
  checklist_version INT NOT NULL,
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('gate_evaluated', 'gate_passed', 'checklist_activity')),
  outcome VARCHAR(10) CHECK (outcome IN ('PASS', 'FAIL')),
  missing_required_count INT,
  missing_required_items JSONB, -- Array of item codes that were missing
  time_to_compliance_seconds INT, -- Calculated on gate_passed
  first_activity_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for reporting queries (FR-6)
CREATE INDEX IF NOT EXISTS idx_compliance_events_venture
  ON compliance_gate_events(venture_id);
CREATE INDEX IF NOT EXISTS idx_compliance_events_type
  ON compliance_gate_events(event_type);
CREATE INDEX IF NOT EXISTS idx_compliance_events_archetype_date
  ON compliance_gate_events(archetype, created_at);

-- ============================================================================
-- 7. HELPER FUNCTION: Get active checklist for archetype
-- ============================================================================

CREATE OR REPLACE FUNCTION get_active_compliance_checklist(p_archetype VARCHAR)
RETURNS TABLE (
  checklist_id UUID,
  checklist_version INT,
  item_id UUID,
  item_code VARCHAR(50),
  category VARCHAR(100),
  title VARCHAR(255),
  description TEXT,
  requirement_level VARCHAR(20),
  evidence_required BOOLEAN,
  evidence_types JSONB,
  guidance_text TEXT,
  template_id UUID,
  sort_order INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cl.id AS checklist_id,
    cl.version AS checklist_version,
    cli.id AS item_id,
    cli.item_code,
    cli.category,
    cli.title,
    cli.description,
    cli.requirement_level,
    cli.evidence_required,
    cli.evidence_types,
    cli.guidance_text,
    cli.template_id,
    cli.sort_order
  FROM compliance_checklists cl
  JOIN compliance_checklist_items cli ON cli.checklist_id = cl.id
  WHERE cl.archetype = p_archetype
    AND cl.is_active = TRUE
    AND (cl.effective_to IS NULL OR cl.effective_to > NOW())
  ORDER BY cli.sort_order, cli.item_code;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 8. HELPER FUNCTION: Evaluate Stage 20 compliance gate
-- ============================================================================

CREATE OR REPLACE FUNCTION evaluate_stage20_compliance_gate(
  p_venture_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_archetype VARCHAR(50);
  v_checklist_id UUID;
  v_checklist_version INT;
  v_required_total INT;
  v_required_complete INT;
  v_missing_items JSONB;
  v_first_activity TIMESTAMPTZ;
  v_result JSONB;
  v_outcome VARCHAR(10);
BEGIN
  -- Get venture archetype
  SELECT archetype INTO v_archetype
  FROM ventures
  WHERE id = p_venture_id;

  IF v_archetype IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Venture not found or archetype not set'
    );
  END IF;

  -- Get active checklist
  SELECT id, version INTO v_checklist_id, v_checklist_version
  FROM compliance_checklists
  WHERE archetype = v_archetype
    AND is_active = TRUE
    AND (effective_to IS NULL OR effective_to > NOW())
  ORDER BY version DESC
  LIMIT 1;

  IF v_checklist_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'No active compliance checklist found for archetype: ' || v_archetype
    );
  END IF;

  -- Count required items and their completion status
  SELECT
    COUNT(*) FILTER (WHERE cli.requirement_level = 'REQUIRED'),
    COUNT(*) FILTER (WHERE cli.requirement_level = 'REQUIRED'
                      AND vcp.status = 'COMPLETE'
                      AND (NOT cli.evidence_required OR jsonb_array_length(COALESCE(vcp.evidence_attachments, '[]'::jsonb)) > 0)),
    jsonb_agg(cli.item_code) FILTER (WHERE cli.requirement_level = 'REQUIRED'
                                       AND (vcp.status IS NULL OR vcp.status != 'COMPLETE'
                                            OR (cli.evidence_required AND jsonb_array_length(COALESCE(vcp.evidence_attachments, '[]'::jsonb)) = 0)))
  INTO v_required_total, v_required_complete, v_missing_items
  FROM compliance_checklist_items cli
  LEFT JOIN venture_compliance_progress vcp
    ON vcp.checklist_item_id = cli.id AND vcp.venture_id = p_venture_id
  WHERE cli.checklist_id = v_checklist_id;

  -- Get first activity timestamp
  SELECT MIN(created_at) INTO v_first_activity
  FROM venture_compliance_progress
  WHERE venture_id = p_venture_id;

  -- Determine outcome
  v_outcome := CASE WHEN v_required_complete >= v_required_total THEN 'PASS' ELSE 'FAIL' END;

  -- Build result
  v_result := jsonb_build_object(
    'success', TRUE,
    'venture_id', p_venture_id,
    'archetype', v_archetype,
    'checklist_id', v_checklist_id,
    'checklist_version', v_checklist_version,
    'outcome', v_outcome,
    'required_total', v_required_total,
    'required_complete', v_required_complete,
    'required_percentage', CASE WHEN v_required_total > 0
      THEN ROUND((v_required_complete::NUMERIC / v_required_total) * 100, 1)
      ELSE 100 END,
    'missing_required_items', COALESCE(v_missing_items, '[]'::jsonb),
    'first_activity_at', v_first_activity
  );

  -- Log the gate evaluation event
  INSERT INTO compliance_gate_events (
    venture_id, stage_id, archetype, checklist_version,
    event_type, outcome, missing_required_count, missing_required_items,
    first_activity_at, created_by
  ) VALUES (
    p_venture_id, 20, v_archetype, v_checklist_version,
    'gate_evaluated', v_outcome,
    v_required_total - v_required_complete,
    v_missing_items,
    v_first_activity, p_user_id
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. HELPER FUNCTION: Record gate passed event with time to compliance
-- ============================================================================

CREATE OR REPLACE FUNCTION record_compliance_gate_passed(
  p_venture_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_archetype VARCHAR(50);
  v_checklist_version INT;
  v_first_activity TIMESTAMPTZ;
  v_time_to_compliance INT;
BEGIN
  -- Get venture archetype
  SELECT archetype INTO v_archetype FROM ventures WHERE id = p_venture_id;

  -- Get active checklist version
  SELECT version INTO v_checklist_version
  FROM compliance_checklists
  WHERE archetype = v_archetype AND is_active = TRUE
  ORDER BY version DESC LIMIT 1;

  -- Get first activity
  SELECT MIN(created_at) INTO v_first_activity
  FROM venture_compliance_progress
  WHERE venture_id = p_venture_id;

  -- Calculate time to compliance
  v_time_to_compliance := EXTRACT(EPOCH FROM (NOW() - COALESCE(v_first_activity, NOW())))::INT;

  -- Record gate passed event
  INSERT INTO compliance_gate_events (
    venture_id, stage_id, archetype, checklist_version,
    event_type, outcome, time_to_compliance_seconds,
    first_activity_at, created_by
  ) VALUES (
    p_venture_id, 20, v_archetype, v_checklist_version,
    'gate_passed', 'PASS', v_time_to_compliance,
    v_first_activity, p_user_id
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'venture_id', p_venture_id,
    'time_to_compliance_seconds', v_time_to_compliance,
    'first_activity_at', v_first_activity,
    'passed_at', NOW()
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE compliance_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_compliance_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_artifact_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_compliance_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_gate_events ENABLE ROW LEVEL SECURITY;

-- Checklists and items are readable by all authenticated users
CREATE POLICY "Compliance checklists are viewable by authenticated users"
  ON compliance_checklists FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "Compliance items are viewable by authenticated users"
  ON compliance_checklist_items FOR SELECT
  TO authenticated
  USING (TRUE);

-- Templates are viewable by all authenticated users
CREATE POLICY "Artifact templates are viewable by authenticated users"
  ON compliance_artifact_templates FOR SELECT
  TO authenticated
  USING (TRUE);

-- Venture-specific data uses workspace membership check
CREATE POLICY "Venture compliance progress viewable by workspace members"
  ON venture_compliance_progress FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ventures v
      JOIN workspace_members wm ON wm.workspace_id = v.workspace_id
      WHERE v.id = venture_compliance_progress.venture_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Venture compliance progress editable by workspace members"
  ON venture_compliance_progress FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ventures v
      JOIN workspace_members wm ON wm.workspace_id = v.workspace_id
      WHERE v.id = venture_compliance_progress.venture_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ventures v
      JOIN workspace_members wm ON wm.workspace_id = v.workspace_id
      WHERE v.id = venture_compliance_progress.venture_id
        AND wm.user_id = auth.uid()
    )
  );

-- Same for venture artifacts
CREATE POLICY "Venture compliance artifacts viewable by workspace members"
  ON venture_compliance_artifacts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ventures v
      JOIN workspace_members wm ON wm.workspace_id = v.workspace_id
      WHERE v.id = venture_compliance_artifacts.venture_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Venture compliance artifacts editable by workspace members"
  ON venture_compliance_artifacts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ventures v
      JOIN workspace_members wm ON wm.workspace_id = v.workspace_id
      WHERE v.id = venture_compliance_artifacts.venture_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ventures v
      JOIN workspace_members wm ON wm.workspace_id = v.workspace_id
      WHERE v.id = venture_compliance_artifacts.venture_id
        AND wm.user_id = auth.uid()
    )
  );

-- Gate events are readable by workspace members
CREATE POLICY "Compliance gate events viewable by workspace members"
  ON compliance_gate_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM ventures v
      JOIN workspace_members wm ON wm.workspace_id = v.workspace_id
      WHERE v.id = compliance_gate_events.venture_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 11. SEED DATA: Default Checklists and Templates
-- ============================================================================

-- B2B Enterprise Checklist (v1)
INSERT INTO compliance_checklists (archetype, version, name, description) VALUES
('B2B_ENTERPRISE', 1, 'B2B Enterprise Compliance Checklist v1',
 'Comprehensive compliance checklist for ventures targeting enterprise customers. Includes SOC2, GDPR, and enterprise security requirements.');

-- B2B SMB Checklist (v1)
INSERT INTO compliance_checklists (archetype, version, name, description) VALUES
('B2B_SMB', 1, 'B2B SMB Compliance Checklist v1',
 'Streamlined compliance checklist for SMB-focused ventures. Essential security and privacy requirements.');

-- B2C Checklist (v1)
INSERT INTO compliance_checklists (archetype, version, name, description) VALUES
('B2C', 1, 'B2C Compliance Checklist v1',
 'Consumer-focused compliance checklist. Privacy, accessibility, and consumer protection requirements.');

-- Insert items for B2B Enterprise
WITH enterprise_checklist AS (
  SELECT id FROM compliance_checklists WHERE archetype = 'B2B_ENTERPRISE' AND version = 1
)
INSERT INTO compliance_checklist_items (checklist_id, item_code, category, title, description, requirement_level, evidence_required, evidence_types, sort_order, guidance_text) VALUES
-- Security (Required)
((SELECT id FROM enterprise_checklist), 'SEC-001', 'Security', 'Security Policy Document', 'Comprehensive security policy covering data protection, access control, and incident response', 'REQUIRED', TRUE, '["document"]', 10, 'Create a security policy document covering: access control, encryption standards, incident response procedures'),
((SELECT id FROM enterprise_checklist), 'SEC-002', 'Security', 'Access Control Implementation', 'Role-based access control (RBAC) implemented and documented', 'REQUIRED', TRUE, '["document", "screenshot"]', 20, 'Document your RBAC model and provide evidence of implementation'),
((SELECT id FROM enterprise_checklist), 'SEC-003', 'Security', 'Encryption at Rest', 'All sensitive data encrypted at rest using AES-256 or equivalent', 'REQUIRED', TRUE, '["document"]', 30, 'Document encryption implementation and key management'),
((SELECT id FROM enterprise_checklist), 'SEC-004', 'Security', 'Encryption in Transit', 'All data in transit encrypted using TLS 1.2+', 'REQUIRED', TRUE, '["screenshot"]', 40, 'Provide SSL certificate and configuration evidence'),
((SELECT id FROM enterprise_checklist), 'SEC-005', 'Security', 'Vulnerability Scanning', 'Regular vulnerability scans performed and documented', 'REQUIRED', TRUE, '["document"]', 50, 'Provide recent vulnerability scan report'),
-- Privacy (Required)
((SELECT id FROM enterprise_checklist), 'PRIV-001', 'Privacy', 'Privacy Policy', 'GDPR/CCPA compliant privacy policy published', 'REQUIRED', TRUE, '["link"]', 60, 'Publish privacy policy and provide URL'),
((SELECT id FROM enterprise_checklist), 'PRIV-002', 'Privacy', 'Data Processing Agreement', 'DPA template available for enterprise customers', 'REQUIRED', TRUE, '["document"]', 70, 'Create DPA template covering data processing terms'),
((SELECT id FROM enterprise_checklist), 'PRIV-003', 'Privacy', 'Data Retention Policy', 'Clear data retention and deletion policies documented', 'REQUIRED', TRUE, '["document"]', 80, 'Document data retention periods and deletion procedures'),
-- Legal (Required)
((SELECT id FROM enterprise_checklist), 'LEGAL-001', 'Legal', 'Terms of Service', 'Enterprise-ready terms of service', 'REQUIRED', TRUE, '["link"]', 90, 'Publish ToS and provide URL'),
((SELECT id FROM enterprise_checklist), 'LEGAL-002', 'Legal', 'SLA Documentation', 'Service Level Agreement with uptime guarantees', 'REQUIRED', TRUE, '["document"]', 100, 'Create SLA document with availability commitments'),
-- Operations (Required)
((SELECT id FROM enterprise_checklist), 'OPS-001', 'Operations', 'Incident Response Plan', 'Documented incident response procedures', 'REQUIRED', TRUE, '["document"]', 110, 'Create incident response runbook'),
((SELECT id FROM enterprise_checklist), 'OPS-002', 'Operations', 'Business Continuity Plan', 'Documented backup and recovery procedures', 'REQUIRED', TRUE, '["document"]', 120, 'Document backup strategy and recovery procedures'),
-- Recommended items
((SELECT id FROM enterprise_checklist), 'SEC-006', 'Security', 'Penetration Testing', 'Annual third-party penetration testing', 'RECOMMENDED', TRUE, '["document"]', 130, 'Engage third-party for penetration testing'),
((SELECT id FROM enterprise_checklist), 'CERT-001', 'Certification', 'SOC2 Type II Roadmap', 'Plan for SOC2 Type II certification', 'RECOMMENDED', TRUE, '["document"]', 140, 'Create SOC2 certification roadmap'),
((SELECT id FROM enterprise_checklist), 'CERT-002', 'Certification', 'ISO 27001 Consideration', 'Evaluate ISO 27001 certification path', 'RECOMMENDED', FALSE, NULL, 150, 'Assess feasibility of ISO 27001 certification');

-- Insert items for B2B SMB (streamlined)
WITH smb_checklist AS (
  SELECT id FROM compliance_checklists WHERE archetype = 'B2B_SMB' AND version = 1
)
INSERT INTO compliance_checklist_items (checklist_id, item_code, category, title, description, requirement_level, evidence_required, evidence_types, sort_order, guidance_text) VALUES
-- Security (Required)
((SELECT id FROM smb_checklist), 'SEC-001', 'Security', 'Security Policy Document', 'Basic security policy covering data protection', 'REQUIRED', TRUE, '["document"]', 10, 'Create a security policy document'),
((SELECT id FROM smb_checklist), 'SEC-002', 'Security', 'Access Control', 'User authentication and authorization implemented', 'REQUIRED', TRUE, '["screenshot"]', 20, 'Document access control implementation'),
((SELECT id FROM smb_checklist), 'SEC-003', 'Security', 'Encryption in Transit', 'All data in transit encrypted using TLS', 'REQUIRED', TRUE, '["screenshot"]', 30, 'Provide SSL certificate evidence'),
-- Privacy (Required)
((SELECT id FROM smb_checklist), 'PRIV-001', 'Privacy', 'Privacy Policy', 'Privacy policy published', 'REQUIRED', TRUE, '["link"]', 40, 'Publish privacy policy'),
((SELECT id FROM smb_checklist), 'PRIV-002', 'Privacy', 'Data Handling Docs', 'Document how customer data is handled', 'REQUIRED', TRUE, '["document"]', 50, 'Document data handling procedures'),
-- Legal (Required)
((SELECT id FROM smb_checklist), 'LEGAL-001', 'Legal', 'Terms of Service', 'Terms of service published', 'REQUIRED', TRUE, '["link"]', 60, 'Publish ToS'),
-- Operations (Required)
((SELECT id FROM smb_checklist), 'OPS-001', 'Operations', 'Backup Procedures', 'Regular backups configured', 'REQUIRED', TRUE, '["screenshot"]', 70, 'Document backup configuration'),
-- Recommended items
((SELECT id FROM smb_checklist), 'SEC-004', 'Security', 'Encryption at Rest', 'Sensitive data encrypted at rest', 'RECOMMENDED', TRUE, '["document"]', 80, 'Implement encryption at rest'),
((SELECT id FROM smb_checklist), 'SEC-005', 'Security', 'Vulnerability Scanning', 'Regular vulnerability scans', 'RECOMMENDED', TRUE, '["document"]', 90, 'Set up vulnerability scanning'),
((SELECT id FROM smb_checklist), 'OPS-002', 'Operations', 'Incident Response', 'Basic incident response procedures', 'RECOMMENDED', TRUE, '["document"]', 100, 'Create incident response guidelines'),
((SELECT id FROM smb_checklist), 'PRIV-003', 'Privacy', 'Data Retention', 'Data retention policy', 'RECOMMENDED', TRUE, '["document"]', 110, 'Document data retention'),
((SELECT id FROM smb_checklist), 'LEGAL-002', 'Legal', 'DPA Template', 'Data processing agreement', 'RECOMMENDED', TRUE, '["document"]', 120, 'Create DPA template');

-- Insert items for B2C
WITH b2c_checklist AS (
  SELECT id FROM compliance_checklists WHERE archetype = 'B2C' AND version = 1
)
INSERT INTO compliance_checklist_items (checklist_id, item_code, category, title, description, requirement_level, evidence_required, evidence_types, sort_order, guidance_text) VALUES
-- Privacy (Required - high priority for B2C)
((SELECT id FROM b2c_checklist), 'PRIV-001', 'Privacy', 'Privacy Policy', 'Consumer-friendly privacy policy', 'REQUIRED', TRUE, '["link"]', 10, 'Publish clear, readable privacy policy'),
((SELECT id FROM b2c_checklist), 'PRIV-002', 'Privacy', 'Cookie Consent', 'Cookie consent mechanism implemented', 'REQUIRED', TRUE, '["screenshot"]', 20, 'Implement cookie consent banner'),
((SELECT id FROM b2c_checklist), 'PRIV-003', 'Privacy', 'Data Deletion Request', 'Ability for users to request data deletion', 'REQUIRED', TRUE, '["screenshot"]', 30, 'Implement data deletion workflow'),
-- Security (Required)
((SELECT id FROM b2c_checklist), 'SEC-001', 'Security', 'Secure Authentication', 'Secure user authentication implemented', 'REQUIRED', TRUE, '["screenshot"]', 40, 'Implement secure auth with password requirements'),
((SELECT id FROM b2c_checklist), 'SEC-002', 'Security', 'Encryption in Transit', 'All data in transit encrypted', 'REQUIRED', TRUE, '["screenshot"]', 50, 'Configure TLS/SSL'),
-- Legal (Required)
((SELECT id FROM b2c_checklist), 'LEGAL-001', 'Legal', 'Terms of Service', 'Consumer terms of service', 'REQUIRED', TRUE, '["link"]', 60, 'Publish consumer ToS'),
((SELECT id FROM b2c_checklist), 'LEGAL-002', 'Legal', 'Refund Policy', 'Clear refund/cancellation policy', 'REQUIRED', TRUE, '["link"]', 70, 'Publish refund policy'),
-- Accessibility (Required)
((SELECT id FROM b2c_checklist), 'A11Y-001', 'Accessibility', 'Basic Accessibility', 'WCAG 2.1 Level A compliance', 'REQUIRED', TRUE, '["document"]', 80, 'Conduct basic accessibility audit'),
-- Recommended items
((SELECT id FROM b2c_checklist), 'PRIV-004', 'Privacy', 'Data Export', 'User data export capability', 'RECOMMENDED', TRUE, '["screenshot"]', 90, 'Implement data export feature'),
((SELECT id FROM b2c_checklist), 'SEC-003', 'Security', 'Two-Factor Auth', 'Optional 2FA for users', 'RECOMMENDED', TRUE, '["screenshot"]', 100, 'Implement optional 2FA'),
((SELECT id FROM b2c_checklist), 'A11Y-002', 'Accessibility', 'Enhanced Accessibility', 'WCAG 2.1 Level AA compliance', 'RECOMMENDED', TRUE, '["document"]', 110, 'Work toward AA compliance'),
((SELECT id FROM b2c_checklist), 'TRUST-001', 'Trust', 'Trust Badges', 'Display trust indicators', 'RECOMMENDED', FALSE, NULL, 120, 'Add trust badges/seals');

-- Insert artifact templates (FR-4: at least 6 templates)
INSERT INTO compliance_artifact_templates (template_code, name, description, applicable_archetypes, content_template) VALUES
('SECURITY_POLICY', 'Security Policy Document', 'Comprehensive security policy template',
 ARRAY['B2B_ENTERPRISE', 'B2B_SMB'],
 E'# Security Policy\n\n## 1. Purpose\nThis document establishes the security policy for {{venture_name}}.\n\n## 2. Scope\nThis policy applies to all employees, contractors, and systems.\n\n## 3. Access Control\n- All access requires authentication\n- Role-based access control (RBAC) is enforced\n- Access reviews conducted quarterly\n\n## 4. Data Protection\n- All sensitive data encrypted at rest and in transit\n- Data classification: Public, Internal, Confidential, Restricted\n\n## 5. Incident Response\nSee Incident Response Plan document.\n\n## 6. Review\nThis policy is reviewed annually.\n\n---\nDocument Version: 1.0\nEffective Date: {{effective_date}}\nOwner: {{owner_name}}'),

('ACCESS_CONTROL_POLICY', 'Access Control Policy', 'Role-based access control documentation template',
 ARRAY['B2B_ENTERPRISE', 'B2B_SMB'],
 E'# Access Control Policy\n\n## 1. Authentication\n- Multi-factor authentication required for admin access\n- Password requirements: minimum 12 characters, complexity enforced\n- Session timeout: 30 minutes of inactivity\n\n## 2. Authorization\n### Role Definitions\n| Role | Permissions |\n|------|------------|\n| Admin | Full access |\n| Manager | Read/write operations |\n| User | Read access, own data write |\n\n## 3. Access Reviews\n- Quarterly access reviews\n- Immediate revocation on termination\n\n---\nVersion: 1.0\nOwner: {{owner_name}}'),

('INCIDENT_RESPONSE_PLAN', 'Incident Response Plan', 'Security incident response procedures template',
 ARRAY['B2B_ENTERPRISE', 'B2B_SMB'],
 E'# Incident Response Plan\n\n## 1. Incident Classification\n- **Critical**: Data breach, system compromise\n- **High**: Service outage, suspected breach\n- **Medium**: Vulnerability discovered\n- **Low**: Minor security event\n\n## 2. Response Team\n- Incident Commander: {{incident_commander}}\n- Technical Lead: {{technical_lead}}\n- Communications: {{comms_lead}}\n\n## 3. Response Procedures\n1. Detection & Reporting\n2. Containment\n3. Eradication\n4. Recovery\n5. Post-Incident Review\n\n## 4. Communication Templates\n[Include notification templates]\n\n---\nVersion: 1.0'),

('VENDOR_RISK_ASSESSMENT', 'Vendor Risk Assessment', 'Third-party vendor security assessment template',
 ARRAY['B2B_ENTERPRISE'],
 E'# Vendor Risk Assessment\n\n## Vendor Information\n- Vendor Name: {{vendor_name}}\n- Service Provided: {{service_description}}\n- Data Access Level: {{data_access_level}}\n\n## Security Assessment\n| Category | Score (1-5) | Notes |\n|----------|-------------|-------|\n| Data Protection | | |\n| Access Control | | |\n| Compliance | | |\n| Incident Response | | |\n\n## Risk Rating\n- [ ] Low Risk\n- [ ] Medium Risk\n- [ ] High Risk\n\n## Recommendations\n\n---\nAssessed By: {{assessor}}\nDate: {{assessment_date}}'),

('DATA_RETENTION_POLICY', 'Data Retention Policy', 'Data retention and deletion procedures template',
 ARRAY['B2B_ENTERPRISE', 'B2B_SMB', 'B2C'],
 E'# Data Retention Policy\n\n## 1. Purpose\nDefine retention periods and deletion procedures for {{venture_name}}.\n\n## 2. Data Categories\n| Data Type | Retention Period | Deletion Method |\n|-----------|------------------|----------------|\n| User Account Data | Duration of account + 30 days | Secure deletion |\n| Transaction Records | 7 years | Archive then delete |\n| Logs | 90 days | Automatic purge |\n| Backups | 30 days | Secure overwrite |\n\n## 3. Deletion Requests\n- User requests processed within 30 days\n- Confirmation provided upon completion\n\n## 4. Exceptions\n- Legal hold requirements\n- Regulatory compliance\n\n---\nVersion: 1.0'),

('PRIVACY_POLICY', 'Privacy Policy', 'GDPR/CCPA compliant privacy policy template',
 ARRAY['B2B_ENTERPRISE', 'B2B_SMB', 'B2C'],
 E'# Privacy Policy\n\n**Last Updated**: {{effective_date}}\n\n## 1. Introduction\n{{venture_name}} ("we", "our") is committed to protecting your privacy.\n\n## 2. Information We Collect\n- Account information (name, email)\n- Usage data\n- Device information\n\n## 3. How We Use Your Information\n- Provide our services\n- Improve user experience\n- Communicate with you\n\n## 4. Data Sharing\nWe do not sell your personal information.\n\n## 5. Your Rights\n- Access your data\n- Request deletion\n- Opt out of marketing\n\n## 6. Contact Us\nEmail: privacy@{{domain}}\n\n---\nVersion: 1.0'),

('SLA_DOCUMENT', 'Service Level Agreement', 'Enterprise SLA template with uptime guarantees',
 ARRAY['B2B_ENTERPRISE'],
 E'# Service Level Agreement\n\n## 1. Service Availability\n- **Target Uptime**: 99.9%\n- **Measurement Period**: Monthly\n- **Exclusions**: Scheduled maintenance, force majeure\n\n## 2. Support Response Times\n| Severity | Response Time | Resolution Target |\n|----------|--------------|------------------|\n| Critical | 1 hour | 4 hours |\n| High | 4 hours | 24 hours |\n| Medium | 8 hours | 72 hours |\n| Low | 24 hours | 5 business days |\n\n## 3. Service Credits\n| Uptime | Credit |\n|--------|--------|\n| 99.0-99.9% | 10% |\n| 95.0-99.0% | 25% |\n| <95.0% | 50% |\n\n## 4. Reporting\nMonthly uptime reports provided.\n\n---\nVersion: 1.0');

-- ============================================================================
-- 12. UPDATE TRIGGER for updated_at timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers to all tables with updated_at
DROP TRIGGER IF EXISTS update_compliance_checklists_updated_at ON compliance_checklists;
CREATE TRIGGER update_compliance_checklists_updated_at
  BEFORE UPDATE ON compliance_checklists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_compliance_checklist_items_updated_at ON compliance_checklist_items;
CREATE TRIGGER update_compliance_checklist_items_updated_at
  BEFORE UPDATE ON compliance_checklist_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_venture_compliance_progress_updated_at ON venture_compliance_progress;
CREATE TRIGGER update_venture_compliance_progress_updated_at
  BEFORE UPDATE ON venture_compliance_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_compliance_artifact_templates_updated_at ON compliance_artifact_templates;
CREATE TRIGGER update_compliance_artifact_templates_updated_at
  BEFORE UPDATE ON compliance_artifact_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_venture_compliance_artifacts_updated_at ON venture_compliance_artifacts;
CREATE TRIGGER update_venture_compliance_artifacts_updated_at
  BEFORE UPDATE ON venture_compliance_artifacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Migration complete
-- ============================================================================
COMMENT ON TABLE compliance_checklists IS 'SD-LIFECYCLE-GAP-002: Archetype-specific compliance checklists with versioning';
COMMENT ON TABLE compliance_checklist_items IS 'SD-LIFECYCLE-GAP-002: Individual checklist items with REQUIRED/RECOMMENDED tiers';
COMMENT ON TABLE venture_compliance_progress IS 'SD-LIFECYCLE-GAP-002: Per-venture compliance item completion tracking';
COMMENT ON TABLE compliance_artifact_templates IS 'SD-LIFECYCLE-GAP-002: Templates for generating compliance artifacts';
COMMENT ON TABLE venture_compliance_artifacts IS 'SD-LIFECYCLE-GAP-002: Venture-owned generated artifacts';
COMMENT ON TABLE compliance_gate_events IS 'SD-LIFECYCLE-GAP-002: Audit trail for gate evaluations and metrics';
