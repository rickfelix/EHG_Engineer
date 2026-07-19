-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001
-- Plan-of-record remainder view: v_plan_of_record_remainder with stamped remainder
-- states, all gauge consumers converged.
--
-- Incident: the roadmap "unpromoted" gauge aggregated ALL roadmap-item generations
-- (proposed + approved + active + completed + archived), so the ratified
-- plan-of-record's true remainder (6 items, live-verified) drowned under ~1495
-- dead-generation rows. A second, related bug: a cancelled-SD promotion left
-- item_disposition='pending', so cancelled work re-surfaced as "in-flight" for
-- weeks (W5: 135 items, 2026-06-20..24).
--
-- Additive-only: ADD COLUMN (nullable) + CREATE VIEW + triggers. No destructive
-- DDL, no schema mutation of existing columns. Reversible via the DOWN section
-- at the bottom of this file (manual paste, not auto-run).
--
-- Design: remainder_state is STAMPED (persisted columns, written by a trigger at
-- write-time), never inferred by each reader at read-time. This is the actual fix
-- for the "6-vs-9 divergence" class of bug -- prior consumers each re-derived
-- their own ad-hoc notion of "remaining" from raw columns, producing inconsistent
-- results. One canonical stamp function + two triggers (item write-path, and
-- linked-SD status-change) keep the stamp current; the view is a pure column
-- SELECT with zero computation.

BEGIN;

-- 1. Stamp storage (additive, nullable -- existing rows get NULL until backfilled
--    by the companion data migration).
ALTER TABLE roadmap_wave_items
  ADD COLUMN IF NOT EXISTS remainder_state text,
  ADD COLUMN IF NOT EXISTS remainder_state_stamped_at timestamptz,
  ADD COLUMN IF NOT EXISTS remainder_state_stamped_by text;

ALTER TABLE roadmap_wave_items DROP CONSTRAINT IF EXISTS roadmap_wave_items_remainder_state_check;
ALTER TABLE roadmap_wave_items ADD CONSTRAINT roadmap_wave_items_remainder_state_check
  CHECK (remainder_state IS NULL OR remainder_state IN (
    'promotable_now', 'gated_on_chairman', 'in_flight_or_sequence_blocked',
    'satisfied_elsewhere', 'void'
  ));

-- 2. Canonical stamp function -- the ONE place remainder_state is computed.
-- void: promoted_to_sd_key points at a CANCELLED SD (Solomon forecast issue #1
--   f8d8b0a1 -- a cancelled promotion must never read as remaining), OR the item
--   was explicitly declined (item_disposition='dropped', or lane IN
--   ('dedup','decline')).
-- satisfied_elsewhere: promoted_to_sd_key points at a live (non-cancelled) SD --
--   the need is already being met elsewhere, so it is not part of the remainder.
-- gated_on_chairman / in_flight_or_sequence_blocked / promotable_now: for
--   not-yet-promoted items, derived from lane/item_disposition.
CREATE OR REPLACE FUNCTION stamp_plan_of_record_remainder_state(p_item_id uuid)
RETURNS void AS $$
DECLARE
  v_disposition text;
  v_lane text;
  v_promoted_sd_key text;
  v_promoted_sd_status text;
  v_state text;
BEGIN
  SELECT item_disposition, lane, promoted_to_sd_key
    INTO v_disposition, v_lane, v_promoted_sd_key
  FROM roadmap_wave_items WHERE id = p_item_id;

  IF v_promoted_sd_key IS NOT NULL THEN
    SELECT status INTO v_promoted_sd_status
    FROM strategic_directives_v2 WHERE sd_key = v_promoted_sd_key;

    IF v_promoted_sd_status = 'cancelled' THEN
      v_state := 'void';
    ELSE
      v_state := 'satisfied_elsewhere';
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

