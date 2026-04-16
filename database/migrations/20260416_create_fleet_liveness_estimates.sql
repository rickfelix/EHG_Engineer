-- Migration: Create fleet_liveness_estimates table
-- SD: SD-LEO-INFRA-FLEET-LIVENESS-MONTE-001
-- Story: US-001
-- Purpose: Append-only, calibration-ready per-cycle Monte Carlo liveness
--          estimates for fleet workers. Each row is one observation of one
--          session at one point in time. `actual_liveness_t5` is back-filled
--          by the calibration loop 5 minutes after `observed_at` -- it is the
--          ONLY column that is permitted to be UPDATEd post-insert. All other
--          columns are immutable once written.
--
-- FK note: claude_sessions.session_id is TEXT (with UNIQUE constraint), not UUID.
--          PRD AC-1 said "UUID FK" but production schema is TEXT, so we match
--          production. This was verified via information_schema on 2026-04-16.

CREATE TABLE IF NOT EXISTS public.fleet_liveness_estimates (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          TEXT        NOT NULL
    REFERENCES public.claude_sessions(session_id) ON DELETE CASCADE,
  observed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  heartbeat_age_sec   INTEGER     NOT NULL,
  pid_alive           BOOLEAN     NOT NULL,
  port_open           BOOLEAN     NOT NULL,
  phase               TEXT        NOT NULL,
  scope_bucket        TEXT        NOT NULL,
  p_alive             NUMERIC(5,4) NOT NULL,
  p_alive_ci_low      NUMERIC(5,4) NOT NULL,
  p_alive_ci_high     NUMERIC(5,4) NOT NULL,
  mc_samples          INTEGER     NOT NULL,
  actual_liveness_t5  BOOLEAN     NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- AC-5 CHECK constraints: probabilities in [0,1], CI ordering, non-negative counts
  CONSTRAINT fleet_liveness_p_alive_range
    CHECK (p_alive >= 0 AND p_alive <= 1),
  CONSTRAINT fleet_liveness_ci_low_range
    CHECK (p_alive_ci_low >= 0 AND p_alive_ci_low <= 1),
  CONSTRAINT fleet_liveness_ci_high_range
    CHECK (p_alive_ci_high >= 0 AND p_alive_ci_high <= 1),
  CONSTRAINT fleet_liveness_ci_ordering
    CHECK (p_alive_ci_low <= p_alive AND p_alive <= p_alive_ci_high),
  CONSTRAINT fleet_liveness_mc_samples_nonneg
    CHECK (mc_samples >= 0),
  CONSTRAINT fleet_liveness_heartbeat_age_nonneg
    CHECK (heartbeat_age_sec >= 0)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fleet_liveness_session
  ON public.fleet_liveness_estimates (session_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_fleet_liveness_observed_at
  ON public.fleet_liveness_estimates (observed_at DESC);

-- Partial index for the calibration back-fill cron (rows still awaiting
-- t+5min ground truth). Keeps the cron's scan cost bounded regardless of
-- total table size.
CREATE INDEX IF NOT EXISTS idx_fleet_liveness_pending_backfill
  ON public.fleet_liveness_estimates (observed_at)
  WHERE actual_liveness_t5 IS NULL;

-- Table + column comments
COMMENT ON TABLE public.fleet_liveness_estimates IS
  'Append-only Monte Carlo liveness estimates per fleet worker per cycle. '
  'Feeds the calibration loop: actual_liveness_t5 is back-filled 5 minutes '
  'after observed_at by comparing predicted p_alive against ground truth.';

COMMENT ON COLUMN public.fleet_liveness_estimates.id IS
  'Surrogate PK for the observation.';
COMMENT ON COLUMN public.fleet_liveness_estimates.session_id IS
  'FK -> claude_sessions.session_id (TEXT, UNIQUE). ON DELETE CASCADE so '
  'pruning a session also prunes its estimates.';
COMMENT ON COLUMN public.fleet_liveness_estimates.observed_at IS
  'Wall-clock time of the observation. Drives the 5-minute calibration window.';
COMMENT ON COLUMN public.fleet_liveness_estimates.heartbeat_age_sec IS
  'Seconds since the session last heartbeated at observation time. Input feature.';
COMMENT ON COLUMN public.fleet_liveness_estimates.pid_alive IS
  'Whether the claimed PID was alive at observation time. Input feature.';
COMMENT ON COLUMN public.fleet_liveness_estimates.port_open IS
  'Whether the claimed session port was open at observation time. Input feature.';
COMMENT ON COLUMN public.fleet_liveness_estimates.phase IS
  'LEO phase the session reported (LEAD/PLAN/EXEC/etc). Input feature.';
COMMENT ON COLUMN public.fleet_liveness_estimates.scope_bucket IS
  'Coarse scope bucket for the work in-flight. Input feature for the MC model.';
COMMENT ON COLUMN public.fleet_liveness_estimates.p_alive IS
  'Posterior point estimate of P(session is alive). 4 decimal precision.';
COMMENT ON COLUMN public.fleet_liveness_estimates.p_alive_ci_low IS
  'Lower bound of the credible interval on p_alive. Enforced <= p_alive.';
COMMENT ON COLUMN public.fleet_liveness_estimates.p_alive_ci_high IS
  'Upper bound of the credible interval on p_alive. Enforced >= p_alive.';
COMMENT ON COLUMN public.fleet_liveness_estimates.mc_samples IS
  'Number of Monte Carlo samples that produced this estimate.';
COMMENT ON COLUMN public.fleet_liveness_estimates.actual_liveness_t5 IS 'Ground truth -- was the session actually alive 5 minutes after observed_at? Back-filled by the calibration loop. NULL until back-fill runs. This is the ONLY column permitted to be UPDATEd post-insert -- all others are immutable.';
COMMENT ON COLUMN public.fleet_liveness_estimates.created_at IS
  'Row creation timestamp. Distinct from observed_at so clock-skewed inserts '
  'are traceable.';

-- RLS
ALTER TABLE public.fleet_liveness_estimates ENABLE ROW LEVEL SECURITY;

-- Idempotent policy creation: drop-and-recreate so re-running the migration
-- doesn't error on duplicate policy names.
DROP POLICY IF EXISTS "service_role_all" ON public.fleet_liveness_estimates;
CREATE POLICY "service_role_all" ON public.fleet_liveness_estimates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_select" ON public.fleet_liveness_estimates;
CREATE POLICY "authenticated_select" ON public.fleet_liveness_estimates
  FOR SELECT TO authenticated USING (true);
