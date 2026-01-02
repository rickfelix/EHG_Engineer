-- Migration: 030_legal_templates_tables.sql
-- SD: SD-LEGAL-TEMPLATES-001
-- Purpose: Master legal templates and per-venture overrides
-- Created: 2026-01-02

-- ============================================================================
-- TABLE: legal_templates
-- ============================================================================
-- Master legal document templates with versioning and placeholders

CREATE TABLE IF NOT EXISTS legal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template identification
  template_type TEXT NOT NULL CHECK (template_type IN (
    'terms_of_service',
    'privacy_policy',
    'data_processing_agreement',
    'cookie_policy',
    'refund_policy',
    'acceptable_use_policy',
    'service_level_agreement',
    'nda'
  )),

  -- Version management
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  supersedes_id UUID REFERENCES legal_templates(id),

  -- Template content
  title TEXT NOT NULL,
  content TEXT NOT NULL,  -- Markdown/HTML template content

  -- Placeholders for customization
  -- Format: [{"key": "{{COMPANY_NAME}}", "description": "Company legal name", "required": true}]
  placeholders JSONB DEFAULT '[]'::jsonb,

  -- Sections breakdown (for selective overrides)
  -- Format: {"introduction": "...", "liability": "...", "termination": "..."}
  sections JSONB DEFAULT '{}'::jsonb,

  -- Status workflow
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'review',
    'approved',
    'active',
    'deprecated',
    'archived'
  )),

  -- Legal review tracking
  legal_reviewed_at TIMESTAMPTZ,
  legal_reviewed_by TEXT,
  review_notes TEXT,

  -- Audit columns
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by TEXT,

  -- Unique constraint: one active version per type
  CONSTRAINT unique_active_template_type UNIQUE (template_type, version)
);

-- ============================================================================
-- TABLE: venture_legal_overrides
-- ============================================================================
-- Per-venture customizations for legal templates

CREATE TABLE IF NOT EXISTS venture_legal_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign keys
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES legal_templates(id) ON DELETE CASCADE,

  -- Override content
  -- Format: {"placeholders": {"{{COMPANY_NAME}}": "Acme Inc"}, "sections": {"liability": "Custom text"}}
  override_content JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Generated document (cache)
  generated_content TEXT,
  generated_at TIMESTAMPTZ,

  -- Publication tracking
  published_at TIMESTAMPTZ,
  published_url TEXT,

  -- Audit columns
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by TEXT,

  -- One override per venture per template
  CONSTRAINT unique_venture_template UNIQUE (venture_id, template_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_legal_templates_type ON legal_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_legal_templates_status ON legal_templates(status);
CREATE INDEX IF NOT EXISTS idx_legal_templates_active ON legal_templates(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_venture_legal_overrides_venture ON venture_legal_overrides(venture_id);
CREATE INDEX IF NOT EXISTS idx_venture_legal_overrides_template ON venture_legal_overrides(template_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE legal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_legal_overrides ENABLE ROW LEVEL SECURITY;

-- Legal templates: readable by authenticated users, writable by admins
CREATE POLICY legal_templates_read ON legal_templates
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY legal_templates_write ON legal_templates
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Venture overrides: scoped to venture ownership
CREATE POLICY venture_legal_overrides_select ON venture_legal_overrides
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM ventures v
      JOIN companies c ON v.company_id = c.id
      WHERE v.id = venture_id AND c.owner_id = auth.uid()
    )
  );

CREATE POLICY venture_legal_overrides_modify ON venture_legal_overrides
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM ventures v
      JOIN companies c ON v.company_id = c.id
      WHERE v.id = venture_id AND c.owner_id = auth.uid()
    )
  );

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_legal_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS legal_templates_updated_at ON legal_templates;
CREATE TRIGGER legal_templates_updated_at
  BEFORE UPDATE ON legal_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_legal_templates_updated_at();

DROP TRIGGER IF EXISTS venture_legal_overrides_updated_at ON venture_legal_overrides;
CREATE TRIGGER venture_legal_overrides_updated_at
  BEFORE UPDATE ON venture_legal_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_legal_templates_updated_at();

-- ============================================================================
-- SEED DATA: Initial Templates (DRAFT status)
-- ============================================================================

