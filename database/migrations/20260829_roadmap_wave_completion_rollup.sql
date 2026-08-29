-- @approved-by: codestreetlabs@gmail.com
-- QF-20260829-484: roadmap wave completion never rolls up.
--
-- Incident: on roadmap 3aa2f3e2, Wave 1B has ALL 17 items promoted with their SDs
-- status='completed' (JOIN roadmap_wave_items.promoted_to_sd_key ->
-- strategic_directives_v2.status), yet roadmap_waves.status stays 'approved' and
-- progress_pct stays stale (Wave 1 read 71 vs measured 75, Wave 3 read 20 vs
-- measured 75) -- both columns are write-orphaned (DDL default only, no writer
-- existed anywhere in the codebase). Any surface counting completed waves
-- renders 0 of 8 against a roadmap with one fully-shipped wave.
--
-- Fix: one canonical roll-up function (extent named literally in its own JOIN --
-- ALL items in roadmap_wave_items for a wave, matching the chairman's measured
-- JOIN, same discipline as v_plan_of_record_remainder's scoped WHERE) plus a
-- trigger that fires it whenever a promoted item's target SD's status changes --
-- mirrors the existing sd_cancel_restamp_remainder pattern
-- (20260719a_plan_of_record_remainder_view.sql) exactly, so this is additive,
-- not a rewrite of that trigger. Also backfills all existing waves once, using
-- the same idempotent function -- never a one-off, always re-runnable.

BEGIN;

-- 1. Canonical roll-up function -- the ONE place progress_pct/status are computed.
-- Never regresses an already-archived wave. Only advances status to 'completed'
-- when every item's promoted SD is 'completed'; leaves status alone otherwise
-- (proposed/approved/active transitions stay a human/process decision).
CREATE OR REPLACE FUNCTION roadmap_wave_rollup(p_wave_id uuid)
RETURNS void AS $$
DECLARE
  v_status text;
  v_total integer;
  v_completed integer;
  v_pct numeric(5,2);
BEGIN
  SELECT status INTO v_status FROM roadmap_waves WHERE id = p_wave_id;
  IF v_status IS NULL OR v_status = 'archived' THEN
    RETURN;
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE sd.status = 'completed')
    INTO v_total, v_completed
  FROM roadmap_wave_items rwi
  LEFT JOIN strategic_directives_v2 sd ON sd.sd_key = rwi.promoted_to_sd_key
  WHERE rwi.wave_id = p_wave_id;

  IF v_total = 0 THEN
    RETURN;
  END IF;

  v_pct := ROUND(100.0 * v_completed / v_total, 2);

  UPDATE roadmap_waves
  SET progress_pct = v_pct,
      status = CASE WHEN v_completed = v_total THEN 'completed' ELSE status END,
      updated_at = now()
  WHERE id = p_wave_id
    AND (progress_pct IS DISTINCT FROM v_pct
         OR (v_completed = v_total AND status <> 'completed'));
END;
$$ LANGUAGE plpgsql;

-- 2. Cross-table trigger: whenever a promoted item's target SD's status
-- changes, re-roll-up every wave that item belongs to.
CREATE OR REPLACE FUNCTION trg_roadmap_wave_rollup_on_sd_status()
RETURNS trigger AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM roadmap_wave_rollup(wave_id)
    FROM roadmap_wave_items WHERE promoted_to_sd_key = NEW.sd_key;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS roadmap_wave_rollup_on_sd_status ON strategic_directives_v2;
CREATE TRIGGER roadmap_wave_rollup_on_sd_status
AFTER UPDATE OF status ON strategic_directives_v2
FOR EACH ROW EXECUTE FUNCTION trg_roadmap_wave_rollup_on_sd_status();

-- 3. Backfill: bring every existing wave current now, via the same idempotent
-- function future SD-completion events will call.
DO $$
DECLARE v_id uuid;
BEGIN
  FOR v_id IN SELECT id FROM roadmap_waves LOOP
    PERFORM roadmap_wave_rollup(v_id);
  END LOOP;
END $$;

COMMIT;

-- ============================================================
-- ROLLBACK PATH (manual paste if this migration needs to be reverted):
-- BEGIN;
-- DROP TRIGGER IF EXISTS roadmap_wave_rollup_on_sd_status ON strategic_directives_v2;
-- DROP FUNCTION IF EXISTS trg_roadmap_wave_rollup_on_sd_status();
-- DROP FUNCTION IF EXISTS roadmap_wave_rollup(uuid);
-- COMMIT;
