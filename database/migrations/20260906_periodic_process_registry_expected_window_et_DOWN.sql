-- SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A (FR-6) — reverses
-- 20260906_periodic_process_registry_expected_window_et.sql by dropping the shape CHECK and the
-- column. Additive migration → clean reversal. After this DOWN runs, the watcher reads every row as
-- having no window (prior behaviour) and the seed writes rows without the field.

ALTER TABLE public.periodic_process_registry
  DROP CONSTRAINT IF EXISTS periodic_process_registry_expected_window_et_shape_check;

ALTER TABLE public.periodic_process_registry
  DROP COLUMN IF EXISTS expected_window_et;
