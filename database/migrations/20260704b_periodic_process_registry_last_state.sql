-- =============================================================================
-- Migration: periodic_process_registry.last_state -- per-episode OVERDUE dedup
-- SD: SD-LEO-INFRA-PERIODIC-PROCESS-LIVENESS-001
-- Date: 2026-07-04
-- @approved-by: codestreetlabs@gmail.com
--
-- Adversarial-review finding on this SD's own PR (#5562, CRITICAL): the original OVERDUE
-- session_coordination dedup checked "has this process_key EVER been flagged OVERDUE" with no
-- time bound -- a one-shot, non-resettable latch. Once any process was flagged once, it could
-- NEVER be re-flagged again, even after recovering and dying again months later for an unrelated
-- reason -- reproducing the exact "dies silently, unnoticed" failure class this SD exists to
-- prevent, one layer removed from where the original fix (this SD's core JS logic) was applied.
--
-- Fix: track the last OBSERVED state per row. emitOverdueSignal only fires on a genuine
-- transition INTO OVERDUE (previous last_state was NOT 'OVERDUE'), and the watcher persists
-- last_state after every evaluation regardless of outcome -- so a process that recovers (goes OK)
-- and later goes OVERDUE again is correctly re-flagged.
-- =============================================================================

ALTER TABLE public.periodic_process_registry
  ADD COLUMN IF NOT EXISTS last_state text;

COMMENT ON COLUMN public.periodic_process_registry.last_state IS
'The state (OK/OVERDUE/UNVERIFIED/INTENTIONALLY_DOWN) observed on the watcher''s most recent
evaluation of this row. Used to detect a genuine transition INTO OVERDUE (per-episode dedup) --
NOT a fixed-forever "has this ever been flagged" check, which was a real bug caught by
adversarial review on this SD''s own PR (#5562).';

-- ---------------------------------------------------------------------------
-- Self-verification.
-- ---------------------------------------------------------------------------
DO $verify$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'periodic_process_registry' AND column_name = 'last_state'
  ), 'periodic_process_registry.last_state column did not land';
END
$verify$;
