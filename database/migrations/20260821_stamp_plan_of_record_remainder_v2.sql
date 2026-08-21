-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-REMAINDER-STATE-STAMPER-001
--
-- Fixes stamp_plan_of_record_remainder_state() (database/migrations/20260719a_...): it resolved
-- promoted_to_sd_key ONLY against strategic_directives_v2, and treated ANY non-cancelled linked-SD
-- status as satisfied_elsewhere. Two consequences, both live-measured at LEAD phase:
--   1. A QF- prefixed key never matches strategic_directives_v2, so it ALWAYS fell through to
--      satisfied_elsewhere -- the void branch was unreachable for QF keys. 0 roadmap_wave_items
--      rows currently hold a QF-prefixed promoted_to_sd_key, so this half is preventive.
--   2. A link to a live-but-not-done SD (draft/active/in_progress/etc.) ALSO stamped
--      satisfied_elsewhere -- provenance (having a link) was conflated with acceptance (the linked
--      work being done). 17 roadmap_wave_items rows are currently mis-stamped this way (14 with a
--      deferred-status linked SD, 2 draft, 1 active; 0 completed among them). Specimen:
--      roadmap_wave_items.id=6527a6e3-4df7-4b0f-a74b-f2bdf808c16e, linked to
--      SD-LEO-INFRA-VENTURE-JOURNEY-UAT-001 (status=draft).
--
-- Chairman ruling A (2026-08-19) decision, encoded here: the link is PROVENANCE and must not, by
-- itself, produce an acceptance state. Acceptance (satisfied_elsewhere) requires the linked work to
-- be in a terminal-satisfied state (SD/QF status=completed); a cancelled/closed link is void;
-- anything else is in_flight_or_sequence_blocked -- reusing the EXISTING CHECK-constraint value (no
-- new enum), since 4 existing consumers already hard-code that exact non-terminal triple.
--
-- This migration ships the function rewrite + a new quick_fixes-side restamp trigger only. The
-- one-time DATA restamp of the 17 already-mis-stamped rows is a SEPARATE, chairman-gated migration
-- (database/chairman-gated/20260821_plan_of_record_remainder_restamp.sql) -- RISK sub-agent flagged
-- the data-migration dimension CRITICAL (10/10) at LEAD phase; this file contains no data UPDATE.
--
-- Additive/replace-only: CREATE OR REPLACE FUNCTION, one new CREATE TRIGGER. No column/constraint
-- changes (roadmap_wave_items_remainder_state_check is untouched). Reversible via the DOWN section
-- at the bottom (manual paste, not auto-run).

BEGIN;

-- Rewritten stamp function. Non-promoted-item branches (dropped/dedup/decline/chairman-gated/
-- blocked-on-*/deferred/default) are copied verbatim from 20260719a -- untouched by this SD.
CREATE OR REPLACE FUNCTION stamp_plan_of_record_remainder_state(p_item_id uuid)
RETURNS void AS $$
DECLARE
  v_disposition text;
  v_lane text;
  v_promoted_sd_key text;
  v_linked_status text;
  v_state text;
