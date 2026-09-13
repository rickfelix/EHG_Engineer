-- Migration: widen venture_quality_findings_finding_category_check to accept
-- accessibility, performance and responsive (this SD's own scope), plus
-- usability and journey_coherence for migration-order commutativity -- see
-- the second UPDATE note below.
-- SD: SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A
-- Date: 2026-09-13
--
-- PLAN-phase TESTING sub-agent queried the LIVE constraint directly and found it
-- accepts only the 10 base categories (npm_audit, secrets, lint, test_suite,
-- unit_test, e2e_test, uat_test, bug_report, uat_signoff, capability) --
-- 'accessibility' exists in finding-shape.js's code-level FINDING_CATEGORIES array
-- (added by the 20260828_venture_quality_findings_experience_categories.sql
-- migration together with usability/journey_coherence) but that migration was
-- never applied live. This SD's own functional need is narrowly accessibility,
-- performance, responsive -- usability/journey_coherence below are NOT this
-- child's scope, they exist purely so this migration and 20260828 converge to
-- the same result regardless of which applies last (see second UPDATE note).
--
-- Additive-only: every existing accepted value stays accepted, so no existing
-- row or caller is affected.
--
-- UPDATE 2026-09-13 (TESTING sub-agent finding, EXEC phase): 20260828's own
-- CHECK-rebuild list was updated to include 'performance'/'responsive' too, so
-- if it is ever applied after this one it stays a superset of live state
-- instead of silently reverting these two values.
--
-- UPDATE 2026-09-13 (/ship adversarial review, CRITICAL): the fix above only
-- covers ONE application order (20260828 applied after this one, matching the
-- actual production history where 20260828 was authored earlier but never
-- applied). It does NOT cover the standard/default order -- 20260828 applied
-- FIRST by filename/chronological order, as any migration runner replaying
-- pending files on a fresh database (CI, a new dev environment, disaster
-- recovery) would do. In that order, this migration's own DROP+ADD ran SECOND
-- and its list (originally accessibility/performance/responsive only) would
-- silently remove 'usability'/'journey_coherence' that 20260828 had just
-- added -- both still live-written by lib/eva/experience-review/persist.js.
-- Neither migration reads pg_constraint to union with the live value set, so
-- the two are not naturally commutative; the only fix available to a static
-- hardcoded list is for EACH migration to independently rebuild to the FULL
-- union of every category either one needs, so whichever applies last always
-- converges to the same complete set regardless of order. Added
-- 'usability'/'journey_coherence' here to close that direction too.

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
    'usability', 'accessibility', 'journey_coherence',
    'performance', 'responsive'
  ));

COMMIT;
