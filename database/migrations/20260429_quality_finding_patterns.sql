-- SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-F
-- quality_finding_patterns: cross-venture pattern aggregation table
-- Closes the Stage 20 quality loop by surfacing systemic issues that
-- recur across ventures, enabling platform-level remediation.

CREATE TABLE IF NOT EXISTS public.quality_finding_patterns (
  pattern_id        text PRIMARY KEY,
  finding_category  text NOT NULL,
  severity          text NOT NULL,
  check_name        text NOT NULL,
  venture_count     integer NOT NULL DEFAULT 0,
  sample_finding_ids uuid[] NOT NULL DEFAULT '{}',
  first_seen        timestamptz NOT NULL DEFAULT now(),
  last_seen         timestamptz NOT NULL DEFAULT now(),
  suggested_action  text NOT NULL,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT quality_finding_patterns_severity_check
    CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  CONSTRAINT quality_finding_patterns_category_check
    CHECK (finding_category IN (
      'npm_audit', 'secrets', 'lint', 'test_suite', 'unit_test',
      'e2e_test', 'uat_test', 'bug_report', 'uat_signoff', 'capability'
    )),
  CONSTRAINT quality_finding_patterns_venture_count_min
    CHECK (venture_count >= 3)
);

CREATE INDEX IF NOT EXISTS idx_quality_finding_patterns_category
  ON public.quality_finding_patterns (finding_category);
CREATE INDEX IF NOT EXISTS idx_quality_finding_patterns_severity
  ON public.quality_finding_patterns (severity);
CREATE INDEX IF NOT EXISTS idx_quality_finding_patterns_last_seen
  ON public.quality_finding_patterns (last_seen DESC);

ALTER TABLE public.quality_finding_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY quality_finding_patterns_service_role_all
  ON public.quality_finding_patterns
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY quality_finding_patterns_authenticated_read
  ON public.quality_finding_patterns
  FOR SELECT
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.update_quality_finding_patterns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS quality_finding_patterns_updated_at_trigger
  ON public.quality_finding_patterns;
CREATE TRIGGER quality_finding_patterns_updated_at_trigger
  BEFORE UPDATE ON public.quality_finding_patterns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_quality_finding_patterns_updated_at();
