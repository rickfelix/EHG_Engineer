-- Migration: marketing_feedback_cycles table
-- SD-EHG-MARKETING-DISTRIBUTION-INFRASTRUCTURE-ORCH-001-A (Phase 0)
-- Date: 2026-04-23
-- Purpose: MEASURE-state signal ingestion from marketing content
--          (engagement, replies, conversions, unsubscribes)

-- ============================================================================
-- Table: marketing_feedback_cycles
-- ============================================================================
CREATE TABLE IF NOT EXISTS marketing_feedback_cycles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id      UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  -- content_id is intentionally not a hard FK: marketing_content is not
  -- guaranteed to exist in every deployment, and we want feedback ingestion
  -- to be resilient to upstream table absence.
  content_id      UUID,
  cycle_type      TEXT NOT NULL
                   CHECK (cycle_type IN ('engagement','reply','conversion','unsubscribe')),
  signal_payload  JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','closed')),
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_marketing_feedback_cycles_venture_content
  ON marketing_feedback_cycles (venture_id, content_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_feedback_cycles_status
  ON marketing_feedback_cycles (status, created_at DESC)
  WHERE status = 'open';

-- ============================================================================
-- RLS
-- ============================================================================
ALTER TABLE marketing_feedback_cycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_marketing_feedback_cycles" ON marketing_feedback_cycles;
CREATE POLICY "service_role_all_marketing_feedback_cycles" ON marketing_feedback_cycles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "venture_read_marketing_feedback_cycles" ON marketing_feedback_cycles;
CREATE POLICY "venture_read_marketing_feedback_cycles" ON marketing_feedback_cycles
  FOR SELECT TO authenticated
  USING (venture_id IN (
    SELECT id FROM ventures WHERE (auth.uid())::text = (created_by)::text
  ));

COMMENT ON TABLE marketing_feedback_cycles IS
  'MEASURE-state feedback ingestion per marketing content invocation. '
  'Absorbs engagement / reply / conversion / unsubscribe signals as JSONB '
  'without schema changes. Added by '
  'SD-EHG-MARKETING-DISTRIBUTION-INFRASTRUCTURE-ORCH-001-A.';
