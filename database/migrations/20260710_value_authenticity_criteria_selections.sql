-- Weakest-link evidence propagation ledger (SD-LEO-INFRA-VALUE-AUTHENTICITY-SPEC-002).
-- Records, per spec-authored FR, which library criterion was selected and its
-- EFFECTIVE grade (= MIN(canonical_grade, computed_weakest_link_grade)) so a
-- confident spec can never launder a weak domain claim into a hard runtime
-- gate. RLS enabled from creation (SPEC-001's missing-RLS adversarial-review
-- finding is a standing lesson, applied here from the start).

CREATE TABLE IF NOT EXISTS value_authenticity_criteria_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_key TEXT NOT NULL,
  fr_id TEXT NOT NULL,
  criterion_id TEXT NOT NULL REFERENCES value_authenticity_criteria_library(criterion_id),
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  domain_claims JSONB NOT NULL DEFAULT '[]'::jsonb,
  computed_weakest_link_grade TEXT NOT NULL CHECK (computed_weakest_link_grade IN ('E0', 'E1', 'E2', 'E3')),
  canonical_grade TEXT NOT NULL CHECK (canonical_grade IN ('E0', 'E1', 'E2', 'E3')),
  effective_grade TEXT NOT NULL CHECK (effective_grade IN ('E0', 'E1', 'E2', 'E3')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_value_authenticity_criteria_selections_sd_fr
  ON value_authenticity_criteria_selections (sd_key, fr_id);
CREATE INDEX IF NOT EXISTS idx_value_authenticity_criteria_selections_criterion
  ON value_authenticity_criteria_selections (criterion_id);

ALTER TABLE value_authenticity_criteria_selections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON value_authenticity_criteria_selections;
CREATE POLICY "service_role_all" ON value_authenticity_criteria_selections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_select" ON value_authenticity_criteria_selections;
CREATE POLICY "authenticated_select" ON value_authenticity_criteria_selections
  FOR SELECT TO authenticated USING (true);
