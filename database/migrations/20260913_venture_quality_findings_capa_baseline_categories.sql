-- Migration: widen venture_quality_findings_finding_category_check to accept
-- accessibility, performance and responsive.
-- SD: SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A
-- Date: 2026-09-13
--
-- PLAN-phase TESTING sub-agent queried the LIVE constraint directly and found it
-- accepts only the 10 base categories (npm_audit, secrets, lint, test_suite,
-- unit_test, e2e_test, uat_test, bug_report, uat_signoff, capability) --
-- 'accessibility' exists in finding-shape.js's code-level FINDING_CATEGORIES array
-- (added by the 20260828_venture_quality_findings_experience_categories.sql
-- migration together with usability/journey_coherence) but that migration was
-- never applied live. This migration is scoped narrowly to what this child SD
-- actually needs -- accessibility, performance, responsive -- built against the
-- CURRENT LIVE 10-value baseline, independent of whether the 20260828 migration
-- (usability/journey_coherence, a different SD's scope) is ever applied.
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
    'accessibility', 'performance', 'responsive'
  ));

COMMIT;
