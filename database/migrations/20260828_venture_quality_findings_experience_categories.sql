-- Migration: widen venture_quality_findings_finding_category_check to accept the
-- 3 new experience-design categories.
-- SD: SD-LEO-FEAT-STAGE-EXPERIENCE-DESIGN-001
-- Date: 2026-08-28
--
-- finding-shape.js FINDING_CATEGORIES already accepts usability/accessibility/
-- journey_coherence (application-layer validation via validateFindingShape());
-- this migration brings the DB CHECK constraint on venture_quality_findings into
-- sync so a design-agent adapter run can actually persist a row in these
-- categories, not just pass the in-process shape check.
--
-- Additive-only: every existing accepted value stays accepted, so no existing
-- row or caller is affected.

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
    'usability', 'accessibility', 'journey_coherence'
  ));

COMMIT;
