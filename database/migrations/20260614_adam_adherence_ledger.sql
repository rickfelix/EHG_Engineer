-- adam_adherence_ledger — durable store for Adam's recurring self-adherence audit.
-- SD-LEO-INFRA-AUTOMATED-RECURRING-ADAM-001 (Adam-autonomy child E, self-improving governance loop).
-- Minimal ADDITIVE table — no change to any existing table. One row per probe per audit run.
-- @approved-by: codestreetlabs@gmail.com

CREATE TABLE IF NOT EXISTS adam_adherence_ledger (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL,                 -- groups all probe rows from one review run
  probe           text NOT NULL,                 -- probe key (e.g. 'sourcing_cadence')
  duty            text NOT NULL,                 -- the governed Adam duty the probe maps to
  verdict         text NOT NULL CHECK (verdict IN ('pass', 'fail', 'unknown')),
  detail          text,                          -- human-readable evidence/rationale
  remediation_ref text,                          -- set when a fail/drift sourced a propose-only remediation
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adam_adherence_ledger_run ON adam_adherence_ledger (run_id);
CREATE INDEX IF NOT EXISTS idx_adam_adherence_ledger_created ON adam_adherence_ledger (created_at DESC);

-- RLS: authenticated read; service_role full write (mirrors the governance-table convention).
ALTER TABLE adam_adherence_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY adam_adherence_ledger_read ON adam_adherence_ledger
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY adam_adherence_ledger_service_write ON adam_adherence_ledger
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE adam_adherence_ledger IS 'Durable ledger of Adam recurring self-adherence audit runs/findings (SD-LEO-INFRA-AUTOMATED-RECURRING-ADAM-001). One row per probe per run; remediation_ref set when a fail sourced a propose-only remediation.';
