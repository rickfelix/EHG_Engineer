-- Migration: Create venture_quality_findings table
-- SD: SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-B
-- Date: 2026-04-29
--
-- Persistence layer for the Stage 20 Unified Quality Lifecycle Loop.
-- Accepts findings from all 10 unified categories (npm_audit, secrets, lint,
-- test_suite, unit_test, e2e_test, uat_test, bug_report, uat_signoff, capability)
-- per Component A's canonical FindingShape spec.
--
-- stage_number INT is intentionally NOT pinned via CHECK to allow future stages
-- to adopt the fabric without schema change (forward compatibility).

CREATE TABLE IF NOT EXISTS venture_quality_findings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id        UUID NOT NULL,
  stage_number      INTEGER NOT NULL,
  finding_category  TEXT NOT NULL,
  severity          TEXT NOT NULL,
  finding_hash      TEXT NOT NULL,
  evidence_pointer  JSONB NOT NULL DEFAULT '{}'::jsonb,
  sd_key            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ,

  CONSTRAINT venture_quality_findings_finding_category_check
    CHECK (finding_category IN (
      'npm_audit', 'secrets', 'lint', 'test_suite',
      'unit_test', 'e2e_test',
      'uat_test', 'bug_report', 'uat_signoff',
      'capability'
    )),

  CONSTRAINT venture_quality_findings_severity_check
    CHECK (severity IN ('critical', 'high', 'medium', 'low')),

  -- Idempotency: one row per (venture, finding_hash). Re-running quality scan
  -- produces UPSERT on existing rows rather than duplicates. Component C's
  -- per-finding SD generator and Component F's aggregator both key on this.
  CONSTRAINT venture_quality_findings_unique_hash
    UNIQUE (venture_id, finding_hash)
);

CREATE INDEX IF NOT EXISTS venture_quality_findings_venture_idx
  ON venture_quality_findings (venture_id);

CREATE INDEX IF NOT EXISTS venture_quality_findings_category_idx
  ON venture_quality_findings (finding_category);

CREATE INDEX IF NOT EXISTS venture_quality_findings_severity_idx
  ON venture_quality_findings (severity);

CREATE INDEX IF NOT EXISTS venture_quality_findings_unresolved_idx
  ON venture_quality_findings (venture_id, finding_category)
  WHERE resolved_at IS NULL;

-- RLS policy: service-role writes; authenticated reads.
-- Service-role-only writes match the Stage 20 hook's invocation context.
ALTER TABLE venture_quality_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venture_quality_findings_service_role_all ON venture_quality_findings;
CREATE POLICY venture_quality_findings_service_role_all
  ON venture_quality_findings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS venture_quality_findings_authenticated_read ON venture_quality_findings;
CREATE POLICY venture_quality_findings_authenticated_read
  ON venture_quality_findings
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE venture_quality_findings IS
  'Canonical persistence layer for Stage 20 Unified Quality Lifecycle Loop. SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-B.';

COMMENT ON COLUMN venture_quality_findings.stage_number IS
  'Stage that emitted the finding. Currently always 20; column kept open (no CHECK pin) for forward compatibility with future stages adopting the fabric.';

COMMENT ON COLUMN venture_quality_findings.finding_hash IS
  'Deterministic dedup key. See lib/eva/quality-findings/finding-shape.js::computeFindingHash.';
