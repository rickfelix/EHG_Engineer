-- SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A / FR-6 follow-up (SECURITY finding SEC-M4, EXEC review).
-- The original shape CHECK used '^[0-2][0-9]:[0-5][0-9]$', which accepts '25:00'..'29:59'. Measured
-- against the live constraint: both pass, and the watcher's parser accepted them too, so a window
-- with start=25:00 reads as start=1500 minutes -- greater than any minute of the day -- and the row
-- grades as INTENTIONALLY_DOWN permanently with no alarm: the exact blind spot FR-6 exists to close.
-- This migration replaces the CHECK with an hour class of 00-23. Additive/idempotent: the column is
-- untouched, NULL stays legal, every well-formed window already stored still satisfies the new CHECK.
-- Chairman applies (Tier 3); the watcher parser was tightened in the same PR so the JS side refuses
-- an out-of-range hour whether or not this has been applied.

ALTER TABLE public.periodic_process_registry
  DROP CONSTRAINT IF EXISTS periodic_process_registry_expected_window_et_shape_check;

ALTER TABLE public.periodic_process_registry
  ADD CONSTRAINT periodic_process_registry_expected_window_et_shape_check
  CHECK (
    expected_window_et IS NULL
    OR (
      jsonb_typeof(expected_window_et) = 'object'
      AND (expected_window_et->>'start') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND (expected_window_et->>'end')   ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    )
  );

-- ── In-migration self-verification ───────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_key TEXT := 'verify-expected-window-et-hour-' || gen_random_uuid()::text;
  v_rejected BOOLEAN := false;
BEGIN
  INSERT INTO public.periodic_process_registry (process_key, expected_window_et)
    VALUES (v_key, '{"start":"04:30","end":"23:59"}'::jsonb);
  BEGIN
    UPDATE public.periodic_process_registry
      SET expected_window_et = '{"start":"25:00","end":"29:59"}'::jsonb
      WHERE process_key = v_key;
  EXCEPTION WHEN check_violation THEN
    v_rejected := true;
  END;
  ASSERT v_rejected, 'EXPECTED-WINDOW-ET: out-of-range hour 25:00 was NOT rejected by the tightened CHECK';
  DELETE FROM public.periodic_process_registry WHERE process_key = v_key;
END
$verify$;
