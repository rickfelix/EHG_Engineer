-- Migration: Add factory_lane to quick_fixes table
-- Purpose: Structured, machine-readable marker for "coordinator-dispatch only,
--          not worker-self-claimable" quick-fixes. Previously this class of QF
--          (e.g. QF-20260712-481, routed through the venture machine) was
--          encoded ONLY as free text inside the description column
--          ("FACTORY-LANE: ..."), invisible to scripts/worker-checkin.cjs's
--          isAutoStartableQF() self-claim predicate, which self-claimed it
--          anyway.
-- Created: 2026-07-13
-- Related: SD-FDBK-FIX-DISPATCH-ELIGIBILITY-HONOR-001
-- @staged: additive, LEAD RISK-cleared as safe to apply live (not content-gated,
--          precedent 20260705_quick_fixes_not_before.sql on the same table) --
--          but the actual apply still requires the canonical authorized-apply
--          handshake (scripts/apply-migration.js --prod-deploy with either a
--          genuine chairman -- @approved-by: <email> header or a genuine
--          Adam-delegated -- @delegated-by: adam token apply), which a LEO
--          fleet worker session cannot self-stamp. A human/coordinator/Adam
--          must run the apply (+ the QF-20260712-481 backfill below) after
--          this PR merges.

BEGIN;

-- Structured factory-lane marker (default false = no behavior change for any
-- pre-existing row not explicitly marked).
ALTER TABLE quick_fixes
ADD COLUMN IF NOT EXISTS factory_lane BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN quick_fixes.factory_lane IS
  'Structured marker: TRUE means this quick-fix is coordinator-dispatch-only
   (e.g. routes through the venture machine) and must be excluded from worker
   self-claim (scripts/worker-checkin.cjs isAutoStartableQF()). Default false.';

COMMIT;

-- Rollback:
-- ALTER TABLE quick_fixes DROP COLUMN IF EXISTS factory_lane;
