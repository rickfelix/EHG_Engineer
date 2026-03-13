-- Migration: rd_proposals table for Autonomous Skunkworks R&D
-- SD: SD-AUTONOMOUS-SKUNKWORKS-RD-DEPARTMENT-ORCH-001-A

CREATE TABLE IF NOT EXISTS rd_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_impact TEXT,
  target_application TEXT NOT NULL DEFAULT 'EHG_Engineer',
  priority_score NUMERIC(5,2) NOT NULL CHECK (priority_score >= 0 AND priority_score <= 100),
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'accepted', 'dismissed', 'deferred')),
  signal_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  methodology TEXT,
  batch_run_id TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rd_proposals_status ON rd_proposals(status);
CREATE INDEX IF NOT EXISTS idx_rd_proposals_created_at ON rd_proposals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rd_proposals_batch_run ON rd_proposals(batch_run_id);
CREATE INDEX IF NOT EXISTS idx_rd_proposals_priority ON rd_proposals(priority_score DESC);

-- RLS
ALTER TABLE rd_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON rd_proposals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read" ON rd_proposals
  FOR SELECT TO authenticated USING (true);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_rd_proposals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rd_proposals_updated_at ON rd_proposals;
CREATE TRIGGER trg_rd_proposals_updated_at
  BEFORE UPDATE ON rd_proposals
  FOR EACH ROW
  EXECUTE FUNCTION update_rd_proposals_updated_at();
