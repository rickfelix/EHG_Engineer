-- Migration: 20260511_fix_model_usage_log_phase_lead_final_underscore
-- QF: QF-20260511-163
-- Closes feedback: 31c14ea3-eac7-4c97-9a3d-c8ad50367ee5
-- @approved-by: rickfelix@example.com
--
-- Issue: model_usage_log_phase_check rejects 'LEAD_FINAL' (underscore form).
--        The 20260429 migration added 'LEAD-FINAL' (hyphen handoff-type variant)
--        but missed the underscore internal phase-state name emitted by
--        scripts/modules/handoff/cli/execution-helpers.js:32 and used as a
--        state-machine value in scripts/hooks/phase-state-enforcement.js:42-44.
--
-- RCA:   Two-name asymmetry. The canonical handoff-type is 'LEAD-FINAL-APPROVAL'
--        (with dashes), the canonical internal phase-state name is 'LEAD_FINAL'
--        (with underscore). track-model-usage.js is invoked with the internal
--        phase-state name, not the handoff-type — so the underscore variant must
--        be enum-valid.
--
-- Fix:   Re-add the enum constraint with 'LEAD_FINAL' included.

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
  -- Hyphenated handoff transition strings (added 2026-04-29)
  'LEAD-TO-PLAN',
  'PLAN-TO-EXEC',
  'EXEC-TO-PLAN',
  'PLAN-TO-LEAD',
  'LEAD-FINAL',
  -- Underscore internal phase-state names (added 2026-05-11 per QF-20260511-163)
  -- Canonical per phase-state-enforcement.js:42-44 + execution-helpers.js:32
  'LEAD_FINAL'
));

COMMENT ON CONSTRAINT model_usage_log_phase_check ON model_usage_log IS
'Valid phase values for model usage tracking. Expanded 2026-05-11 (QF-20260511-163) to add LEAD_FINAL underscore internal phase-state name (sibling to LEAD-FINAL hyphenated handoff-type added 2026-04-29). track-model-usage.js callers pass internal phase-state names from execution-helpers.js / phase-state-enforcement.js, not handoff-type strings.';
