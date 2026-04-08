-- Migration: Create ship_review_findings table
-- Purpose: Audit trail for /ship review gate findings
-- Date: 2026-04-08

CREATE TABLE IF NOT EXISTS ship_review_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_number INTEGER NOT NULL,
  review_tier TEXT NOT NULL CHECK (review_tier IN ('light', 'standard', 'deep')),
  risk_score NUMERIC(4,2),
  finding_count INTEGER NOT NULL DEFAULT 0,
  finding_categories JSONB DEFAULT '{}',
  verdict TEXT NOT NULL CHECK (verdict IN ('pass', 'block')),
  sd_key TEXT,
  branch TEXT,
  multi_agent BOOLEAN DEFAULT false,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ship_review_findings_pr ON ship_review_findings(pr_number);
CREATE INDEX IF NOT EXISTS idx_ship_review_findings_reviewed_at ON ship_review_findings(reviewed_at);

COMMENT ON TABLE ship_review_findings IS 'Audit trail for /ship review gate findings. Every PR gets a record with tier, score, and finding details.';

-- Rollback:
-- DROP INDEX IF EXISTS idx_ship_review_findings_reviewed_at;
-- DROP INDEX IF EXISTS idx_ship_review_findings_pr;
-- DROP TABLE IF EXISTS ship_review_findings;
