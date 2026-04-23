-- Migration: campaign_enrollments table
-- SD-EHG-MARKETING-DISTRIBUTION-INFRASTRUCTURE-ORCH-001-A (Phase 0)
-- Date: 2026-04-23
-- Purpose: Persistent enrollment + delivery state for email drip campaigns
--          (replaces stub returns in lib/marketing/ai/email-campaigns.js)

-- ============================================================================
-- Table: campaign_enrollments
-- ============================================================================
CREATE TABLE IF NOT EXISTS campaign_enrollments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id        UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  lead_email        TEXT NOT NULL,
  campaign_id       TEXT NOT NULL,
  current_step      INTEGER NOT NULL DEFAULT 0,
  opened_previous   BOOLEAN NOT NULL DEFAULT false,
  next_step_at      TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','paused','completed','unsubscribed')),
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (venture_id, lead_email, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_enrollments_venture
  ON campaign_enrollments (venture_id);

CREATE INDEX IF NOT EXISTS idx_campaign_enrollments_next_step
  ON campaign_enrollments (status, next_step_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_campaign_enrollments_email
  ON campaign_enrollments (lead_email);

-- ============================================================================
-- RLS (mirrors pattern from 20260214_marketing_engine_foundation.sql)
-- ============================================================================
ALTER TABLE campaign_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_campaign_enrollments" ON campaign_enrollments;
CREATE POLICY "service_role_all_campaign_enrollments" ON campaign_enrollments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "venture_read_campaign_enrollments" ON campaign_enrollments;
CREATE POLICY "venture_read_campaign_enrollments" ON campaign_enrollments
  FOR SELECT TO authenticated
  USING (venture_id IN (
    SELECT id FROM ventures WHERE (auth.uid())::text = (created_by)::text
  ));

COMMENT ON TABLE campaign_enrollments IS
  'Email drip campaign enrollment + delivery state per (venture, lead, campaign). '
  'Replaces stub returns in lib/marketing/ai/email-campaigns.js shipped by '
  'SD-LEO-INFRA-PHANTOM-TABLE-REFERENCE-001-C. Added by '
  'SD-EHG-MARKETING-DISTRIBUTION-INFRASTRUCTURE-ORCH-001-A.';
