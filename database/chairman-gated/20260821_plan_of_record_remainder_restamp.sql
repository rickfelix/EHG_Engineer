-- @approved-by: PENDING CHAIRMAN APPROVAL -- do not apply until reviewed and explicitly run
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
-- EXPECTED RESULT (live-measured 2026-08-21, BEFORE this migration runs -- verify actual matches
-- expected before trusting the outcome):
--   17 rows currently satisfied_elsewhere move to in_flight_or_sequence_blocked
--     (14 with a deferred-status linked SD, 2 draft, 1 active; 0 completed among them)
--   0 rows currently satisfied_elsewhere move to void (no cancelled/closed links among the 17)
--   0 rows currently in any other state change (there are 0 QF-keyed promoted_to_sd_key values
--     today, so the QF-side branch this SD adds has nothing to restamp)
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
-- Specimen spot-check:
-- SELECT remainder_state FROM roadmap_wave_items WHERE id = '6527a6e3-4df7-4b0f-a74b-f2bdf808c16e';
-- -- expected: in_flight_or_sequence_blocked (was satisfied_elsewhere before this migration)

-- ============================================================
-- ROLLBACK PATH: since this is a pure re-derivation, re-running the SAME restamp loop after
-- reverting database/migrations/20260821_stamp_plan_of_record_remainder_v2.sql (via its own DOWN
-- section) restores the prior stamped values -- no separate rollback SQL is needed here.
-- ============================================================
