-- @approved-by: codestreetlabs@gmail.com
-- approval context: chairman directive 2026-06-14 — exec email shows hourly-averaged active workers
-- Migration: fleet_worker_pulse — 15-minute active-worker samples for the chairman exec email
--
-- WHAT THIS DOES (additive, zero-risk):
--   Creates fleet_worker_pulse: one row per 15-min sample of active-vs-not fleet workers,
--   written by scripts/fleet-worker-pulse.mjs. adam-exec-summary.mjs averages the last hour
--   of rows and rounds to a whole number for the "Workers: N active" headline. The pulse job
--   self-prunes old rows, so the table stays tiny (~24 rows live at the 6h retention default).
--
--   active_count = live genuine workers (heartbeat < 15 min)
--   total_count  = active + incognito (provisioned but quiet)
--   idle_count   = total - active
--
-- POSTURE: RLS ENABLED with no public policies — only the service_role (which bypasses RLS)
--   reads/writes it. This is a service-internal telemetry table; no anon/authenticated access.
--
-- Rollback: database/migrations/20260614_fleet_worker_pulse_DOWN.sql

CREATE TABLE IF NOT EXISTS public.fleet_worker_pulse (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at  timestamptz NOT NULL DEFAULT now(),
  active_count integer NOT NULL CHECK (active_count >= 0),
  total_count  integer NOT NULL CHECK (total_count  >= 0),
  idle_count   integer NOT NULL DEFAULT 0 CHECK (idle_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_fleet_worker_pulse_captured_at
  ON public.fleet_worker_pulse (captured_at DESC);

COMMENT ON TABLE public.fleet_worker_pulse IS
  '15-min active-vs-not fleet-worker samples; chairman exec email averages the last hour. SD: chairman exec-email redesign 2026-06-14.';

ALTER TABLE public.fleet_worker_pulse ENABLE ROW LEVEL SECURITY;
-- No policies: anon/authenticated get nothing; service_role bypasses RLS for the pulse job + email.

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'fleet_worker_pulse'
  ) THEN
    RAISE EXCEPTION 'fleet_worker_pulse was not created';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'fleet_worker_pulse' AND relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'fleet_worker_pulse RLS not enabled';
  END IF;
END
$verify$;
