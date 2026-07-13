-- Migration: 20260713_legal_doc_producer_schema.sql
-- @approved-by: codestreetlabs@gmail.com
-- SD: SD-FDBK-FIX-BUILD-LEGAL-DOC-001 (V5, chairman-ratified 2026-07-12)
-- Purpose: Legal-doc producer schema -- master templates + per-venture generated
-- documents, so Stage-23 launch-readiness can check real document presence
-- instead of an ignored-advisory placeholder.
--
-- Adapted from database/migrations/030_legal_templates_tables.sql (SD-LEGAL-
-- TEMPLATES-001, 2026-01-02, never applied). The table/column design is reused,
-- but the RLS is NOT reused as-is: the original policies reference
-- companies.owner_id and profiles.role='admin', and companies.owner_id does NOT
-- exist in the live schema (verified via information_schema.columns before
-- writing this migration). RLS here uses the current fn_user_has_venture_access()
-- / fn_is_chairman() idiom (confirmed live in pg_proc) used elsewhere in this
-- codebase for venture-scoped tables.

BEGIN;

-- ============================================================================
-- TABLE: legal_templates
-- ============================================================================
-- Master legal document templates with versioning and fixed substitution markers.

CREATE TABLE IF NOT EXISTS legal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

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

  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  supersedes_id UUID REFERENCES legal_templates(id),

  title TEXT NOT NULL,
  content TEXT NOT NULL,  -- Markdown template content with {{TOKEN}}-style markers

  -- Format: [{"key": "{{COMPANY_NAME}}", "description": "Company legal name", "required": true}]
  markers JSONB DEFAULT '[]'::jsonb,

  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'review', 'approved', 'active', 'deprecated', 'archived'
  )),

  legal_reviewed_at TIMESTAMPTZ,
  legal_reviewed_by TEXT,
  review_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by TEXT,

  CONSTRAINT unique_active_template_type UNIQUE (template_type, version)
);

-- ============================================================================
-- TABLE: venture_legal_overrides
-- ============================================================================
-- Per-venture generated legal documents (cache of the producer's output).

CREATE TABLE IF NOT EXISTS venture_legal_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES legal_templates(id) ON DELETE CASCADE,

  -- Format: {"markers": {"{{COMPANY_NAME}}": "Acme Inc"}}
  substitution_values JSONB NOT NULL DEFAULT '{}'::jsonb,

  is_active BOOLEAN NOT NULL DEFAULT true,

  generated_content TEXT,
  generated_at TIMESTAMPTZ,

  published_at TIMESTAMPTZ,
  published_url TEXT,

  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by TEXT,

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

-- Master templates: readable by any authenticated user (not tenant-scoped data),
-- writable only by service_role or chairman.
CREATE POLICY legal_templates_read ON legal_templates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY legal_templates_write ON legal_templates
  FOR ALL
  TO authenticated
  USING (auth.role() = 'service_role' OR fn_is_chairman())
  WITH CHECK (auth.role() = 'service_role' OR fn_is_chairman());

-- Per-venture generated documents: scoped via fn_user_has_venture_access(),
-- which resolves the caller's company access (or bypasses for chairman/admin/
-- owner roles) -- the canonical local idiom for venture-scoped RLS.
CREATE POLICY venture_legal_overrides_select ON venture_legal_overrides
  FOR SELECT
  TO authenticated
  USING (auth.role() = 'service_role' OR fn_user_has_venture_access(venture_id));

CREATE POLICY venture_legal_overrides_modify ON venture_legal_overrides
  FOR ALL
  TO authenticated
  USING (auth.role() = 'service_role' OR fn_user_has_venture_access(venture_id))
  WITH CHECK (auth.role() = 'service_role' OR fn_user_has_venture_access(venture_id));

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_legal_doc_tables_updated_at()
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
  EXECUTE FUNCTION update_legal_doc_tables_updated_at();

DROP TRIGGER IF EXISTS venture_legal_overrides_updated_at ON venture_legal_overrides;
CREATE TRIGGER venture_legal_overrides_updated_at
  BEFORE UPDATE ON venture_legal_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_legal_doc_tables_updated_at();

-- ============================================================================
-- SEED DATA: Initial templates (active, fixed substitution markers)
-- ============================================================================

INSERT INTO legal_templates (template_type, version, title, content, markers, status, created_by)
VALUES
  (
    'terms_of_service',
    1,
    'Terms of Service Template',
    E'# Terms of Service\n\n**Last Updated:** {{EFFECTIVE_DATE}}\n\n## 1. Agreement to Terms\n\nBy accessing or using {{COMPANY_NAME}} (\"the Service\"), available at {{COMPANY_DOMAIN}}, you agree to be bound by these Terms of Service.\n\n## 2. Description of Service\n\n{{COMPANY_NAME}} provides: {{SERVICE_DESCRIPTION}}\n\n## 3. Disclaimer\n\nTHIS DOCUMENT IS A TEMPLATE GENERATED FROM FIXED, PRE-APPROVED LANGUAGE AND VENTURE-SPECIFIC SUBSTITUTIONS. IT IS NOT LEGAL ADVICE. Consult a qualified attorney before relying on this document for legal compliance.\n\n## 4. Contact\n\nQuestions about these Terms: {{CONTACT_EMAIL}}',
    '[{"key": "{{COMPANY_NAME}}", "description": "Company or venture legal name", "required": true}, {"key": "{{COMPANY_DOMAIN}}", "description": "Venture domain", "required": true}, {"key": "{{SERVICE_DESCRIPTION}}", "description": "Short description of the service", "required": true}, {"key": "{{CONTACT_EMAIL}}", "description": "Contact email address", "required": true}, {"key": "{{EFFECTIVE_DATE}}", "description": "Document generation date", "required": true}]'::jsonb,
    'active',
    'SD-FDBK-FIX-BUILD-LEGAL-DOC-001'
  ),
  (
    'privacy_policy',
    1,
    'Privacy Policy Template',
    E'# Privacy Policy\n\n**Last Updated:** {{EFFECTIVE_DATE}}\n\n## 1. Overview\n\n{{COMPANY_NAME}} (\"we\", \"us\") operates {{COMPANY_DOMAIN}}. This policy describes how we collect, use, and protect information.\n\n## 2. Information We Collect\n\nInformation you provide when using: {{SERVICE_DESCRIPTION}}\n\n## 3. Disclaimer\n\nTHIS DOCUMENT IS A TEMPLATE GENERATED FROM FIXED, PRE-APPROVED LANGUAGE AND VENTURE-SPECIFIC SUBSTITUTIONS. IT IS NOT LEGAL ADVICE. Consult a qualified attorney before relying on this document for legal compliance, including GDPR/CCPA obligations.\n\n## 4. Contact\n\nPrivacy questions: {{CONTACT_EMAIL}}',
    '[{"key": "{{COMPANY_NAME}}", "description": "Company or venture legal name", "required": true}, {"key": "{{COMPANY_DOMAIN}}", "description": "Venture domain", "required": true}, {"key": "{{SERVICE_DESCRIPTION}}", "description": "Short description of the service", "required": true}, {"key": "{{CONTACT_EMAIL}}", "description": "Contact email address", "required": true}, {"key": "{{EFFECTIVE_DATE}}", "description": "Document generation date", "required": true}]'::jsonb,
    'active',
    'SD-FDBK-FIX-BUILD-LEGAL-DOC-001'
  )
ON CONFLICT (template_type, version) DO NOTHING;

COMMIT;
