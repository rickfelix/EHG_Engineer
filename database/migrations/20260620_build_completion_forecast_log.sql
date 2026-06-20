-- SD-LEO-INFRA-BUILD-COMPLETION-FORECAST-001 (FR-2: assumption/forecast log)
--
-- Additive, DORMANT-until-applied: the forecaster persists each run here when the table exists,
-- and fail-soft dry-runs (compute + exec-email line still work) when it does not. Applying this
-- migration activates auditable forecast history + the FR-3 self-correction's prior-forecast read.
--
-- Apply (chairman-gated, per apply-migration 3-factor): --issue-token + --prod-deploy + the
-- `-- @approved-by:<git email>` header below.
-- @approved-by: <pending-chairman-approval>

CREATE TABLE IF NOT EXISTS build_completion_forecast_log (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- inputs (the assumptions, FR-2)
  build_pct                   numeric,        -- VDR build_pct snapshot at forecast time
  buildable_remaining         integer,        -- buildable caps not yet built
  velocity_per_day            numeric,        -- completed SDs/day (recent window)
  sourcing_per_day            numeric,        -- new claimable buildable SDs/day (recent window)
  queue_depth                 integer,        -- claimable buildable SDs available now
  caps_per_completion         numeric,        -- LEARNED param (FR-3), EWMA-adjusted each run
  assumptions                 jsonb NOT NULL DEFAULT '{}',  -- full input snapshot + windows
  -- output (the forecast)
  plateau                     boolean NOT NULL DEFAULT false,
  binding_constraint          text,           -- none|velocity|sourcing|plateau
  eta_days                    numeric,        -- null when plateau/unknown (never a false date)
  eta_date                    timestamptz,    -- null when plateau/unknown
  confidence                  text,           -- high|medium|low|none
  note                        text,
  -- self-correction (FR-3): scoring of the PRIOR run vs reality
  prior_forecast_id           uuid REFERENCES build_completion_forecast_log(id),
  signed_error_days           numeric,        -- + = progress faster than the prior forecast
  abs_error_days              numeric,
  -- provenance
  forecast_run_id             text,
  recorded_by                 text,           -- session id | 'adam' | 'cron'
  measured_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bcf_log_measured_at ON build_completion_forecast_log (measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_bcf_log_run_id ON build_completion_forecast_log (forecast_run_id);

ALTER TABLE build_completion_forecast_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bcf_log_read ON build_completion_forecast_log;
CREATE POLICY bcf_log_read ON build_completion_forecast_log
  FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS bcf_log_service_write ON build_completion_forecast_log;
CREATE POLICY bcf_log_service_write ON build_completion_forecast_log
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE build_completion_forecast_log IS 'SD-LEO-INFRA-BUILD-COMPLETION-FORECAST-001 FR-2/FR-3: append-only forecast runs + assumptions + prior-vs-actual error, for audit + self-correction. Dormant-safe: forecaster fail-soft dry-runs when absent.';
