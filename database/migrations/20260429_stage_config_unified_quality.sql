-- Migration: Unify Stage 20 stage_config row to match canonical template
-- SD: SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-A
-- Date: 2026-04-29
--
-- Reconciles three divergent Stage 20 definitions (canonical templates /
-- legacy dispatcher / DB stage_config) into one canonical spec covering
-- 10 finding categories: npm_audit, secrets, lint, test_suite, unit_test,
-- e2e_test, uat_test, bug_report, uat_signoff, capability.
--
-- Pre-migration state (witnessed 2026-04-29):
--   stage_number=20, stage_name='User Testing', description='User acceptance testing'
--
-- Post-migration state:
--   stage_number=20, stage_name='Stage 20 Quality Gate',
--   description='Unified code review + QA + UAT (10 finding categories)'
--
-- Rollback: see 20260429_stage_config_unified_quality_rollback.sql

UPDATE stage_config
   SET stage_name  = 'Stage 20 Quality Gate',
       stage_key   = 'quality_gate',
       description = 'Unified code review + QA + UAT (10 finding categories: npm_audit, secrets, lint, test_suite, unit_test, e2e_test, uat_test, bug_report, uat_signoff, capability)'
 WHERE stage_number = 20;

-- Verification: SELECT stage_name, stage_key, description FROM stage_config WHERE stage_number = 20;
