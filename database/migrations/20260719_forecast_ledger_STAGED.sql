-- @chairman-gated: creates an RLS-enabled table with policies — apply is chairman-gated
-- (outside the additive-no-rls delegated-apply scope). STAGED filename => not auto-applied.
-- SD-LEO-FEAT-FORECAST-LEDGER-001: Forecast Ledger org-service.
-- Immutable, pre-registered probabilistic forecasts, Brier-scored on resolution, attached as
-- ADVISORY-WEIGHT evidence to kill-gate briefs. Additive CREATE TABLE + RLS-at-create + a
-- sealed-immutability UPDATE guard, all in ONE migration.

CREATE TABLE IF NOT EXISTS public.forecast_ledger (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question            text        NOT NULL,
  question_class      text        NOT NULL,                 -- calibration grouping (domain)
  p                   numeric     NOT NULL CHECK (p >= 0 AND p <= 1),
  horizon             text,                                  -- e.g. '30d', 'by 2026-08-30'
  resolution_criteria text        NOT NULL,
  model               text,                                  -- model/agent that produced the forecast
  status              text        NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolved_outcome    boolean,                               -- NULL until resolved
  brier_score         numeric,                               -- NULL until resolved: (p - outcome)^2
  registered_by       text,
  registered_at       timestamptz NOT NULL DEFAULT now(),
  resolved_by         text,
  resolved_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_forecast_ledger_question_class ON public.forecast_ledger (question_class);
CREATE INDEX IF NOT EXISTS idx_forecast_ledger_status         ON public.forecast_ledger (status);

ALTER TABLE public.forecast_ledger ENABLE ROW LEVEL SECURITY;

-- Writes are service-role only; advisory evidence is broadly readable (SELECT) by authenticated.
CREATE POLICY forecast_ledger_service_all ON public.forecast_ledger
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY forecast_ledger_read ON public.forecast_ledger
  FOR SELECT TO authenticated USING (true);

-- Sealed pre-registration: once a row exists its registered fields are immutable; only the
-- resolution columns may change, and only on the open->resolved transition (no re-resolve).
CREATE OR REPLACE FUNCTION public.forecast_ledger_seal_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.question            IS DISTINCT FROM OLD.question
     OR NEW.question_class      IS DISTINCT FROM OLD.question_class
     OR NEW.p                   IS DISTINCT FROM OLD.p
     OR NEW.horizon             IS DISTINCT FROM OLD.horizon
     OR NEW.resolution_criteria IS DISTINCT FROM OLD.resolution_criteria
     OR NEW.model               IS DISTINCT FROM OLD.model
     OR NEW.registered_by       IS DISTINCT FROM OLD.registered_by
     OR NEW.registered_at       IS DISTINCT FROM OLD.registered_at THEN
    RAISE EXCEPTION 'forecast_ledger: sealed pre-registration — registered fields are immutable (id=%)', OLD.id;
  END IF;
  IF OLD.status = 'resolved' THEN
    RAISE EXCEPTION 'forecast_ledger: already resolved — cannot re-resolve (id=%)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS forecast_ledger_seal ON public.forecast_ledger;
CREATE TRIGGER forecast_ledger_seal BEFORE UPDATE ON public.forecast_ledger
  FOR EACH ROW EXECUTE FUNCTION public.forecast_ledger_seal_guard();
