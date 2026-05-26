-- Migration: 20260526_fix_model_usage_log_phase_prospective_validation
-- QF: QF-20260526-691
-- Closes-feedback: d24bb6ea-91ef-4f29-97b8-ac2348f6b46b
-- @approved-by: rickfelix@example.com
--
-- Issue: model_usage_log_phase_check rejects 'PROSPECTIVE_VALIDATION' — the
--        phase emitted when a prospective testing/validation sub-agent runs
--        at LEAD (before LEAD-TO-PLAN handoff). The agent cannot record model
--        usage because the insert violates the CHECK constraint.
--
-- RCA:   Same pattern as the 4 prior CHECK-constraint expansions on this
--        column (20260425-002 / 20260426 / 20260429-hyphenated / 20260511-LEAD_FINAL).
--        track-model-usage.js + lib/llm/usage-logger.js accept caller-supplied
--        `phase` as free-form; the constraint is the canonical enum and must
--        be expanded each time a new caller emits a new phase string.
--        'PROSPECTIVE_VALIDATION' is the phase identifier for sub-agent runs
--        executed prospectively at LEAD (vs reactively in EXEC/VERIFY).
--
-- Fix:   Re-add the enum constraint including 'PROSPECTIVE_VALIDATION'.

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
  -- Emitted by sub-agents running prospectively at LEAD (e.g. prospective
  -- testing-agent at PLAN-TO-EXEC pre-check); see CLAUDE_PLAN.md
  -- "prospective-testing-agent at PLAN caught the blocker" pattern.
  'PROSPECTIVE_VALIDATION'
));

COMMENT ON CONSTRAINT model_usage_log_phase_check ON model_usage_log IS
'Valid phase values for model usage tracking. Expanded 2026-05-26 (QF-20260526-691) to add PROSPECTIVE_VALIDATION for sub-agents that run prospectively at LEAD (before LEAD-TO-PLAN handoff) — they emit a distinct phase label so the analytics can separate prospective evidence from reactive EXEC/VERIFY runs.';
