-- solomon_advice_outcome_ledger — durable accuracy + cost-per-accepted-proposal instrument for Solomon.
-- SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-LEDGER-001 (FR-1).
-- One row per Solomon advisory/finding sent via the advisory lane (scripts/solomon-advisory.cjs).
-- Additive (new table) — no change to any existing table. Chairman-gated apply (requires_chairman_apply).
-- Mirrors the adam_adherence_ledger RLS pattern (service_role write / authenticated+service_role read).
-- @approved-by: codestreetlabs@gmail.com

CREATE TABLE IF NOT EXISTS solomon_advice_outcome_ledger (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisory_id     uuid,                             -- session_coordination row id for the advisory, if known
  correlation_id  text NOT NULL,                     -- idempotency key: payload.correlation_id from the advisory send
  sd_key          text,                              -- SD this advisory/finding relates to, if known at capture time
  proposal_summary text NOT NULL,                    -- the advisory body (or a summary of it)
  proposal_kind   text NOT NULL DEFAULT 'advisory'
                    CHECK (proposal_kind IN ('advisory', 'finding', 'consult_answer')),
  decision        text NOT NULL DEFAULT 'pending'
                    CHECK (decision IN ('pending', 'accepted', 'rejected', 'partial')),
  decision_by     text,                              -- coordinator|chairman|session id of the acting party
  decision_at     timestamptz,
  outcome         text NOT NULL DEFAULT 'unknown'
                    CHECK (outcome IN ('unknown', 'shipped_clean', 'reverted', 'caused_rework')),
  outcome_sd_key  text,                               -- downstream SD whose terminal status sets `outcome`
  outcome_ref     text,                               -- e.g. PR URL or CI run reference backing the outcome
  cost_tokens     bigint,
  cost_wall_ms    bigint,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (correlation_id)
);

CREATE INDEX IF NOT EXISTS idx_solomon_ledger_decision ON solomon_advice_outcome_ledger (decision);
CREATE INDEX IF NOT EXISTS idx_solomon_ledger_created ON solomon_advice_outcome_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_solomon_ledger_outcome_sd_key ON solomon_advice_outcome_ledger (outcome_sd_key) WHERE outcome_sd_key IS NOT NULL;

-- RLS: authenticated read; service_role full write (mirrors adam_adherence_ledger).
ALTER TABLE solomon_advice_outcome_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS solomon_advice_outcome_ledger_read ON solomon_advice_outcome_ledger;
CREATE POLICY solomon_advice_outcome_ledger_read ON solomon_advice_outcome_ledger
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS solomon_advice_outcome_ledger_service_write ON solomon_advice_outcome_ledger;
CREATE POLICY solomon_advice_outcome_ledger_service_write ON solomon_advice_outcome_ledger
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- updated_at trigger
CREATE OR REPLACE FUNCTION trg_solomon_advice_outcome_ledger_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_solomon_ledger_updated ON solomon_advice_outcome_ledger;
CREATE TRIGGER trg_solomon_ledger_updated BEFORE UPDATE ON solomon_advice_outcome_ledger
  FOR EACH ROW EXECUTE FUNCTION trg_solomon_advice_outcome_ledger_updated_at();

COMMENT ON TABLE solomon_advice_outcome_ledger IS 'Durable ledger of Solomon advisory/finding proposals, human decisions (accepted/rejected/partial), and downstream outcomes (SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-LEDGER-001). Powers the accuracy + cost-per-accepted-proposal rollup in fleet-dashboard.cjs. outcome is set from the ACTUAL downstream SD/CI result, never from Solomon''s self-report (CONST-002 proposer!=approver).';
