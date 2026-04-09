-- PCVP Emergency Bypass Fix: Widen sd_phase_handoffs CHECK constraints
-- SD: SD-LEO-PROTOCOL-PCVP-COMPLETION-INTEGRITY-001-A (follow-up chain: 4/?)
--
-- Chain context:
--   1. 20260409_fix_pcvp_emergency_bypass_allowlist.sql (merged PR #2872)
--   2. 20260409_fix_auto_validate_handoff_pcvp_bypass.sql (local)
--   3. 20260409_fix_bypass_insert_populate_not_null_columns.sql (local)
--   4. (this file) 20260409_fix_bypass_widen_phase_check_constraints.sql
--
-- Problem:
--   Smoke test of the bypass path raised 23514 (check_violation):
--     new row for relation "sd_phase_handoffs" violates check constraint
--     "sd_phase_handoffs_from_phase_check"
--   The bypass INSERT writes OLD.current_phase and NEW.current_phase directly.
--   The existing CHECK constraints on sd_phase_handoffs only accept the legacy
--   3-value vocabulary {LEAD, PLAN, EXEC}, but strategic_directives_v2.current_phase
--   has since expanded to include LEAD_APPROVAL, LEAD_COMPLETE, LEAD_FINAL,
--   LEAD_FINAL_APPROVAL, PLAN_PRD, EXEC_COMPLETE, COMPLETED, CANCELLED.
--   The bypass audit row for "LEAD_APPROVAL → COMPLETED" is therefore rejected.
--
--   Additionally, handoff_type's allowlist doesn't include 'BYPASS-COMPLETION',
--   which will be the next failure after from_phase/to_phase are fixed.
--
-- Fix:
--   Widen the three CHECK constraints to accept the full current phase vocabulary
--   and include BYPASS-COMPLETION as a valid handoff_type. This is ADDITIVE —
--   every existing row satisfies the legacy allowlist, so it automatically
--   satisfies the widened allowlist as well.
--
-- Verification:
--   Live survey confirms existing data only uses the legacy 3-value vocab,
--   so dropping + recreating these constraints is non-destructive.
--
-- Rollback: See bottom of file.

BEGIN;

-- ============================================================
-- 1. Widen from_phase allowlist
-- ============================================================
ALTER TABLE public.sd_phase_handoffs
  DROP CONSTRAINT IF EXISTS sd_phase_handoffs_from_phase_check;

ALTER TABLE public.sd_phase_handoffs
  ADD CONSTRAINT sd_phase_handoffs_from_phase_check
  CHECK (from_phase::text = ANY (ARRAY[
    'LEAD'::text,
    'PLAN'::text,
    'EXEC'::text,
    'PLAN_PRD'::text,
    'PLAN_VERIFICATION'::text,
    'EXEC_COMPLETE'::text,
    'LEAD_APPROVAL'::text,
    'LEAD_COMPLETE'::text,
    'LEAD_FINAL'::text,
    'LEAD_FINAL_APPROVAL'::text,
    'COMPLETED'::text,
    'CANCELLED'::text
  ]));

-- ============================================================
-- 2. Widen to_phase allowlist
-- ============================================================
ALTER TABLE public.sd_phase_handoffs
  DROP CONSTRAINT IF EXISTS sd_phase_handoffs_to_phase_check;

ALTER TABLE public.sd_phase_handoffs
  ADD CONSTRAINT sd_phase_handoffs_to_phase_check
  CHECK (to_phase::text = ANY (ARRAY[
    'LEAD'::text,
    'PLAN'::text,
    'EXEC'::text,
    'PLAN_PRD'::text,
    'PLAN_VERIFICATION'::text,
    'EXEC_COMPLETE'::text,
    'LEAD_APPROVAL'::text,
    'LEAD_COMPLETE'::text,
    'LEAD_FINAL'::text,
    'LEAD_FINAL_APPROVAL'::text,
    'COMPLETED'::text,
    'CANCELLED'::text
  ]));

-- ============================================================
-- 3. Widen handoff_type allowlist to include BYPASS-COMPLETION
-- ============================================================
ALTER TABLE public.sd_phase_handoffs
  DROP CONSTRAINT IF EXISTS sd_phase_handoffs_handoff_type_check;

ALTER TABLE public.sd_phase_handoffs
  ADD CONSTRAINT sd_phase_handoffs_handoff_type_check
  CHECK (handoff_type::text = ANY (ARRAY[
    'LEAD-TO-PLAN'::text,
    'PLAN-TO-EXEC'::text,
    'EXEC-TO-PLAN'::text,
    'PLAN-TO-LEAD'::text,
    'LEAD-FINAL-APPROVAL'::text,
    'BYPASS-COMPLETION'::text
  ]));

COMMIT;

-- ============================================================
-- ROLLBACK (run manually if needed)
-- ============================================================
-- BEGIN;
--   ALTER TABLE public.sd_phase_handoffs DROP CONSTRAINT sd_phase_handoffs_from_phase_check;
--   ALTER TABLE public.sd_phase_handoffs ADD CONSTRAINT sd_phase_handoffs_from_phase_check
--     CHECK (from_phase::text = ANY (ARRAY['LEAD'::text, 'PLAN'::text, 'EXEC'::text]));
--   ALTER TABLE public.sd_phase_handoffs DROP CONSTRAINT sd_phase_handoffs_to_phase_check;
--   ALTER TABLE public.sd_phase_handoffs ADD CONSTRAINT sd_phase_handoffs_to_phase_check
--     CHECK (to_phase::text = ANY (ARRAY['LEAD'::text, 'PLAN'::text, 'EXEC'::text]));
--   ALTER TABLE public.sd_phase_handoffs DROP CONSTRAINT sd_phase_handoffs_handoff_type_check;
--   ALTER TABLE public.sd_phase_handoffs ADD CONSTRAINT sd_phase_handoffs_handoff_type_check
--     CHECK (handoff_type::text = ANY (ARRAY[
--       'LEAD-TO-PLAN'::text, 'PLAN-TO-EXEC'::text, 'EXEC-TO-PLAN'::text,
--       'PLAN-TO-LEAD'::text, 'LEAD-FINAL-APPROVAL'::text
--     ]));
--   -- WARNING: rollback will fail if any BYPASS-COMPLETION rows exist.
-- COMMIT;