BEGIN
  SELECT item_disposition, lane, promoted_to_sd_key
    INTO v_disposition, v_lane, v_promoted_sd_key
  FROM roadmap_wave_items WHERE id = p_item_id;

  IF v_promoted_sd_key IS NOT NULL THEN
    -- Resolve against BOTH tables. An SD key and a QF key never collide (disjoint id spaces --
    -- SD keys are SD-* / QF keys are QF-YYYYMMDD-NNN), so at most one of the two SELECTs matches.
    SELECT status INTO v_linked_status
    FROM strategic_directives_v2 WHERE sd_key = v_promoted_sd_key;

    IF v_linked_status IS NULL THEN
      SELECT status INTO v_linked_status
      FROM quick_fixes WHERE id = v_promoted_sd_key;

      -- QF status vocabulary (live-verified 2026-08-21, n=1576): open, in_progress, completed,
      -- escalated, cancelled, closed. 'closed' covers duplicate_of/premise_unverified_stale/
      -- premise_resolved dispositions (scripts/coordinator-stale-qf-disposition-sweep.mjs) -- a
      -- decline outcome, grouped with cancelled. 'escalated' means the QF's work is now tracked as
      -- a separate SD; deliberately NOT chased via escalated_to_sd_id (out of scope, per plan) --
      -- the escalated QF itself stays non-terminal until ITS status says otherwise.
      IF v_linked_status IN ('cancelled', 'closed') THEN
        v_state := 'void';
      ELSIF v_linked_status = 'completed' THEN
        v_state := 'satisfied_elsewhere';
      ELSE
        -- Covers open/in_progress/escalated, any future QF status, AND a NULL v_linked_status
        -- (orphaned key matching neither table) -- conservative: never silently satisfied.
        v_state := 'in_flight_or_sequence_blocked';
      END IF;
    ELSIF v_linked_status = 'cancelled' THEN
      v_state := 'void';
    ELSIF v_linked_status = 'completed' THEN
      v_state := 'satisfied_elsewhere';
    ELSE
      -- Covers draft/active/in_progress/pending_approval/review/any future SD status.
      v_state := 'in_flight_or_sequence_blocked';
    END IF;
  ELSIF v_disposition = 'dropped' OR v_lane IN ('dedup', 'decline') THEN
    v_state := 'void';
  ELSIF v_lane = 'chairman-gated' THEN
    v_state := 'gated_on_chairman';
  ELSIF v_lane LIKE 'blocked-on-%' OR v_disposition = 'deferred' THEN
    v_state := 'in_flight_or_sequence_blocked';
  ELSE
    v_state := 'promotable_now';
  END IF;

  UPDATE roadmap_wave_items
  SET remainder_state = v_state,
      remainder_state_stamped_at = now(),
      remainder_state_stamped_by = 'stamp_plan_of_record_remainder_state'
  WHERE id = p_item_id;
END;
$$ LANGUAGE plpgsql;

-- New: quick_fixes-side restamp trigger, symmetric to the existing strategic_directives_v2-side
-- sd_cancel_restamp_remainder (20260719a) -- verified live (LEAD phase) to already fire on every
-- SD status change, not cancel-only, so it needs no redefinition here.
CREATE OR REPLACE FUNCTION trg_restamp_items_on_qf_status_change()
RETURNS trigger AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM stamp_plan_of_record_remainder_state(id)
    FROM roadmap_wave_items WHERE promoted_to_sd_key = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS qf_status_restamp_remainder ON quick_fixes;
CREATE TRIGGER qf_status_restamp_remainder
AFTER UPDATE OF status ON quick_fixes
FOR EACH ROW EXECUTE FUNCTION trg_restamp_items_on_qf_status_change();

COMMIT;

-- ============================================================
-- ROLLBACK PATH (manual paste if this migration needs to be reverted):
-- BEGIN;
-- DROP TRIGGER IF EXISTS qf_status_restamp_remainder ON quick_fixes;
-- DROP FUNCTION IF EXISTS trg_restamp_items_on_qf_status_change();
-- -- Restore the pre-SD function body (20260719a original):
-- CREATE OR REPLACE FUNCTION stamp_plan_of_record_remainder_state(p_item_id uuid)
-- RETURNS void AS $$
-- DECLARE
--   v_disposition text;
--   v_lane text;
--   v_promoted_sd_key text;
--   v_promoted_sd_status text;
--   v_state text;
-- BEGIN
--   SELECT item_disposition, lane, promoted_to_sd_key
--     INTO v_disposition, v_lane, v_promoted_sd_key
--   FROM roadmap_wave_items WHERE id = p_item_id;
--
--   IF v_promoted_sd_key IS NOT NULL THEN
--     SELECT status INTO v_promoted_sd_status
--     FROM strategic_directives_v2 WHERE sd_key = v_promoted_sd_key;
--
--     IF v_promoted_sd_status = 'cancelled' THEN
--       v_state := 'void';
--     ELSE
--       v_state := 'satisfied_elsewhere';
--     END IF;
--   ELSIF v_disposition = 'dropped' OR v_lane IN ('dedup', 'decline') THEN
--     v_state := 'void';
--   ELSIF v_lane = 'chairman-gated' THEN
--     v_state := 'gated_on_chairman';
--   ELSIF v_lane LIKE 'blocked-on-%' OR v_disposition = 'deferred' THEN
--     v_state := 'in_flight_or_sequence_blocked';
--   ELSE
--     v_state := 'promotable_now';
--   END IF;
--
--   UPDATE roadmap_wave_items
--   SET remainder_state = v_state,
--       remainder_state_stamped_at = now(),
--       remainder_state_stamped_by = 'stamp_plan_of_record_remainder_state'
--   WHERE id = p_item_id;
-- END;
-- $$ LANGUAGE plpgsql;
-- COMMIT;
