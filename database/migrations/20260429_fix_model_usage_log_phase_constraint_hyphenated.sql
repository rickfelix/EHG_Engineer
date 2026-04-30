-- Migration: 20260429_fix_model_usage_log_phase_constraint_hyphenated
-- Issue: model_usage_log_phase_check rejects handoff phase strings that use
--        hyphens (PLAN-TO-LEAD, EXEC-TO-PLAN, LEAD-TO-PLAN, PLAN-TO-EXEC,
--        LEAD-FINAL). The 2026-04-26 migration (QF-20260425-002) added
--        completion/standalone values but omitted the canonical handoff
--        transition strings emitted by handoff.js.
-- RCA:   Two rejections in two days (EXEC-TO-PLAN logged 2026-04-27, PLAN-TO-LEAD
--        logged 2026-04-29) confirm ongoing enum drift. The handoff transition
--        names are defined in scripts/modules/handoff/phases.js and use hyphens.
-- Fix:   Rebuild the constraint including all hyphenated handoff phase strings.

ALTER TABLE model_usage_log
DROP CONSTRAINT IF EXISTS model_usage_log_phase_check;

ALTER TABLE model_usage_log
ADD CONSTRAINT model_usage_log_phase_check
CHECK (phase IN (
  -- Original allowlist
  'LEAD',
  'PLAN',
  'EXEC',
  'UNKNOWN',
  -- Completion/standalone (added 2026-04-26 per QF-20260425-002)
  'STANDALONE',
  'QF_COMPLETION',
  'SD_COMPLETION',
  'HANDOFF',
  'COMPLETE',
  -- Underscore sub-phase variants (added 2026-04-26)
  'LEAD_APPROVAL',
  'LEAD_FINAL_APPROVAL',
  'PLAN_DESIGN',
  'PLAN_VERIFY',
  'EXEC_IMPLEMENTATION',
  -- Hyphenated handoff transition strings (added 2026-04-29 — the missing set)
  'LEAD-TO-PLAN',
  'PLAN-TO-EXEC',
  'EXEC-TO-PLAN',
  'PLAN-TO-LEAD',
  'LEAD-FINAL'
));

COMMENT ON CONSTRAINT model_usage_log_phase_check ON model_usage_log IS
'Valid phase values for model usage tracking. Expanded 2026-04-29 to include hyphenated handoff transition strings (LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD, LEAD-FINAL) emitted by handoff.js. Previous expansion 2026-04-26 added completion/standalone values only.';
