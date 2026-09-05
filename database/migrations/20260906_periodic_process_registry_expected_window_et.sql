-- =============================================================================
-- Migration: periodic_process_registry -- add expected_window_et (nullable jsonb)
-- SD: SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A (FR-6), spec docs/michael/02-SPEC.md v0.3 §1.5
-- Date: 2026-09-06
--
-- Additive, in the shape of the prior additive migrations on this table
-- (20260704b_/20260711_/20260713_). One nullable column:
--
--   expected_window_et jsonb NULL  -- {"start":"HH:MM","end":"HH:MM"} in America/New_York wall-clock
--
-- WHY: the Michael role seat is expected only inside its morning window (04:30-07:30 ET,
-- ratification 42111a33 Q7). Without a window the registry has only the binary
-- currently_expected_active, so the seat is either alarmed on all day (false OVERDUE for ~21
-- hours) or never watched (a blind spot). The watcher (scripts/periodic-liveness-watcher.mjs
-- evaluateRow) treats a row carrying this column as expected INSIDE the window and
-- INTENTIONALLY_DOWN outside it; rows with NULL are unchanged.
--
-- A CHECK pins the shape so a malformed window can never be read as "no window" (the
-- not_before fence lesson, QF-599: an object where a string was expected read as NaN).
--
-- Chairman-gated for prod-apply (Tier 3): the approved-by marker line is added only after
-- chairman sign-off. Dormant-but-safe: the seed script and the watcher both treat an absent
-- column as "no window".
-- =============================================================================

ALTER TABLE public.periodic_process_registry
  ADD COLUMN IF NOT EXISTS expected_window_et JSONB NULL;

ALTER TABLE public.periodic_process_registry
  DROP CONSTRAINT IF EXISTS periodic_process_registry_expected_window_et_shape_check;

ALTER TABLE public.periodic_process_registry
  ADD CONSTRAINT periodic_process_registry_expected_window_et_shape_check
  CHECK (
    expected_window_et IS NULL
    OR (
      jsonb_typeof(expected_window_et) = 'object'
      AND (expected_window_et->>'start') ~ '^[0-2][0-9]:[0-5][0-9]$'
      AND (expected_window_et->>'end')   ~ '^[0-2][0-9]:[0-5][0-9]$'
    )
  );

COMMENT ON COLUMN public.periodic_process_registry.expected_window_et IS
  'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A: optional expected-active window as {"start":"HH:MM","end":"HH:MM"} in America/New_York wall-clock. The liveness watcher treats the process as expected only inside the window and INTENTIONALLY_DOWN outside it; NULL = expected whenever currently_expected_active is true (prior behaviour).';

-- ── In-migration self-verification ───────────────────────────────────────────────────────────
-- Runs inside apply-migration's transaction; fleet-safe (unique synthetic process_key, cleaned up
-- before COMMIT). Proves: the column exists; a well-formed window is accepted; a malformed window
-- is rejected by the CHECK; NULL stays legal.
DO $verify$
DECLARE
  v_key TEXT := 'verify-expected-window-' || gen_random_uuid()::text;
  v_win JSONB;
  v_rejected BOOLEAN := false;
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'periodic_process_registry' AND column_name = 'expected_window_et'
  ), 'EXPECTED-WINDOW-ET: column was not added';

  INSERT INTO public.periodic_process_registry
    (process_key, display_name, owner, process_type, expected_interval_seconds, liveness_source, liveness_source_ref, session_bound, currently_expected_active, expected_window_et)
  VALUES
    (v_key, 'verify window', 'chairman-fleet', 'role_session', 1800, 'claude_sessions_heartbeat', '{"metadata_filter":{"role":"verify"}}'::jsonb, true, true, '{"start":"04:30","end":"07:30"}'::jsonb);
  SELECT expected_window_et INTO v_win FROM public.periodic_process_registry WHERE process_key = v_key;
  ASSERT v_win->>'start' = '04:30' AND v_win->>'end' = '07:30', 'EXPECTED-WINDOW-ET: well-formed window did not round-trip';

  BEGIN
    UPDATE public.periodic_process_registry SET expected_window_et = '{"start":"4:30am"}'::jsonb WHERE process_key = v_key;
  EXCEPTION WHEN check_violation THEN
    v_rejected := true;
  END;
  ASSERT v_rejected, 'EXPECTED-WINDOW-ET: malformed window was NOT rejected by the shape CHECK';

  UPDATE public.periodic_process_registry SET expected_window_et = NULL WHERE process_key = v_key;
  SELECT expected_window_et INTO v_win FROM public.periodic_process_registry WHERE process_key = v_key;
  ASSERT v_win IS NULL, 'EXPECTED-WINDOW-ET: NULL window is not accepted';

  DELETE FROM public.periodic_process_registry WHERE process_key = v_key;
  RAISE NOTICE 'EXPECTED-WINDOW-ET verify OK: column present, shape CHECK accepts HH:MM and rejects malformed, NULL legal.';
END
$verify$;

-- ROLLBACK: see the _DOWN companion (drops the CHECK, then the column). Additive + fully reversible.
