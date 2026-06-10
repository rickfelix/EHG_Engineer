-- @approved-by:codestreetlabs@gmail.com
-- =============================================================================
-- SD-FDBK-INFRA-RECONCILE-LEO-FEATURE-001
-- leo_feature_flags registry integrity: reconcile is_enabled<->lifecycle_state
-- contradictions, enforce the coupling with a CHECK, and stop review-only
-- stamps (last_reviewed_at) from clobbering updated_at.
--
-- Live-verified defects (2026-06-10):
--   (1) 3 of 17 rows read is_enabled=true with lifecycle_state in (draft,disabled)
--       (COORDINATOR_TWOWAY_V2, COORD_ADAM_REVIEW_V1, FLAG_GOVERNANCE_REVIEW_V1).
--       lib/feature-flags/evaluator.js gates them OFF at runtime despite
--       is_enabled=true — the "registry lied" failure mode from the 2026-06-09
--       dormant-switch audit. All 3 are genuinely live (env/cron side channels),
--       so the reconcile direction is lifecycle_state -> 'enabled'. NOTE this is
--       an INTENDED behavioral change: the evaluator will gate them ON post-apply.
--   (2) ALL 17 rows share ONE updated_at: the daily flag-governance-review stamps
--       last_reviewed_at on every row, and the generic trigger_set_updated_at
--       (shared by triggers on FIVE tables) unconditionally bumps updated_at —
--       destroying change-detection on the registry.
--
-- Constraint form is the BICONDITIONAL is_enabled = (lifecycle_state='enabled'),
-- deliberately stronger than the implication form: getEnabledFlags
-- (lib/feature-flags/registry.js) filters on is_enabled ALONE, so a
-- (true, expired) row the weaker form permits would lie to it. The canonical
-- writer transitionLifecycleState always couples both fields (is_enabled =
-- newState==='enabled', including false for expired/archived), so no legitimate
-- writer is blocked. The two formerly-uncoupled writers (registry.js updateFlag,
-- scripts/eva/activate-rubric-v2.mjs setFlagEnabled) are coupled in the same PR.
--
-- NO BEGIN/COMMIT here: scripts/apply-migration.js wraps the whole file in one
-- transaction. Rollback: 20260610_flag_registry_lifecycle_consistency_rollback.sql
-- (repoints the trigger back + drops the new fn and CHECK; the data reconcile is
-- NOT reverted — it matches reality).
-- =============================================================================

-- ── 1. Reconcile the 3 contradictory rows (must precede the CHECK) ──────────
-- Assert-guarded: abort if the live state drifted from the verified snapshot.
DO $$
DECLARE
  fixed integer;
BEGIN
  UPDATE leo_feature_flags
     SET lifecycle_state = 'enabled'
   WHERE is_enabled = true
     AND lifecycle_state IN ('draft', 'disabled');
  GET DIAGNOSTICS fixed = ROW_COUNT;
  IF fixed <> 3 THEN
    RAISE EXCEPTION 'reconcile expected exactly 3 contradictory rows, found % — live state drifted; re-verify before applying', fixed;
  END IF;
END $$;

-- ── 2. Enforce the invariant ─────────────────────────────────────────────────
-- lifecycle_state is NOT NULL DEFAULT 'enabled' (verified live), so no NULL arm.
ALTER TABLE leo_feature_flags
  ADD CONSTRAINT chk_flag_lifecycle_enabled_consistency
  CHECK (is_enabled = (lifecycle_state = 'enabled'));

COMMENT ON CONSTRAINT chk_flag_lifecycle_enabled_consistency ON leo_feature_flags IS
  'SD-FDBK-INFRA-RECONCILE-LEO-FEATURE-001: is_enabled and lifecycle_state cannot diverge. Biconditional (not implication) because getEnabledFlags filters on is_enabled alone. Writers must couple both fields (see registry.js computeCoupledLifecycleState / transitionLifecycleState).';

-- ── 3. Review-aware updated_at trigger for THIS table only ──────────────────
-- The generic trigger_set_updated_at() is shared by triggers on 5 tables
-- (constitutional_amendments, leo_feature_flag_policies, leo_feature_flags,
-- leo_kill_switches, strategic_themes) and MUST NOT change. This table-specific
-- function preserves OLD.updated_at when the row delta — excluding updated_at,
-- last_reviewed_at, and row_version — is empty (a review-only stamp).
-- row_version MUST be excluded: fn_increment_feature_flag_version (a separate
-- BEFORE UPDATE trigger) bumps it on every update, so without the exclusion the
-- delta would never be empty (and exclusion keeps this firing-order-independent).
-- jsonb - text[] drops the keys and automatically covers future columns.
CREATE OR REPLACE FUNCTION trigger_set_updated_at_flags_review_aware()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $fn$
DECLARE
  excluded text[] := ARRAY['updated_at', 'last_reviewed_at', 'row_version'];
  old_rest jsonb := to_jsonb(OLD) - excluded;
  new_rest jsonb := to_jsonb(NEW) - excluded;
BEGIN
  IF old_rest IS DISTINCT FROM new_rest THEN
    NEW.updated_at := now();           -- substantive change: bump as before
  ELSE
    NEW.updated_at := OLD.updated_at;  -- review-only stamp: preserve the signal
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS set_updated_at_leo_feature_flags ON leo_feature_flags;
CREATE TRIGGER set_updated_at_leo_feature_flags
  BEFORE UPDATE ON leo_feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at_flags_review_aware();

-- ── 4. Post-conditions (abort the transaction if anything is off) ───────────
DO $$
DECLARE
  violations integer;
  enabled_three integer;
BEGIN
  SELECT count(*) INTO violations
    FROM leo_feature_flags
   WHERE is_enabled <> (lifecycle_state = 'enabled');
  IF violations <> 0 THEN
    RAISE EXCEPTION 'post-condition failed: % rows still violate the invariant', violations;
  END IF;

  SELECT count(*) INTO enabled_three
    FROM leo_feature_flags
   WHERE flag_key IN ('COORDINATOR_TWOWAY_V2', 'COORD_ADAM_REVIEW_V1', 'FLAG_GOVERNANCE_REVIEW_V1')
     AND is_enabled = true
     AND lifecycle_state = 'enabled';
  IF enabled_three <> 3 THEN
    RAISE EXCEPTION 'post-condition failed: expected the 3 named flags at (true, enabled), found %', enabled_three;
  END IF;
END $$;
