-- Migration: Hold-State Contract — violations log + quick_fixes stamp columns
-- SD: SD-LEO-INFRA-HOLD-STATE-CONTRACT-001
-- Purpose: (1) an observe-mode log of hold-state-contract violations (writes that would
--          be rejected once HOLD_STATE_CONTRACT_MODE=enforce is armed, but which proceed
--          unchanged while the default 'observe' mode is active); (2) additive
--          reason/owner/release_condition columns on quick_fixes so QF defer/reopen can
--          carry the full {reason, owner, review_at, release_condition} stamp (not_before
--          already exists as the review_at-equivalent).
-- All-additive (nullable columns, IF NOT EXISTS everywhere) -- TIER-1 auto-apply eligible.
-- Date: 2026-07-16

BEGIN;

-- ============================================================
-- 1. Table: hold_state_contract_violations
-- ============================================================
CREATE TABLE IF NOT EXISTS public.hold_state_contract_violations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surface           text NOT NULL,
  reason            text,
  owner             text,
  review_at         text,
  release_condition text,
  errors            jsonb NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hold_state_contract_violations IS
  'Observe-mode signal for SD-LEO-INFRA-HOLD-STATE-CONTRACT-001: one row per hold/fence/floor write that failed {reason,owner,review_at,release_condition} validation while HOLD_STATE_CONTRACT_MODE=observe (default) let the write proceed unchanged. review_at is stored as the caller-supplied raw text (not parsed) since an invalid/unparseable value is itself part of what a violation can look like. Accumulation here is the calibration signal reviewed before promoting any surface to enforce mode.';
COMMENT ON COLUMN public.hold_state_contract_violations.surface IS
  'Which of the 4 hold-state-contract surfaces produced this violation: sd_park | exec_boundary_hold | min_tier_rank | quick_fix_defer.';
COMMENT ON COLUMN public.hold_state_contract_violations.errors IS
  'Array of validateHoldStamp() error strings (e.g. ["reason is required"]).';

CREATE INDEX IF NOT EXISTS idx_hold_state_contract_violations_surface_created_at
  ON public.hold_state_contract_violations (surface, created_at DESC);

ALTER TABLE public.hold_state_contract_violations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hold_state_contract_violations_service_role ON public.hold_state_contract_violations;
CREATE POLICY hold_state_contract_violations_service_role
  ON public.hold_state_contract_violations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- No authenticated/anon policy by design -- written only by server-side writers
-- (lib/sd-park.js, scripts/defer-quick-fix.js, the exec_boundary_hold writer, the
-- min_tier_rank explicit-override path) running under service_role; least-privilege.

-- ============================================================
-- 2. quick_fixes: additive reason/owner/release_condition columns
--    (not_before already exists as the review_at-equivalent, added by
--    20260705_quick_fixes_not_before.sql)
-- ============================================================
ALTER TABLE public.quick_fixes
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS owner TEXT,
  ADD COLUMN IF NOT EXISTS release_condition TEXT;

COMMENT ON COLUMN public.quick_fixes.reason IS
  'Hold-state contract stamp (SD-LEO-INFRA-HOLD-STATE-CONTRACT-001): why this QF was deferred. NULL for QFs deferred before this column existed, or while HOLD_STATE_CONTRACT_MODE=observe let an incomplete stamp proceed.';
COMMENT ON COLUMN public.quick_fixes.owner IS
  'Hold-state contract stamp: who is accountable for reviewing/releasing this defer.';
COMMENT ON COLUMN public.quick_fixes.release_condition IS
  'Hold-state contract stamp: the condition under which this defer should be released, distinct from the time-based not_before.';

COMMIT;

-- Rollback:
-- DROP TABLE IF EXISTS public.hold_state_contract_violations;
-- ALTER TABLE public.quick_fixes DROP COLUMN IF EXISTS reason, DROP COLUMN IF EXISTS owner, DROP COLUMN IF EXISTS release_condition;
