-- Rollback for 20260614_fleet_worker_pulse.sql
-- Drops the additive telemetry table. No other object depends on it.
DROP TABLE IF EXISTS public.fleet_worker_pulse;
