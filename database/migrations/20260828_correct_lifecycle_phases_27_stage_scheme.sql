-- SD-LEO-INFRA-STAGE-RENUMBER-DRIFT-001 (FR-4) -- correct lifecycle_phases phase 6 to cover
-- all 27 stages (stage 27 was phase-less after the 2026-08-28 renumbering).
--
-- Pure DML, not DDL.
--
-- Live phase spans measured 2026-08-28 (SELECT phase_number, stages FROM lifecycle_phases):
--   1: [1,2,3,4,5]        2: [6,7,8,9]          3: [10,11,12]
--   4: [13,14,15,16]      5: [17,18,19,20,21,22]
--   6: [23,24,25,26]  <-- stale; only phase 6 changed by the renumbering (it inserted the new
--                         dedicated_venture_uat stage AT 23 and shifted the old 23-26 tail --
--                         Launch Readiness / Go Live / Post-Launch Review / Growth Playbook --
--                         to 24-27; phases 1-5 cover stages 1-22, entirely untouched by the
--                         renumbering, and are NOT modified here).
--
-- AFTER: phase 6 = [23,24,25,26,27] -- the new UAT gate plus the same 4 shifted stages, so
-- every one of the 27 live stages has exactly one phase membership again.
--
-- QF-20260828-273: this file's original ::jsonb cast never matched the live column type
-- (lifecycle_phases.stages is integer[], not jsonb) -- the merged file could never actually
-- apply ('column is of type integer[] but expression is of type jsonb'). The coordinator applied
-- the corrected integer[] form directly to the live DB on 2026-08-29 with post-apply
-- verification; this file is corrected here (UPDATE cast + the verify block's element-unnest,
-- unnest() for integer[] rather than jsonb_array_elements()) so a future replay/fresh-env apply
-- works.

BEGIN;

UPDATE lifecycle_phases
SET stages = ARRAY[23,24,25,26,27]::integer[]
WHERE phase_number = 6;

DO $$
DECLARE
  v_count INT;
  v_total_stages INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM lifecycle_phases
  WHERE phase_number = 6 AND stages = ARRAY[23,24,25,26,27]::integer[];

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: expected exactly 1 lifecycle_phases row with phase_number=6 and the corrected stages array, found %', v_count;
  END IF;

  -- Every stage 1..27 has exactly one phase membership, no orphan.
  SELECT COUNT(*) INTO v_total_stages
  FROM (SELECT unnest(stages) AS s FROM lifecycle_phases) t;

  IF v_total_stages <> 27 THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: expected 27 total stage memberships across all phases, found %', v_total_stages;
  END IF;
END $$;

COMMIT;
