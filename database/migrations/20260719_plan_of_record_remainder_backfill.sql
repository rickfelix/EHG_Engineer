-- @approved-by: codestreetlabs@gmail.com
-- SD-LEO-INFRA-PLAN-OF-RECORD-REMAINDER-VIEW-001
-- Data migration: backfill remainder_state for all existing roadmap_wave_items
-- rows via the canonical stamp_plan_of_record_remainder_state() function
-- (20260719_plan_of_record_remainder_view.sql). Idempotent -- re-running
-- re-stamps every row with the same deterministic result, never double-stamps
-- (each call OVERWRITES remainder_state/_stamped_at/_stamped_by for that row,
-- there is no append-only log to duplicate).
--
-- This formalizes the 2 items already hand-corrected 2026-07-19 (pre-dating
-- this column) plus the 206 items whose promoted_to_sd_key points at a
-- cancelled SD (the W5 class of bug) into durable, stamped, provenanced data --
-- the backfill reconstructs the correct state for both classes uniformly via
-- the same function EXEC uses for future writes, no special-casing needed.

DO $$
DECLARE
  v_total_before integer;
  v_stamped_before integer;
  v_total_after integer;
  v_void_after integer;
  v_satisfied_elsewhere_after integer;
  v_promotable_now_after integer;
  v_gated_on_chairman_after integer;
  v_in_flight_after integer;
  r RECORD;
BEGIN
  SELECT count(*) INTO v_total_before FROM roadmap_wave_items;
  SELECT count(*) INTO v_stamped_before FROM roadmap_wave_items WHERE remainder_state IS NOT NULL;

  FOR r IN SELECT id FROM roadmap_wave_items LOOP
    PERFORM stamp_plan_of_record_remainder_state(r.id);
  END LOOP;

  SELECT count(*) INTO v_total_after FROM roadmap_wave_items WHERE remainder_state IS NOT NULL;
  SELECT count(*) INTO v_void_after FROM roadmap_wave_items WHERE remainder_state = 'void';
  SELECT count(*) INTO v_satisfied_elsewhere_after FROM roadmap_wave_items WHERE remainder_state = 'satisfied_elsewhere';
  SELECT count(*) INTO v_promotable_now_after FROM roadmap_wave_items WHERE remainder_state = 'promotable_now';
  SELECT count(*) INTO v_gated_on_chairman_after FROM roadmap_wave_items WHERE remainder_state = 'gated_on_chairman';
  SELECT count(*) INTO v_in_flight_after FROM roadmap_wave_items WHERE remainder_state = 'in_flight_or_sequence_blocked';

  RAISE NOTICE 'plan_of_record_remainder backfill: % total rows, % stamped before -> % stamped after', v_total_before, v_stamped_before, v_total_after;
  RAISE NOTICE 'plan_of_record_remainder backfill partition: void=% satisfied_elsewhere=% promotable_now=% gated_on_chairman=% in_flight_or_sequence_blocked=%',
    v_void_after, v_satisfied_elsewhere_after, v_promotable_now_after, v_gated_on_chairman_after, v_in_flight_after;

  IF v_total_after < v_total_before THEN
    RAISE EXCEPTION 'plan_of_record_remainder backfill failed: % of % rows left unstamped', (v_total_before - v_total_after), v_total_before;
  END IF;
END $$;