INSERT INTO legal_templates (template_type, version, title, content, placeholders, status, created_by)
VALUES
  (
    'terms_of_service',
    1,
    'Terms of Service Template',
    '# Terms of Service

**Last Updated:** {{EFFECTIVE_DATE}}

## 1. Agreement to Terms

By accessing or using {{COMPANY_NAME}} ("the Service"), you agree to be bound by these Terms of Service.

## 2. Description of Service

{{SERVICE_DESCRIPTION}}

## 3. User Accounts

You are responsible for maintaining the confidentiality of your account credentials.

## 4. Acceptable Use

You agree not to use the Service for any unlawful purpose or in violation of these Terms.

## 5. Intellectual Property

All content and materials available on the Service are the property of {{COMPANY_NAME}}.

## 6. Limitation of Liability

{{COMPANY_NAME}} shall not be liable for any indirect, incidental, special, or consequential damages.

## 7. Termination

We may terminate or suspend your access to the Service at any time.

## 8. Governing Law

These Terms shall be governed by the laws of {{JURISDICTION}}.

## 9. Contact

For questions about these Terms, contact us at {{SUPPORT_EMAIL}}.

---
*DRAFT - Requires legal review before use*',
    '[
      {"key": "{{COMPANY_NAME}}", "description": "Company legal name", "required": true},
      {"key": "{{EFFECTIVE_DATE}}", "description": "Terms effective date", "required": true},
      {"key": "{{SERVICE_DESCRIPTION}}", "description": "Brief service description", "required": true},
      {"key": "{{JURISDICTION}}", "description": "Governing law jurisdiction", "required": true},
      {"key": "{{SUPPORT_EMAIL}}", "description": "Support email address", "required": true}
    ]'::jsonb,
    'draft',
    'SD-LEGAL-TEMPLATES-001'
  ),
  (
    'privacy_policy',
    1,
    'Privacy Policy Template',
    '# Privacy Policy

**Last Updated:** {{EFFECTIVE_DATE}}

## 1. Introduction

{{COMPANY_NAME}} ("we", "us", "our") respects your privacy. This Privacy Policy explains how we collect, use, and protect your personal data.

## 2. Information We Collect

### 2.1 Information You Provide
- Account information (name, email, password)
- Payment information
- Communications with us

### 2.2 Automatically Collected Information
- Usage data and analytics
- Device information
- Cookies and similar technologies

## 3. How We Use Your Information

We use your information to:
- Provide and improve our services
- Process transactions
- Communicate with you
- Comply with legal obligations

## 4. Data Sharing

We may share your data with:
- Service providers
- Legal authorities when required
- Business partners (with consent)

## 5. Your Rights

You have the right to:
- Access your data
- Correct inaccurate data
- Delete your data
- Export your data
- Withdraw consent

## 6. Data Retention

We retain data for {{RETENTION_PERIOD}} or as required by law.

## 7. Security

We implement appropriate technical and organizational measures to protect your data.

## 8. Contact

For privacy inquiries: {{PRIVACY_EMAIL}}

---
*DRAFT - Requires legal review before use*',
    '[
      {"key": "{{COMPANY_NAME}}", "description": "Company legal name", "required": true},
      {"key": "{{EFFECTIVE_DATE}}", "description": "Policy effective date", "required": true},
      {"key": "{{RETENTION_PERIOD}}", "description": "Data retention period", "required": true},
      {"key": "{{PRIVACY_EMAIL}}", "description": "Privacy contact email", "required": true}
    ]'::jsonb,
    'draft',
    'SD-LEGAL-TEMPLATES-001'
  ),
  (
    'data_processing_agreement',
    1,
    'Data Processing Agreement Template',
    '# Data Processing Agreement

**Effective Date:** {{EFFECTIVE_DATE}}

## PARTIES

**Data Controller:** {{CONTROLLER_NAME}} ("Controller")
**Data Processor:** {{PROCESSOR_NAME}} ("Processor")

## 1. SCOPE AND PURPOSE

This Data Processing Agreement ("DPA") governs the processing of personal data by Processor on behalf of Controller.

## 2. DEFINITIONS

"Personal Data" means any information relating to an identified or identifiable natural person.
"Processing" means any operation performed on Personal Data.

## 3. PROCESSING INSTRUCTIONS

Processor shall process Personal Data only on documented instructions from Controller.

## 4. SECURITY MEASURES

Processor implements appropriate technical and organizational measures including:
- Encryption of data in transit and at rest
- Access controls and authentication
- Regular security assessments
- Incident response procedures

## 5. SUB-PROCESSORS

Processor may engage sub-processors with prior written consent from Controller.

## 6. DATA SUBJECT RIGHTS

Processor shall assist Controller in responding to data subject requests.

## 7. DATA BREACH NOTIFICATION

Processor shall notify Controller within {{BREACH_NOTIFICATION_HOURS}} hours of becoming aware of a data breach.

## 8. DATA TRANSFERS

International data transfers shall comply with applicable data protection laws.

## 9. TERM AND TERMINATION

This DPA remains in effect for the duration of the main service agreement.

## 10. GOVERNING LAW

This DPA shall be governed by the laws of {{JURISDICTION}}.

---
*DRAFT - Requires legal review before use*',
    '[
      {"key": "{{EFFECTIVE_DATE}}", "description": "DPA effective date", "required": true},
      {"key": "{{CONTROLLER_NAME}}", "description": "Data controller name", "required": true},
      {"key": "{{PROCESSOR_NAME}}", "description": "Data processor name", "required": true},
      {"key": "{{BREACH_NOTIFICATION_HOURS}}", "description": "Breach notification period in hours", "required": true},
      {"key": "{{JURISDICTION}}", "description": "Governing law jurisdiction", "required": true}
    ]'::jsonb,
    'draft',
    'SD-LEGAL-TEMPLATES-001'
  )
ON CONFLICT (template_type, version) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE legal_templates IS 'Master legal document templates with versioning and placeholders';
COMMENT ON TABLE venture_legal_overrides IS 'Per-venture customizations for legal templates';
COMMENT ON COLUMN legal_templates.placeholders IS 'JSONB array of placeholder definitions for template customization';
COMMENT ON COLUMN venture_legal_overrides.override_content IS 'JSONB with placeholder values and section overrides';
