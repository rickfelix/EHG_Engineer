-- Migration: widen venture_quality_findings_finding_category_check to the UNION of
-- every category two concurrent sibling SDs need, so neither regresses the other.
-- SD: SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-D
-- Date: 2026-09-13
--
-- Live-verified (complete, all-NOT-NULL-satisfied probe inserts, not an incomplete-row
-- inference) that the constraint currently accepts exactly 13 values: the 10 base
-- categories (npm_audit, secrets, lint, test_suite, unit_test, e2e_test, uat_test,
-- bug_report, uat_signoff, capability) plus accessibility, performance, responsive --
-- landed by sibling SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A's migration
-- 20260913_venture_quality_findings_capa_baseline_categories.sql. 'usability' and
-- 'journey_coherence' (needed by this SD's C3.1 experience-review pilot, originally
-- proposed by the now-superseded 20260828_venture_quality_findings_experience_categories.sql,
-- which was NEVER applied live) are still rejected.
--
-- This migration does NOT re-run 20260828 verbatim -- that file's value list (13
-- values: 10 base + usability/accessibility/journey_coherence) OMITS
-- performance/responsive and would silently regress -A's already-shipped categories
-- if applied after -A's migration. Instead this is the full UNION: 10 base + 5 named
-- (accessibility, performance, responsive, usability, journey_coherence) = 15 distinct
-- values total. Additive-only: every currently-accepted value stays accepted, so no
-- existing row or caller is affected regardless of merge order between this SD and -A.

BEGIN;

ALTER TABLE venture_quality_findings
  DROP CONSTRAINT IF EXISTS venture_quality_findings_finding_category_check;

ALTER TABLE venture_quality_findings
  ADD CONSTRAINT venture_quality_findings_finding_category_check
  CHECK (finding_category IN (
    'npm_audit', 'secrets', 'lint', 'test_suite',
    'unit_test', 'e2e_test',
    'uat_test', 'bug_report', 'uat_signoff',
    'capability',
    'accessibility', 'performance', 'responsive',
    'usability', 'journey_coherence'
  ));

COMMIT;
