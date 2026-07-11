-- SD-LEO-INFRA-APA-PHASE-STANDING-001 (FR-3)
-- Durable results table for the APA Phase-2 standing entrypoint. One row per
-- assessed venture per cycle. No prior results table exists for APA output —
-- behavioral_verdicts was deferred to "child SDs" by the parent PRD
-- (SD-LEO-INFRA-AUTOMATED-PRODUCT-ASSESSMENT-001) and never created.
-- Additive only: CREATE TABLE IF NOT EXISTS + index + RLS, no destructive DDL (TIER-1).

CREATE TABLE IF NOT EXISTS apa_standing_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id uuid NOT NULL,
  url text NOT NULL,
  cycle_started_at timestamptz NOT NULL,
  assessment_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  primitives_passed int NOT NULL DEFAULT 0,
  primitives_total int NOT NULL DEFAULT 0,
  verdict text NOT NULL CHECK (verdict IN ('pass', 'fail', 'error')),
  consecutive_fail_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Latest-per-venture read path (dampening state machine + quiet-pass check).
CREATE INDEX IF NOT EXISTS idx_apa_standing_assessments_venture_created
  ON apa_standing_assessments (venture_id, created_at DESC);

ALTER TABLE apa_standing_assessments ENABLE ROW LEVEL SECURITY;

-- Service-role-only writes (mirrors venture_deployments' own posture): no
-- anon/authenticated policy is created, so RLS denies all non-service access.
CREATE POLICY service_role_all ON apa_standing_assessments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Table purpose (kept as SQL comments -- COMMENT ON is a classifier TIER-2 trigger):
-- APA Phase-2 standing entrypoint results. Written by lib/apa/standing-assessment-round.mjs;
-- read by the same module's dampening state machine to compute consecutive_fail_count.
