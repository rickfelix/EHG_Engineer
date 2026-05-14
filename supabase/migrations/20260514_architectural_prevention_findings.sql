-- SD-LEO-PROTOCOL-POCOCK-PATTERNS-ORCH-001-D (Child D of Pocock orchestrator)
-- Persistent backlog of RCA-derived deepening candidates.
-- @approved-by: rickfelix@example.com

CREATE TABLE IF NOT EXISTS public.architectural_prevention_findings (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_rca_id               uuid NOT NULL,
  source_sd_key               text,
  finding                     text NOT NULL,
  suggested_deepening         text,
  weekly_report_consumed_at   timestamptz,
  deleted_at                  timestamptz,
  metadata                    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

-- Partial index: cron reads ONLY (deleted_at IS NULL AND weekly_report_consumed_at IS NULL).
CREATE INDEX IF NOT EXISTS idx_arch_prev_unconsumed
  ON public.architectural_prevention_findings (created_at)
  WHERE (deleted_at IS NULL AND weekly_report_consumed_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_arch_prev_source_rca
  ON public.architectural_prevention_findings (source_rca_id);

CREATE INDEX IF NOT EXISTS idx_arch_prev_source_sd
  ON public.architectural_prevention_findings (source_sd_key);

ALTER TABLE public.architectural_prevention_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY arch_prev_authenticated_read ON public.architectural_prevention_findings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY arch_prev_service_write ON public.architectural_prevention_findings
  FOR ALL TO service_role USING (true) WITH CHECK (true);
