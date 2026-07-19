-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001 (follow-up to
-- 20260719a_plan_of_record_remainder_view.sql)
--
-- Adversarial-review finding (PR #6300): trg_restamp_items_on_sd_cancel()
-- only re-stamped affected roadmap_wave_items when a linked SD transitioned
-- INTO 'cancelled', never on the reverse transition. If an SD is later
-- un-cancelled/reactivated (scripts/reactivate-sd.js, or a direct status
-- UPDATE), any item previously stamped 'void' because of that cancellation
-- would stay stuck 'void' forever -- the same staleness class this SD exists
-- to close, just recurring in the opposite direction.
--
-- Fix: widen the condition to fire on ANY status change (OLD.status IS
-- DISTINCT FROM NEW.status), not just transitions into 'cancelled'. The
-- stamp function already re-derives void vs. satisfied_elsewhere from
-- whatever the CURRENT linked-SD status is, so no special-casing by
-- direction is needed -- this is a pure widen, not new logic.
--
-- CREATE OR REPLACE FUNCTION is safe to re-run against a live function body
-- (unlike a view, a function has no append-only column-order constraint);
-- the existing trigger binding (sd_cancel_restamp_remainder, AFTER UPDATE OF
-- status) is untouched and does not need to be recreated.

CREATE OR REPLACE FUNCTION trg_restamp_items_on_sd_cancel()
RETURNS trigger AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM stamp_plan_of_record_remainder_state(id)
    FROM roadmap_wave_items WHERE promoted_to_sd_key = NEW.sd_key;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