-- 3. Write-path trigger: re-stamp whenever the classifying columns change.
-- Fires on the 3 columns the function reads -- does NOT fire on its own UPDATE
-- (that only touches remainder_state/_stamped_at/_stamped_by), so no recursion.
CREATE OR REPLACE FUNCTION trg_stamp_plan_of_record_remainder_state()
RETURNS trigger AS $$
BEGIN
  PERFORM stamp_plan_of_record_remainder_state(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS roadmap_wave_items_stamp_remainder ON roadmap_wave_items;
CREATE TRIGGER roadmap_wave_items_stamp_remainder
AFTER INSERT OR UPDATE OF item_disposition, lane, promoted_to_sd_key ON roadmap_wave_items
FOR EACH ROW EXECUTE FUNCTION trg_stamp_plan_of_record_remainder_state();

-- 4. Cross-table trigger: when a promoted item's target SD later flips to
-- cancelled, re-stamp the affected items (this is the exact W5 incident --
-- without this, the same staleness bug this SD fixes would simply recur one
-- layer up).
CREATE OR REPLACE FUNCTION trg_restamp_items_on_sd_cancel()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'cancelled' AND (OLD.status IS DISTINCT FROM 'cancelled') THEN
    PERFORM stamp_plan_of_record_remainder_state(id)
    FROM roadmap_wave_items WHERE promoted_to_sd_key = NEW.sd_key;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sd_cancel_restamp_remainder ON strategic_directives_v2;
CREATE TRIGGER sd_cancel_restamp_remainder
AFTER UPDATE OF status ON strategic_directives_v2
FOR EACH ROW EXECUTE FUNCTION trg_restamp_items_on_sd_cancel();

-- 5. The view itself -- scoped to approved waves only, pure column SELECT
-- (no computation), so no PostgREST count/head false-green trap applies to
-- any consumer that reads real columns.
DROP VIEW IF EXISTS v_plan_of_record_remainder;
CREATE OR REPLACE VIEW v_plan_of_record_remainder WITH (security_invoker = true) AS
SELECT
  rwi.id, rwi.wave_id, rwi.title, rwi.source_type, rwi.source_id,
  rwi.promoted_to_sd_key, rwi.item_disposition, rwi.lane, rwi.priority_rank,
  rwi.remainder_state, rwi.remainder_state_stamped_at, rwi.remainder_state_stamped_by,
  rwi.created_at, rwi.updated_at,
  rw.status AS wave_status, rw.sequence_rank AS wave_sequence_rank
FROM roadmap_wave_items rwi
JOIN roadmap_waves rw ON rw.id = rwi.wave_id
WHERE rw.status = 'approved';

-- RLS-safe grants -- REVOKE is load-bearing (both source tables carry a
-- permissive 'authenticated SELECT USING (true)' policy from their creation
-- migration, so RLS alone does not restrict this view). Mirrors
-- database/migrations/20260703_improvement_ledger_views.sql exactly.
REVOKE ALL ON v_plan_of_record_remainder FROM PUBLIC, anon, authenticated;
GRANT SELECT ON v_plan_of_record_remainder TO service_role;

COMMIT;

-- ============================================================
-- ROLLBACK PATH (manual paste if this migration needs to be reverted):
-- BEGIN;
-- DROP TRIGGER IF EXISTS sd_cancel_restamp_remainder ON strategic_directives_v2;
-- DROP FUNCTION IF EXISTS trg_restamp_items_on_sd_cancel();
-- DROP TRIGGER IF EXISTS roadmap_wave_items_stamp_remainder ON roadmap_wave_items;
-- DROP FUNCTION IF EXISTS trg_stamp_plan_of_record_remainder_state();
-- DROP FUNCTION IF EXISTS stamp_plan_of_record_remainder_state(uuid);
-- DROP VIEW IF EXISTS v_plan_of_record_remainder;
-- ALTER TABLE roadmap_wave_items DROP CONSTRAINT IF EXISTS roadmap_wave_items_remainder_state_check;
-- ALTER TABLE roadmap_wave_items DROP COLUMN IF EXISTS remainder_state_stamped_by;
-- ALTER TABLE roadmap_wave_items DROP COLUMN IF EXISTS remainder_state_stamped_at;
-- ALTER TABLE roadmap_wave_items DROP COLUMN IF EXISTS remainder_state;
-- COMMIT;
