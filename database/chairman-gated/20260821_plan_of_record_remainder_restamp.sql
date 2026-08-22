-- @approved-by: codestreetlabs@gmail.com
-- approval-note: chairman verbal "A all" at terminal 2026-08-22 ~22:17Z (5-file evening packet: retention idx, solomon attestations, owed_escalate drift, remainder restamp, plan-item-position grants); scribe adam-0549d739
-- SD-LEO-INFRA-REMAINDER-STATE-STAMPER-001 (FR-3)
--
-- One-time DATA restamp: re-derives remainder_state for every roadmap_wave_items row that has a
-- non-null promoted_to_sd_key, using the corrected stamp_plan_of_record_remainder_state() shipped
-- in database/migrations/20260821_stamp_plan_of_record_remainder_v2.sql. That migration MUST be
-- applied before this one -- this file only re-runs the (now-fixed) function against existing rows,
-- it does not itself change the function.
--
-- CHAIRMAN-GATED: this is a DATA UPDATE on live plan-of-record state, not a schema change. RISK
-- sub-agent flagged this SD's data-migration dimension CRITICAL (10/10) at LEAD phase specifically
-- because of this file. It is idempotent (pure re-derivation from current linked-work status --
-- running it twice produces the same result as running it once) and touches ONLY rows where
-- promoted_to_sd_key IS NOT NULL (non-promoted items are untouched, governed by the
-- disposition/lane branches which this SD does not change).
--
-- EXPECTED RESULT (re-measured live 2026-08-21 post-merge, BEFORE this migration runs -- verify
-- actual matches expected before trusting the outcome; superseded the original pre-merge count of
-- 17/14/2/1 -- one of the 3 originally-open linked SDs completed in the interim, which is exactly
-- the kind of population drift this file already treats as expected/fine, not a bug):
--   16 rows currently satisfied_elsewhere move to in_flight_or_sequence_blocked
--     (14 with a deferred-status linked SD, 2 draft; 0 active, 0 completed among them)
--   0 rows currently satisfied_elsewhere move to void (no cancelled/closed links among the 16)
--   0 rows currently in any other state change (0 QF-keyed promoted_to_sd_key values today, so
--     the QF-side branch this SD adds has nothing to restamp yet)
--
-- Run the BEFORE/AFTER report queries (commented, below) immediately before and after applying the
-- UPDATE, and confirm the delta matches the expected result above. A mismatch means either the
-- live population has changed since 2026-08-21 (a chairman-approved promotion/completion happened
-- in the interim -- expected and fine, note it) or the function rewrite has a bug (STOP, do not
-- proceed, escalate).

-- ============================================================
-- BEFORE report (run first, record the output)
-- ============================================================
-- SELECT remainder_state, count(*)
-- FROM roadmap_wave_items
-- WHERE promoted_to_sd_key IS NOT NULL
-- GROUP BY remainder_state
-- ORDER BY remainder_state;

BEGIN;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM roadmap_wave_items WHERE promoted_to_sd_key IS NOT NULL LOOP
    PERFORM stamp_plan_of_record_remainder_state(r.id);
  END LOOP;
END $$;

COMMIT;

-- ============================================================
-- AFTER report (run immediately after COMMIT, compare against BEFORE + the expected result above)
-- ============================================================
-- SELECT remainder_state, count(*)
-- FROM roadmap_wave_items
-- WHERE promoted_to_sd_key IS NOT NULL
-- GROUP BY remainder_state
-- ORDER BY remainder_state;
--
-- Specimen spot-check (picked from a DEFERRED-status linked SD, not draft/active, since a
-- deferred SD is the least likely of the three to change status between authoring this file and
-- running it -- a draft/active specimen already caused one false "mismatch" scare on the first
-- candidate row, whose linked SD went draft -> completed before this file was applied):
-- SELECT remainder_state FROM roadmap_wave_items WHERE id = 'd47b5edc-8128-4a51-ad7f-4949bcf4ea1a';
-- -- linked SD: SD-REFILL-00KK7VTR (status=deferred as of 2026-08-21)
-- -- expected: in_flight_or_sequence_blocked (was satisfied_elsewhere before this migration)
-- -- if it instead reads satisfied_elsewhere/void, first check whether SD-REFILL-00KK7VTR's status
-- -- changed in the interim (completed/cancelled) before treating this as a function bug

-- ============================================================
-- ROLLBACK PATH: since this is a pure re-derivation, re-running the SAME restamp loop after
-- reverting database/migrations/20260821_stamp_plan_of_record_remainder_v2.sql (via its own DOWN
-- section) restores the prior stamped values -- no separate rollback SQL is needed here.
-- ============================================================
