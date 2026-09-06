-- DOWN for 20260906_periodic_process_registry_expected_window_et_tighten_hour.sql: restore the
-- original (looser) shape CHECK. Does NOT drop the column; that is the base migration's DOWN.
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
