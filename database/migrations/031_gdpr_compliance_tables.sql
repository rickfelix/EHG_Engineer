-- Migration: 031_gdpr_compliance_tables.sql
-- SD: SD-COMPLIANCE-GDPR-001
-- Purpose: GDPR compliance tables for consent management and data subject rights
-- Created: 2026-01-02

-- ============================================================================
-- TABLE: user_consent_records
-- ============================================================================
-- Stores consent preferences per user and category (essential, analytics, marketing)

CREATE TABLE IF NOT EXISTS user_consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User identification
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anonymous_id TEXT, -- For anonymous visitors (localStorage ID)

  -- Multi-tenant support
  venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,

  -- Consent category
  consent_type TEXT NOT NULL CHECK (consent_type IN (
    'essential',
    'analytics',
    'marketing',
    'functional',
    'personalization'
  )),

  -- Consent state
  granted BOOLEAN NOT NULL DEFAULT false,
  granted_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,

  -- Consent version tracking (links to legal_templates)
  consent_text_version TEXT,
  consent_source TEXT, -- 'banner', 'preference_center', 'api'

  -- IP and context (for audit trail)
  ip_address INET,
  user_agent TEXT,

  -- Audit columns
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- One consent per user/type/venture combination
  CONSTRAINT unique_user_consent UNIQUE (user_id, consent_type, venture_id),
  CONSTRAINT unique_anonymous_consent UNIQUE (anonymous_id, consent_type, venture_id)
);

-- ============================================================================
-- TABLE: data_deletion_requests
-- ============================================================================
-- Tracks GDPR Article 17 "Right to be Forgotten" requests

CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User identification
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL, -- Preserved after deletion for audit

  -- Request details
  request_reason TEXT,
  request_scope TEXT DEFAULT 'all' CHECK (request_scope IN ('all', 'partial')),
  partial_scope_details JSONB, -- If partial, which data to delete

  -- Status workflow
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'verified',    -- User identity verified
    'processing',  -- Deletion in progress
    'completed',   -- All data deleted
    'rejected',    -- Request rejected with reason
    'cancelled'    -- User cancelled request
  )),

  -- Processing details
  verification_token TEXT,
  verified_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Rejection handling
  rejection_reason TEXT,
  rejected_by TEXT,
  rejected_at TIMESTAMPTZ,

  -- Audit trail
  deletion_log JSONB DEFAULT '[]'::jsonb, -- What was deleted

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- GDPR requires processing within 30 days
  deadline_at TIMESTAMPTZ GENERATED ALWAYS AS (created_at + INTERVAL '30 days') STORED
);

-- ============================================================================
-- TABLE: data_export_requests
-- ============================================================================
-- Tracks GDPR Article 20 "Right to Data Portability" requests

CREATE TABLE IF NOT EXISTS data_export_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User identification
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,

  -- Export format
  export_format TEXT DEFAULT 'json' CHECK (export_format IN ('json', 'csv', 'xml')),

  -- Status workflow
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'processing',
    'completed',
    'expired',
    'failed'
  )),

  -- Export output
  output_url TEXT, -- Signed URL to download
  output_size_bytes BIGINT,
  output_expires_at TIMESTAMPTZ, -- URL expiration (7 days)

  -- Processing details
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,

  -- What data was included
  included_data JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- GDPR requires response within 30 days
  deadline_at TIMESTAMPTZ GENERATED ALWAYS AS (created_at + INTERVAL '30 days') STORED
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_consent_user ON user_consent_records(user_id);
CREATE INDEX IF NOT EXISTS idx_user_consent_venture ON user_consent_records(venture_id);
CREATE INDEX IF NOT EXISTS idx_user_consent_type ON user_consent_records(consent_type);
CREATE INDEX IF NOT EXISTS idx_user_consent_anonymous ON user_consent_records(anonymous_id);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_user ON data_deletion_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON data_deletion_requests(status);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_pending ON data_deletion_requests(status) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_export_requests_user ON data_export_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_export_requests_status ON data_export_requests(status);
CREATE INDEX IF NOT EXISTS idx_export_requests_pending ON data_export_requests(status) WHERE status = 'pending';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE user_consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_export_requests ENABLE ROW LEVEL SECURITY;

-- User consent: users can only see/manage their own consent
CREATE POLICY user_consent_own_records ON user_consent_records
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR user_id = auth.uid()
    OR (anonymous_id IS NOT NULL AND anonymous_id = current_setting('app.anonymous_id', true))
  );

-- Deletion requests: users can only see their own, admins can see all
CREATE POLICY deletion_requests_own ON data_deletion_requests
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Only users can create deletion requests for themselves
CREATE POLICY deletion_requests_create ON data_deletion_requests
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR user_id = auth.uid()
  );

-- Only admins/service can process deletion requests
CREATE POLICY deletion_requests_process ON data_deletion_requests
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Export requests: users can only see their own, admins can see all
CREATE POLICY export_requests_own ON data_export_requests
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Only users can create export requests for themselves
CREATE POLICY export_requests_create ON data_export_requests
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR user_id = auth.uid()
  );

-- Only admins/service can process export requests
CREATE POLICY export_requests_process ON data_export_requests
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_gdpr_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_consent_records_updated_at ON user_consent_records;
CREATE TRIGGER user_consent_records_updated_at
  BEFORE UPDATE ON user_consent_records
  FOR EACH ROW
  EXECUTE FUNCTION update_gdpr_updated_at();

DROP TRIGGER IF EXISTS data_deletion_requests_updated_at ON data_deletion_requests;
CREATE TRIGGER data_deletion_requests_updated_at
  BEFORE UPDATE ON data_deletion_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_gdpr_updated_at();

DROP TRIGGER IF EXISTS data_export_requests_updated_at ON data_export_requests;
CREATE TRIGGER data_export_requests_updated_at
  BEFORE UPDATE ON data_export_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_gdpr_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE user_consent_records IS 'GDPR consent preferences per user and category';
COMMENT ON TABLE data_deletion_requests IS 'GDPR Article 17 Right to be Forgotten requests';
COMMENT ON TABLE data_export_requests IS 'GDPR Article 20 Right to Data Portability requests';

COMMENT ON COLUMN user_consent_records.consent_type IS 'Consent category: essential, analytics, marketing, functional, personalization';
COMMENT ON COLUMN data_deletion_requests.deadline_at IS 'GDPR requires processing within 30 days of request';
COMMENT ON COLUMN data_export_requests.output_expires_at IS 'Signed URL expires after 7 days for security';
