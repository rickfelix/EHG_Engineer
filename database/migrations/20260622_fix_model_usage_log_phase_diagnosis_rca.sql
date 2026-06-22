-- Migration: 20260622_fix_model_usage_log_phase_diagnosis_rca
-- SD: SD-REFILL-00WV9A45
-- @approved-by: rickfelix@example.com
--
-- Issue: model_usage_log_phase_check rejects 'DIAGNOSIS' (and 'RCA') — the phase
--        emitted when a github-agent / rca-agent style diagnostic sub-agent runs.
--        lib/llm/usage-logger.js writes caller-supplied phase RAW
--        (`phase: phase || 'UNKNOWN'` — NO normalizePhase), so a diagnosis run
--        inserting phase='DIAGNOSIS' violates the CHECK constraint (23514) and the
--        non-blocking usage logger silently drops the row → telemetry hole.
--        (scripts/track-model-usage.js is protected by normalizePhase()→UNKNOWN, but
--        that collapses diagnostic runs into UNKNOWN — fidelity loss, see ALLOWED_PHASES.)
--        Surfaced by github-agent during run wpvlmgl4d.
--
-- RCA:   6th expansion of this CHECK constraint, identical pattern to the prior
--        five (20260426 / 20260429-hyphenated / 20260511-LEAD_FINAL /
--        20260526-PROSPECTIVE_VALIDATION). track-model-usage.js + lib/llm/usage-logger.js
--        accept caller-supplied `phase` as free-form; the constraint is the canonical
--        enum and must be expanded each time a new caller emits a new phase string.
--        'DIAGNOSIS' is the ROOT CAUSE DIAGNOSIS phase (CLAUDE_PLAN.md Phase 3);
--        'RCA' is the rca-agent label.
--
-- Fix:   Re-add the enum constraint including 'DIAGNOSIS' and 'RCA'. Additive and
--        idempotent (DROP IF EXISTS + ADD); widens the allowlist only — never rejects
--        existing data, so it is safe to (re)apply.

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
  'LEAD_FINAL',
  -- Prospective sub-agent phases (added 2026-05-26 per QF-20260526-691)
  'PROSPECTIVE_VALIDATION',
  -- Diagnostic sub-agent phases (added 2026-06-22 per SD-REFILL-00WV9A45)
  -- Emitted by github-agent / rca-agent diagnostic runs (ROOT CAUSE DIAGNOSIS).
  -- usage-logger.js passes caller phase raw, so these MUST be in the enum or the
  -- non-blocking logger silently drops the row.
  'DIAGNOSIS',
  'RCA'
));

COMMENT ON CONSTRAINT model_usage_log_phase_check ON model_usage_log IS
'Valid phase values for model usage tracking. Expanded 2026-06-22 (SD-REFILL-00WV9A45) to add DIAGNOSIS and RCA — emitted by github-agent/rca-agent diagnostic sub-agent runs. lib/llm/usage-logger.js passes caller phase raw, so these labels must be in the enum or the non-blocking logger silently drops the row (telemetry hole).';

-- ROLLBACK:
-- ALTER TABLE model_usage_log DROP CONSTRAINT IF EXISTS model_usage_log_phase_check;
-- ALTER TABLE model_usage_log ADD CONSTRAINT model_usage_log_phase_check
--   CHECK (phase IN ('LEAD','PLAN','EXEC','UNKNOWN','STANDALONE','QF_COMPLETION',
--   'SD_COMPLETION','HANDOFF','COMPLETE','LEAD_APPROVAL','LEAD_FINAL_APPROVAL',
--   'PLAN_DESIGN','PLAN_VERIFY','EXEC_IMPLEMENTATION','LEAD-TO-PLAN','PLAN-TO-EXEC',
--   'EXEC-TO-PLAN','PLAN-TO-LEAD','LEAD-FINAL','LEAD_FINAL','PROSPECTIVE_VALIDATION'));
