-- Migration: self_audit_findings table for LEO self-discovery infrastructure
-- SD: SD-LEO-SELF-IMPROVE-002B (Phase 2: Self-Discovery Infrastructure)
-- Created: 2026-02-02

-- self_audit_findings table for LEO self-discovery infrastructure
CREATE TABLE IF NOT EXISTS self_audit_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Routine identification
  routine_key TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('finding', 'proposal', 'both')),

  -- Finding details
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  confidence NUMERIC(3,2) NOT NULL CHECK (confidence >= 0.00 AND confidence <= 1.00),

  -- Source reference
  repo_ref TEXT NOT NULL,
  commit_sha TEXT NOT NULL,

  -- Evidence (Contract A2)
  evidence_pack JSONB NOT NULL,

  -- Deduplication
  fingerprint TEXT NOT NULL,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
  dismissed_reason TEXT,

  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Deduplication constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_self_audit_findings_dedup
ON self_audit_findings (routine_key, fingerprint, commit_sha, mode);

-- Query performance indexes
CREATE INDEX IF NOT EXISTS idx_self_audit_findings_routine_created
ON self_audit_findings (routine_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_self_audit_findings_evidence_pack
ON self_audit_findings USING GIN (evidence_pack);

CREATE INDEX IF NOT EXISTS idx_self_audit_findings_status
ON self_audit_findings (status) WHERE status = 'open';

-- Comments
COMMENT ON TABLE self_audit_findings IS 'Stores findings from LEO self-discovery routines (SD-LEO-SELF-IMPROVE-002B)';
COMMENT ON COLUMN self_audit_findings.evidence_pack IS 'JSONB containing EvidencePack with path, line_start, line_end, snippet, evidence_type per Contract A2';
COMMENT ON COLUMN self_audit_findings.fingerprint IS 'Hash for deduplication across runs';
