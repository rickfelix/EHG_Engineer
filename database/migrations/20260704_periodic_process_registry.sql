-- =============================================================================
-- Migration: periodic_process_registry -- expected-periodic-process registry
-- SD: SD-LEO-INFRA-PERIODIC-PROCESS-LIVENESS-001 (FR-1)
-- Date: 2026-07-04
-- @approved-by: codestreetlabs@gmail.com
--
-- Solomon referent-audit cell [2]: periodic processes die silently as a CLASS
-- (the consultant generator died 2026-06-20, unnoticed ~2 weeks; role-session
-- crons die with their session with no freshness check). Fleet WORKERS already
-- have assessFleetActivity (lib/coordinator/fleet-quiescence.cjs) for aggregate
-- fleet quiescence; this registry covers individual non-worker periodic
-- processes against their own expected cadence.
--
-- liveness_source is the load-bearing design decision: role_session and
-- scheduler_round entries do NOT get a new last_fired_at write path -- they
-- are resolved at watch-time from the EXISTING signal (claude_sessions
-- .heartbeat_at / eva_scheduler_heartbeat.last_poll_at), per the binding
-- constraint against new heartbeat machinery for signals that already exist.
-- Only 'self_stamped' entries (standalone cron/generator scripts with no
-- existing signal) are written to via lib/periodic-liveness/stamp-last-fired.js.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.periodic_process_registry (
  process_key text PRIMARY KEY,
  display_name text NOT NULL,
  owner text,
  process_type text NOT NULL CHECK (process_type IN ('role_session', 'scheduler_round', 'standalone_cron', 'worker_class')),
  expected_interval_seconds integer NOT NULL CHECK (expected_interval_seconds > 0),
  grace_multiplier numeric NOT NULL DEFAULT 3 CHECK (grace_multiplier > 0),
  liveness_source text NOT NULL CHECK (liveness_source IN ('claude_sessions_heartbeat', 'eva_scheduler_heartbeat', 'self_stamped')),
  liveness_source_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  session_bound boolean NOT NULL DEFAULT false,
  currently_expected_active boolean NOT NULL DEFAULT true,
  last_fired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.periodic_process_registry IS
'Registry of expected periodic processes (role-session loops, eva-scheduler rounds,
standalone cron/generator scripts) with owner/interval/grace for the
watcher-of-watchers (scripts/periodic-liveness-watcher.mjs). Detection only --
remediation stays with the owning role (SD-LEO-INFRA-PERIODIC-PROCESS-LIVENESS-001).';

COMMENT ON COLUMN public.periodic_process_registry.liveness_source IS
'Where the watcher resolves last-fired from at watch-time: claude_sessions_heartbeat
(role-session loops -- resolve via liveness_source_ref against claude_sessions),
eva_scheduler_heartbeat (resolve via liveness_source_ref.instance_id against
eva_scheduler_heartbeat.last_poll_at), or self_stamped (this row''s own
last_fired_at, written only by lib/periodic-liveness/stamp-last-fired.js).';

COMMENT ON COLUMN public.periodic_process_registry.currently_expected_active IS
'False = intentionally stood-down (session_bound loop deliberately not running
right now); the watcher skips staleness evaluation entirely for such rows,
rendering INTENTIONALLY_DOWN rather than a false OVERDUE/UNVERIFIED flag.';

CREATE INDEX IF NOT EXISTS idx_periodic_process_registry_type
  ON public.periodic_process_registry (process_type);

ALTER TABLE public.periodic_process_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS periodic_process_registry_service_role ON public.periodic_process_registry;
CREATE POLICY periodic_process_registry_service_role
  ON public.periodic_process_registry
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Self-verification: fail the deploy if the table/columns/constraints did not land.
-- ---------------------------------------------------------------------------
DO $verify$
BEGIN
  ASSERT to_regclass('public.periodic_process_registry') IS NOT NULL,
    'periodic_process_registry table did not land';
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'periodic_process_registry' AND column_name = 'liveness_source'
  ), 'periodic_process_registry.liveness_source column missing';
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'periodic_process_registry' AND column_name = 'currently_expected_active'
  ), 'periodic_process_registry.currently_expected_active column missing';
END
$verify$;
