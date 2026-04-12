-- SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-082
-- Fix: Infrastructure SDs should not require user stories
-- Root cause: requires_user_stories=true causes false gate failures
-- for infrastructure/LEARN-FIX SDs (14+ occurrences across 3 patterns)
--
-- Patterns addressed:
--   PAT-HF-PLANTOEXEC-SD-DUALP (6 occurrences)
--   PAT-HF-PLANTOLEAD-SD-LEARN (3 occurrences)
--   PAT-AUTO-7b3e48a8 (3 occurrences)

UPDATE sd_type_validation_profiles
SET requires_user_stories = false,
    description = 'Infrastructure, CI/CD, environment config - PRD required but no E2E tests, deliverables, or user stories. 3 handoffs: LEAD-TO-PLAN, EXEC-TO-PLAN, PLAN-TO-LEAD.'
WHERE sd_type = 'infrastructure';
